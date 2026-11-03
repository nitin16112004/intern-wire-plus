import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import axios from 'axios';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  token: process.env.META_WA_TOKEN,
  phoneNumberId: process.env.PHONE_NUMBER_ID,
  verifyToken: process.env.META_VERIFY_TOKEN,
  appSecret: process.env.META_APP_SECRET || '',
  apiVersion: process.env.WA_API_VERSION || 'v26.0',
  parmar1: process.env.PARMAR_CONTACT_1 || '+91 9817392888',
  parmar2: process.env.PARMAR_CONTACT_2 || '+91 7807288728'
};

for (const k of ['databaseUrl', 'verifyToken']) {
  if (!cfg[k]) {
    console.error(`Missing required environment variable for "${k}". Check your .env / hosting settings.`);
    process.exit(1);
  }
}

const whatsappConfigured = Boolean(cfg.token && cfg.phoneNumberId && cfg.appSecret);
if (!whatsappConfigured) console.warn('[config] WhatsApp credentials incomplete; webhook POST disabled until configured.');

const AGENCY = 'Parmar Tour & Travels';
const REG_NO = '070624/41251';

const STOPS = [
  { id: 'shoolini_gate', title: 'Shoolini Main Gate', name: 'Shoolini University Main Gate', desc: 'Main campus entry gate' },
  { id: 'shoolini_hostel', title: 'Shoolini Hostel Area', name: 'Shoolini Hostel Area', desc: 'Hostels and student residences' },
  { id: 'oachghat', title: 'Oachghat Junction', name: 'Oachghat Junction', desc: 'Oachghat chowk' },
  { id: 'solan_mall', title: 'Solan Mall Road', name: 'Solan Mall Road', desc: 'Main market and Mall Road' },
  { id: 'solan_bypass', title: 'Solan Bypass Stand', name: 'Solan Bypass Stand', desc: 'Bypass bus stand' },
  { id: 'kumarhatti', title: 'Kumarhatti Junction', name: 'Kumarhatti Junction', desc: 'Kumarhatti junction' }
];
const stopById = (id) => STOPS.find((s) => s.id === id);

const ROLES = {
  role_student: 'Student',
  role_faculty: 'Faculty / Staff',
  role_resident: 'Resident / Visitor'
};

// ---------- Database ----------
const pool = new pg.Pool({
  connectionString: cfg.databaseUrl,
  ssl: cfg.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10
});
pool.on('error', (e) => console.error('[db] idle client error:', e.message));
const q = (text, params) => pool.query(text, params);

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.info('[db] schema ready');
}

async function upsertUser(phone) {
  const r = await q(
    `INSERT INTO users (phone, role, conversation_state)
     VALUES ($1, NULL, 'category_selection')
     ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
     RETURNING *`,
    [phone]
  );
  return r.rows[0];
}

async function setState(userId, state, data, role) {
  await q(
    `UPDATE users
        SET conversation_state = $2,
            conversation_data = $3::jsonb,
            role = COALESCE($4, role)
      WHERE id = $1`,
    [userId, state, JSON.stringify(data || {}), role || null]
  );
}

// ---------- WhatsApp Cloud API ----------
const graphUrl = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;
const headers = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };

async function wa(payload) {
  try {
    await axios.post(graphUrl, { messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }, { headers, timeout: 15000 });
  } catch (e) {
    console.error('[wa] send failed:', JSON.stringify(e.response?.data || e.message));
  }
}

const sendText = (to, body) => wa({ to, type: 'text', text: { body, preview_url: false } });

const sendButtons = (to, body, buttons) =>
  wa({
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) }
    }
  });

const sendList = (to, body, buttonLabel, rows) =>
  wa({
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [
          {
            title: 'Corridor stops',
            rows: rows.map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: (r.desc || '').slice(0, 72) }))
          }
        ]
      }
    }
  });

const markRead = (messageId) => wa({ status: 'read', message_id: messageId });

