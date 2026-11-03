# Pinecity Commutes WhatsApp Cloud API Bot

Deployment source for Render. Use Node.js 20+, PostgreSQL, and Meta WhatsApp Cloud API.

- `npm install` + `npm start`; schema initializes at startup.
- `GET /` returns service status and whether WhatsApp credentials are configured.
- `GET /health` verifies Postgres connectivity.
- `GET /webhook` verifies the Meta callback challenge using META_VERIFY_TOKEN.
- `POST /webhook` requires META_WA_TOKEN, PHONE_NUMBER_ID and META_APP_SECRET. Until those credentials are supplied, POST /webhook returns 503.

Configure Render environment: DATABASE_URL, DATABASE_SSL, META_VERIFY_TOKEN, WA_API_VERSION=v26.0, and Meta credentials listed above. Never put actual tokens in GitHub. Use Render Environment Settings.

Subscribe to the WhatsApp 'messages' webhook field in the Meta developer dashboard. For production use an always-on web service and persistent Postgres. Free Render Postgres expires after 30 days; free web service may spin down.
