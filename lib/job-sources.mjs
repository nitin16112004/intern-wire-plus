const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_SOURCE_IDS = [
  "intern-wire",
  "simplify",
  "himalayas",
  "arbeitnow",
  "remotive",
  "remoteok",
  "jobicy",
];

export const SOURCE_FEED_URLS = {
  "intern-wire": "https://raw.githubusercontent.com/imajij/intern-wire/main/static/data.json",
  simplify: "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
  indeed: "https://in.indeed.com/jobs?q=intern&l=India&sort=date&fromage=7",
  naukri: "https://www.naukri.com/jobapi/v3/search",
  himalayas: "https://himalayas.app/jobs/api/search?country=IN&employment_type=Intern&sort=recent&page=1",
  arbeitnow: "https://www.arbeitnow.com/api/job-board-api",
  remotive: "https://remotive.com/api/remote-jobs?search=intern&limit=50",
  remoteok: "https://remoteok.com/api",
  jobicy: "https://jobicy.com/api/v2/remote-jobs?count=50&tag=intern",
};

const EARLY_CAREER_PATTERN = /\b(intern(?:ship)?|trainee|fresher|graduate|apprentice|student|entry[ -]?level|co[ -]?op)\b/i;
const DEFAULT_HEADERS = {
  accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  "user-agent": "InternWirePlus/2.0 (+https://github.com/nitin16112004/intern-wire-plus)",
};

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value) {
  if (value === null || value === undefined || value === "") return null;
  let parsed;
  if (typeof value === "number" || /^\d{10,13}$/.test(String(value))) {
    const numeric = Number(value);
    parsed = new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
  } else {
    parsed = new Date(value);
  }
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function relativeDate(label, now) {
  const text = String(label ?? "").toLowerCase();
  if (!text) return null;
  if (/just posted|today|few (?:minutes|hours)|hour/.test(text)) return now.toISOString();
  const match = text.match(/(\d+)\+?\s*(minute|hour|day|week|month)/);
  if (!match) return null;
  const unitMs = {
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
  }[match[2]];
  return new Date(now.getTime() - Number(match[1]) * unitMs).toISOString();
}

function isEarlyCareer(job) {
  return EARLY_CAREER_PATTERN.test(`${job.title ?? ""} ${job.description ?? ""} ${job.tags ?? ""}`);
}

async function request(url, {
  fetchImpl = fetch,
  headers = {},
  response = "json",
  method = "GET",
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const result = await fetchImpl(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
    method,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!result.ok) throw new Error(`HTTP ${result.status}`);
  return response === "text" ? result.text() : result.json();
}

function balancedJson(text, anchor) {
  const anchorIndex = text.indexOf(anchor);
  if (anchorIndex < 0) return null;
  const start = text.indexOf("{", anchorIndex + anchor.length);
  if (start < 0) return null;

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, index + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function parseIndeedSearch(html, { now = new Date(), baseUrl = "https://in.indeed.com" } = {}) {
  const data = balancedJson(
    html,
    'window.mosaic.providerData["mosaic-provider-jobcards"]=',
  );
  const results = data?.metaData?.mosaicProviderJobCardsModel?.results;
  if (!Array.isArray(results)) return [];

  return results.map((job) => {
    const key = String(job.jobkey ?? job.jobKey ?? "").trim();
    const title = String(job.displayTitle ?? job.title ?? "").trim();
    if (!key || !title) return null;
    return {
      id: `indeed-${key}`,
      source: "indeed",
      title,
      company: job.company ?? job.truncatedCompany ?? null,
      location: job.formattedLocation
        ?? ([job.jobLocationCity, job.jobLocationState].filter(Boolean).join(", ") || "India"),
      url: `${baseUrl}/viewjob?jk=${encodeURIComponent(key)}`,
      posted_at: isoDate(job.pubDate ?? job.createDate) ?? relativeDate(job.formattedRelativeTime, now),
      scraped_at: now.toISOString(),
      snippet: stripHtml(job.snippet) || null,
      expired: job.expired === true,
    };
  }).filter(Boolean);
}

export function mapIndeedGraphqlPayload(payload, { now = new Date(), baseUrl = "https://in.indeed.com" } = {}) {
  const results = payload?.data?.jobSearch?.results;
  if (!Array.isArray(results)) return [];
  return results.map((result) => {
    const job = result?.job;
    const key = String(job?.key ?? "").trim();
    const title = String(job?.title ?? "").trim();
    if (!key || !title) return null;
    return {
      id: `indeed-${key}`,
      source: "indeed",
      title,
      company: job.employer?.name ?? null,
      location: job.location?.formatted?.long
        ?? ([job.location?.city, job.location?.state, job.location?.country].filter(Boolean).join(", ") || "India"),
      url: `${baseUrl}/viewjob?jk=${encodeURIComponent(key)}`,
      posted_at: isoDate(job.datePublished ?? job.dateOnSite),
      scraped_at: now.toISOString(),
      snippet: stripHtml(job.description?.html) || null,
    };
  }).filter(Boolean);
}

export function mapNaukriPayload(payload, { now = new Date() } = {}) {
  const jobs = Array.isArray(payload?.jobDetails) ? payload.jobDetails : [];
  return jobs.map((job) => {
    const id = String(job.jobId ?? "").trim();
    const title = String(job.title ?? "").trim();
    if (!id || !title) return null;
    const location = (job.placeholders ?? []).find((item) => item?.type === "location")?.label;
    const path = String(job.jdURL ?? `/job/${id}`);
    return {
      id: `naukri-${id}`,
      source: "naukri",
      title,
      company: job.companyName ?? null,
      location: location || "India",
      url: path.startsWith("http") ? path : `https://www.naukri.com${path.startsWith("/") ? "" : "/"}${path}`,
      posted_at: isoDate(job.createdDate) ?? relativeDate(job.footerPlaceholderLabel, now),
      scraped_at: now.toISOString(),
      snippet: stripHtml(job.jobDescription ?? job.tagsAndSkills) || null,
    };
  }).filter(Boolean);
}

export function mapHimalayasPayload(payload, { now = new Date() } = {}) {
  const jobs = payload?.jobs ?? payload?.data ?? payload?.results ?? [];
  if (!Array.isArray(jobs)) return [];
  return jobs.map((job) => {
    const title = String(job.title ?? "").trim();
    const url = job.applicationLink ?? job.url;
    if (!title || !url) return null;
    return {
      id: `himalayas-${job.guid ?? job.id ?? url}`,
      source: "himalayas",
      title,
      company: job.companyName ?? null,
      location: (job.locationRestrictions ?? []).join(", ") || "Remote",
      url,
      posted_at: isoDate(job.pubDate),
      scraped_at: now.toISOString(),
      expires_at: isoDate(job.expiryDate),
      snippet: stripHtml(job.excerpt ?? job.description) || null,
    };
  }).filter(Boolean);
}

export function mapArbeitnowPayload(payload, { now = new Date() } = {}) {
  const jobs = Array.isArray(payload?.data) ? payload.data : [];
  return jobs.filter(isEarlyCareer).map((job) => ({
    id: `arbeitnow-${job.slug ?? job.url}`,
    source: "arbeitnow",
    title: String(job.title ?? "").trim(),
    company: job.company_name ?? null,
    location: job.remote ? "Remote" : job.location ?? null,
    url: job.url,
    posted_at: isoDate(job.created_at),
    scraped_at: now.toISOString(),
    snippet: stripHtml(job.description) || null,
  })).filter((job) => job.title && job.url);
}

export function mapRemotivePayload(payload, { now = new Date() } = {}) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.filter(isEarlyCareer).map((job) => ({
    id: `remotive-${job.id ?? job.url}`,
    source: "remotive",
    title: String(job.title ?? "").trim(),
    company: job.company_name ?? null,
    location: job.candidate_required_location || "Remote",
    url: job.url,
    posted_at: isoDate(job.publication_date),
    scraped_at: now.toISOString(),
    snippet: stripHtml(job.description) || null,
  })).filter((job) => job.title && job.url);
}

export function mapSimplifyPayload(payload, { now = new Date() } = {}) {
  if (!Array.isArray(payload)) return [];
  return payload.filter((job) => job?.is_visible !== false && job?.active !== false && job?.closed !== true).map((job) => ({
    id: `simplify-${job.id ?? job.url}`,
    source: "simplify",
    title: String(job.title ?? "").trim(),
    company: job.company_name ?? null,
    location: Array.isArray(job.locations) ? job.locations.join(", ") : job.location ?? job.locations ?? null,
    url: job.url,
    posted_at: isoDate(job.date_posted),
    scraped_at: now.toISOString(),
    snippet: [job.category, job.sponsorship].filter(Boolean).join(" · ") || null,
  })).filter((job) => job.title && job.url);
}

export function mapRemoteOkPayload(payload, { now = new Date() } = {}) {
  if (!Array.isArray(payload)) return [];
  return payload.filter((job) => job?.id && isEarlyCareer({
    title: job.position,
    description: job.description,
    tags: job.tags,
  })).map((job) => ({
    id: `remoteok-${job.id}`,
    source: "remoteok",
    title: String(job.position ?? "").trim(),
    company: job.company ?? null,
    location: job.location || "Remote",
    url: job.url,
    posted_at: isoDate(job.date ?? job.epoch),
    scraped_at: now.toISOString(),
    snippet: stripHtml(job.description) || null,
  })).filter((job) => job.title && job.url);
}

export function mapJobicyPayload(payload, { now = new Date() } = {}) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return jobs.filter((job) => isEarlyCareer({
    title: job.jobTitle,
    description: job.jobDescription ?? job.jobExcerpt,
    tags: job.jobIndustry,
  })).map((job) => ({
    id: `jobicy-${job.id ?? job.url}`,
    source: "jobicy",
    title: String(job.jobTitle ?? "").trim(),
    company: job.companyName ?? null,
    location: job.jobGeo || "Remote",
    url: job.url,
    posted_at: isoDate(job.pubDate),
    scraped_at: now.toISOString(),
    snippet: stripHtml(job.jobExcerpt ?? job.jobDescription) || null,
  })).filter((job) => job.title && job.url);
}

async function loadInternWire({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS["intern-wire"], { fetchImpl });
  if (!Array.isArray(payload?.items) || payload.items.length === 0) throw new Error("empty feed");
  return payload.items.map((job) => ({ ...job, scraped_at: job.scraped_at ?? now.toISOString() }));
}

async function loadSimplify({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.simplify, { fetchImpl, timeoutMs: 45_000 });
  const jobs = mapSimplifyPayload(payload, { now });
  if (jobs.length === 0) throw new Error("empty feed");
  return jobs;
}

async function loadIndeed({ fetchImpl, now }) {
  let pageError;
  try {
    const html = await request(SOURCE_FEED_URLS.indeed, {
      fetchImpl,
      response: "text",
      headers: { accept: "text/html,application/xhtml+xml" },
      timeoutMs: 15_000,
    });
    const jobs = parseIndeedSearch(html, { now });
    if (jobs.length > 0) return jobs;
  } catch (error) {
    pageError = error;
  }

  if (!process.env.INDEED_API_KEY) throw pageError ?? new Error("public search unavailable");

  const query = `query GetJobData($what: String, $location: String, $radius: Int, $fromAge: String) {
    jobSearch(
      what: $what
      location: { where: $location, radius: $radius, radiusUnit: MILES }
      sort: DATE
      limit: 50
      fromage: $fromAge
    ) {
      results {
        job {
          key
          title
          dateOnSite
          datePublished
          description { html }
          location { formatted { long } city state country }
          employer { name }
        }
      }
    }
  }`;
  const payload = await request("https://apis.indeed.com/graphql", {
    fetchImpl,
    method: "POST",
    body: JSON.stringify({
      query,
      variables: { what: "intern", location: "India", radius: 50, fromAge: "7" },
    }),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "indeed-api-key": process.env.INDEED_API_KEY,
      "indeed-co": "IN",
    },
    timeoutMs: 20_000,
  });
  const jobs = mapIndeedGraphqlPayload(payload, { now });
  if (jobs.length === 0) throw new Error("no parsable listings");
  return jobs;
}