// ---------- Conversation flow ----------
const sendCategoryMenu = (to) =>
  sendButtons(
    to,
    `👋 Welcome to *Pinecity Commutes*!\nCab rides on the Shoolini University – Solan corridor, in partnership with ${AGENCY}.\n\nWho are you?`,
    [
      { id: 'role_student', title: 'Student' },
      { id: 'role_faculty', title: 'Faculty / Staff' },
      { id: 'role_resident', title: 'Resident / Visitor' }
    ]
  );

const sendPickupList = (to) =>
  sendList(to, '📍 Where should the cab pick you up?', 'Choose pickup', STOPS.map((stop) => ({ ...stop, id: `pickup_${stop.id}` })));

const sendDropList = (to, pickupId) =>
  sendList(
    to,
    `🏁 Pickup: *${stopById(pickupId).name}*\n\nWhere do you want to go?`,
    'Choose drop',
    STOPS.filter((s) => s.id !== pickupId).map((stop) => ({ ...stop, id: `drop_${stop.id}` }))
  );

const sendActionButtons = (to, pickupId, dropId) =>
  sendButtons(
    to,
    `🚕 *${stopById(pickupId).name}* → *${stopById(dropId).name}*\n\nHow would you like to travel?`,
    [
      { id: 'act_call', title: 'Call Driver Direct' },
      { id: 'act_hatch', title: 'Request Hatchback' },
      { id: 'act_sedan', title: 'Request Sedan' }
    ]
  );

const CAB_LABEL = { act_call: 'Direct call', act_hatch: 'Hatchback', act_sedan: 'Sedan' };

async function sendDriverContacts(to, pickupId, dropId, actionId) {
  const label = CAB_LABEL[actionId];
  const head =
    actionId === 'act_call'
      ? 'Please call the driver directly to book and agree on the fare:'
      : `Your *${label}* request is noted. Please call the driver directly to confirm the cab and the fare:`;
  await sendText(
    to,
    `✅ *Pinecity Commutes*\nRoute: ${stopById(pickupId).name} → ${stopById(dropId).name}\n\n${head}\n\n` +
      `👤 *Pankaj Parmar* – ${AGENCY}\n📞 ${cfg.parmar1}\n📞 ${cfg.parmar2}\n\n` +
      `Near Shoolini University, H.P. Tourism Regd: ${REG_NO}\n\n` +
      `Type *Hi* to book another ride or *SOS* for an emergency.`
  );
}

