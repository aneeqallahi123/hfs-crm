# HFC CRM

Hassan Farooq & Co. — Audit CRM

## Structure

```
hfc-crm/
├── backend/    Node.js + Express API (deployed to Railway)
└── frontend/   Vite + React 18 (deployed to Cloudflare Pages)
```

## Local development

```bash
# Backend
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev            # runs on :3000

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local
echo "VITE_API_URL=http://localhost:3000/api" > .env.local
npm install
npm run dev            # runs on :5173, proxies /api to :3000
```

## Database

Run `backend/src/db/schema.sql` once against your Railway Postgres instance:

```bash
psql $DATABASE_URL -f backend/src/db/schema.sql
```

Default login: `admin` / `changeme123` — **change immediately after first login**.

## Deployment

- **Backend**: Railway auto-deploys from `main` branch via GitHub integration.
- **Frontend**: Cloudflare Pages auto-deploys from `main` branch.
  - Build command: `npm run build`
  - Output directory: `dist`
  - Root directory: `frontend`

## Webhook endpoints (n8n → backend)

| Endpoint | Purpose |
|---|---|
| `POST /api/webhooks/inbound-file` | WhatsApp file received via Evolution API |
| `POST /api/webhooks/portal-sync` | Portal PDF parsed, update item statuses |

Both require header: `X-Webhook-Secret: <WEBHOOK_SECRET>`