async function loadNaukri({ fetchImpl, now }) {
  const terms = ["internship", "fresher"];
  const responses = await Promise.all(terms.map((term) => {
    const url = new URL(SOURCE_FEED_URLS.naukri);
    url.search = new URLSearchParams({
      noOfResults: "20",
      urlType: "search_by_keyword",
      searchType: "adv",
      keyword: term,
      pageNo: "1",
      k: term,
      seoKey: `${term}-jobs`,
      src: "jobsearchDesk",
      location: "India",
      days: "7",
      latLong: "",
    });
    const headers = {
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      appid: "109",
      systemid: "Naukri",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    };
    if (process.env.NAUKRI_NKPARAM) headers.Nkparam = process.env.NAUKRI_NKPARAM;
    return request(url, { fetchImpl, headers, timeoutMs: 20_000 });
  }));
  const jobs = responses.flatMap((payload) => mapNaukriPayload(payload, { now }));
  if (jobs.length === 0) throw new Error("no parsable listings");
  return jobs;
}

async function loadHimalayas({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.himalayas, { fetchImpl });
  return mapHimalayasPayload(payload, { now });
}

async function loadArbeitnow({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.arbeitnow, { fetchImpl });
  return mapArbeitnowPayload(payload, { now });
}

async function loadRemotive({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.remotive, { fetchImpl });
  return mapRemotivePayload(payload, { now });
}