async function recordRide(user, pickupId, dropId, cabClass) {
  const routeKey = `${pickupId}>${dropId}`;
  const found = await q(
    `SELECT id FROM pooling_groups
      WHERE route_key = $1 AND cab_class = $2 AND closes_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [routeKey, cabClass]
  );
  let groupId = found.rows[0]?.id;
  if (!groupId) {
    const g = await q(
      `INSERT INTO pooling_groups (route_key, pickup_stop, destination_stop, cab_class, closes_at)
       VALUES ($1, $2, $3, $4, now() + interval '30 minutes') RETURNING id`,
      [routeKey, stopById(pickupId).name, stopById(dropId).name, cabClass]
    );
    groupId = g.rows[0].id;
  }
  await q(`INSERT INTO rides (group_id, user_id, status) VALUES ($1, $2, 'requested')`, [groupId, user.id]);
}

async function sendSos(to) {
  await sendText(
    to,
    `🚨 *EMERGENCY – SOS RECEIVED*\n\nPlease call *${AGENCY}* right now:\n📞 ${cfg.parmar1}\n\n` +
      `If you are in immediate danger, also dial *112* (Police / Emergency).\n` +
      `Stay where it is safe and share your live location with someone you trust.`
  );
}

function parseInput(message) {
  if (message.type === 'text') return { kind: 'text', text: (message.text?.body || '').trim() };
  if (message.type === 'interactive') {
    const i = message.interactive;
    const r = i?.button_reply || i?.list_reply;
    if (r) return { kind: 'action', id: r.id, text: r.title };
  }
  if (message.type === 'button') return { kind: 'action', id: message.button?.payload, text: message.button?.text };
  return { kind: 'other' };
}

async function handleMessage(message) {
  const to = message.from;
  const user = await upsertUser(to);
  const input = parseInput(message);
  const data = user.conversation_data || {};
  const lower = (input.text || '').toLowerCase();

  // Emergency always wins
  if (input.kind === 'text' && /\bsos\b/i.test(input.text)) return sendSos(to);

  // Greeting / restart / first contact: register instantly as verified, show categories
  if (
    input.kind === 'other' ||
    (input.kind === 'text' && /^(hi|hii|hello|hey|start|menu|restart|book|cab)\b/.test(lower))
  ) {
    await setState(user.id, 'category_selection', {});
    return sendCategoryMenu(to);
  }

  if (input.kind === 'action') {
    const id = input.id || '';

    if (ROLES[id]) {
      await setState(user.id, 'pickup_selection', {}, ROLES[id]);
      return sendPickupList(to);
    }

    if (id.startsWith('pickup_') && stopById(id.slice(7))) {
      const pickup = id.slice(7);
      await setState(user.id, 'drop_selection', { pickup });
      return sendDropList(to, pickup);
    }

    if (id.startsWith('drop_') && stopById(id.slice(5)) && data.pickup && id.slice(5) !== data.pickup) {
      const drop = id.slice(5);
      await setState(user.id, 'action_selection', { pickup: data.pickup, drop });
      return sendActionButtons(to, data.pickup, drop);
    }

    if (CAB_LABEL[id] && data.pickup && data.drop) {
      try {
        await recordRide(user, data.pickup, data.drop, CAB_LABEL[id]);
      } catch (e) {
        console.error('[db] recordRide failed:', e.message);
      }
      await sendDriverContacts(to, data.pickup, data.drop, id);
      return setState(user.id, 'completed', data);
    }
  }

  // Anything else: gently resume at the current step
  switch (user.conversation_state) {
    case 'pickup_selection':
      return sendPickupList(to);
    case 'drop_selection':
      return data.pickup ? sendDropList(to, data.pickup) : sendPickupList(to);
    case 'action_selection':
      return data.pickup && data.drop ? sendActionButtons(to, data.pickup, data.drop) : sendPickupList(to);
    default:
      await setState(user.id, 'category_selection', {});
      return sendCategoryMenu(to);
  }
}

// ---------- Express app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

function validSignature(req) {
  if (!cfg.appSecret) return false; // never accept unsigned webhooks
  const header = req.get('x-hub-signature-256') || '';
  if (!header.startsWith('sha256=') || !req.rawBody) return false;
  const expected = crypto.createHmac('sha256', cfg.appSecret).update(req.rawBody).digest();
  let given;
  try { given = Buffer.from(header.slice(7), 'hex'); } catch { return false; }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

app.get('/', (_req, res) => res.json({ service: 'Pinecity Commutes WhatsApp Bot', status: 'online', whatsapp_configured: whatsappConfigured }));

app.get('/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.json({ status: 'ok', whatsapp_configured: whatsappConfigured });
  } catch (e) {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === cfg.verifyToken) {
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.sendStatus(403);
});

app.post('/webhook', (req, res) => {
  if (!whatsappConfigured) return res.status(503).json({ error: 'whatsapp_not_configured' });
  if (!validSignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // Meta needs an immediate 200
  processEvents(req.body).catch((e) => console.error('[webhook] processing error:', e));
});

async function processEvents(body) {
  if (body?.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      for (const message of change.value?.messages || []) {
        if (!message.id) continue;
        const ins = await q(
          `INSERT INTO webhook_events (provider, event_id) VALUES ('meta', $1)
           ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
          [message.id]
        );
        if (ins.rowCount === 0) continue; // duplicate delivery
        markRead(message.id).catch(() => {});
        try {
          await handleMessage(message);
        } catch (e) {
          console.error(`[bot] failed handling ${message.id}:`, e);
        }
      }
    }
  }
}

app.use((err, _req, res, _next) => {
  console.error('[http] error:', err.message);
  res.status(400).json({ error: 'Bad request' });
});

// ---------- Boot ----------
const initOnly = process.argv.includes('--init-only');
await initDb();
if (initOnly) {
  await pool.end();
  process.exit(0);
}

const server = app.listen(cfg.port, () => console.info(`Pinecity Commutes bot listening on :${cfg.port}`));

const shutdown = (sig) => {
  console.info(`${sig} received, shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));