async function loadRemoteOk({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.remoteok, { fetchImpl });
  return mapRemoteOkPayload(payload, { now });
}

async function loadJobicy({ fetchImpl, now }) {
  const payload = await request(SOURCE_FEED_URLS.jobicy, { fetchImpl });
  return mapJobicyPayload(payload, { now });
}

const SOURCE_ADAPTERS = {
  "intern-wire": {
    outputSources: ["linkedin", "linkedin-post", "twitter", "manual"],
    load: loadInternWire,
  },
  simplify: { outputSources: ["simplify"], load: loadSimplify },
  indeed: { outputSources: ["indeed"], load: loadIndeed },
  naukri: { outputSources: ["naukri"], load: loadNaukri },
  himalayas: { outputSources: ["himalayas"], load: loadHimalayas },
  arbeitnow: { outputSources: ["arbeitnow"], load: loadArbeitnow },
  remotive: { outputSources: ["remotive"], load: loadRemotive },
  remoteok: { outputSources: ["remoteok"], load: loadRemoteOk },
  jobicy: { outputSources: ["jobicy"], load: loadJobicy },
};

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "source endpoint").slice(0, 120);
}

export async function collectJobSources({
  enabledSources = DEFAULT_SOURCE_IDS,
  fetchImpl = fetch,
  now = new Date(),
  previousItems = [],
} = {}) {
  const selected = [...new Set(enabledSources)].filter((id) => SOURCE_ADAPTERS[id]);
  if (selected.length === 0) throw new Error("At least one recognized job source is required.");

  const settled = await Promise.allSettled(selected.map((id) => (
    SOURCE_ADAPTERS[id].load({ fetchImpl, now })
  )));
  const items = [];
  const sourceStatus = {};

  settled.forEach((result, index) => {
    const id = selected[index];
    const adapter = SOURCE_ADAPTERS[id];
    if (result.status === "fulfilled") {
      items.push(...result.value);
      sourceStatus[id] = {
        status: "ok",
        fetched: result.value.length,
        retained: 0,
        checked_at: now.toISOString(),
      };
      return;
    }

    const retained = previousItems.filter((job) => adapter.outputSources.includes(job?.source));
    items.push(...retained);
    sourceStatus[id] = {
      status: retained.length > 0 ? "stale" : "error",
      fetched: 0,
      retained: retained.length,
      checked_at: now.toISOString(),
      note: safeMessage(result.reason),
    };
  });

  return { items, sourceStatus, enabledSources: selected };
}
