# HFC CRM — Hassan Farooq & Co. Audit Practice Management System

A production CRM for managing audit clients, engagements, checklists, and document intake via WhatsApp.

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://app.hfccrm.org |
| Frontend (alt) | https://hfc-smart-audit.pages.dev |
| Backend API | https://hfs-crm-production.up.railway.app |
| Health check | https://hfs-crm-production.up.railway.app/health |
| MinIO console | https://minio.hfccrm.org |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Pages (hfc-smart-audit)                  │
│  Vite + React 18 SPA                                 │
│  app.hfccrm.org / hfc-smart-audit.pages.dev          │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS (VITE_API_URL)
┌────────────────────▼────────────────────────────────┐
│  Railway — backend service                           │
│  Node.js + Express REST API                          │
│  JWT auth (15m access / 7d refresh httpOnly cookie)  │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────────┐  ┌───────▼────────────────────┐
│  Railway            │  │  Local Mini PC              │
│  PostgreSQL         │  │  MinIO (Docker)             │
│  (postgres:16)      │  │  ← Cloudflare Tunnel →      │
│  postgres.railway   │  │  minio.hfccrm.org           │
│  .internal:5432     │  │  (permanent named tunnel,   │
└─────────────────────┘  │   runs as launchd service)  │
                         └─────────────────────────────┘
```

**Planned (not yet set up):**
- n8n (local mini PC) — workflow automation
- Evolution API (local mini PC) — WhatsApp Business API

---

## Repository Structure

```
hfs-crm/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── pool.js          # pg Pool, SSL via DATABASE_SSL env var
│   │   │   ├── schema.sql       # full schema + seed admin user
│   │   │   └── migrate.js       # auto-migration on startup
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT verification (Bearer token)
│   │   │   └── rbac.js          # role-based access control factory
│   │   ├── routes/
│   │   │   ├── auth.js          # POST /login, /refresh, /logout, GET /me
│   │   │   ├── clients.js       # CRUD /clients
│   │   │   ├── engagements.js   # CRUD /engagements + roll-forward
│   │   │   ├── items.js         # checklist items CRUD + bulk update
│   │   │   ├── inbox.js         # WhatsApp file inbox
│   │   │   ├── documents.js     # file upload/download via MinIO (50 MB limit)
│   │   │   ├── team.js          # user management (partner only)
│   │   │   ├── events.js        # audit event log
│   │   │   └── webhooks.js      # n8n webhooks (shared-secret auth)
│   │   ├── storage/
│   │   │   └── minio.js         # MinIO client + bucket helpers
│   │   └── index.js             # app entry — migrate → password fix → listen
│   ├── Dockerfile
│   ├── railway.json
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/client.js        # full API client, auto-refresh on 401
│   │   ├── context/
│   │   │   ├── AuthContext.jsx  # user session, login/logout
│   │   │   └── ToastContext.jsx # global toast notifications
│   │   ├── components/
│   │   │   ├── Layout.jsx       # sidebar + outlet
│   │   │   ├── Sidebar.jsx      # nav links (role-aware)
│   │   │   ├── ClientLibrary.jsx # reference data per year (collapsed by default)
│   │   │   ├── Modal.jsx
│   │   │   ├── Btn.jsx
│   │   │   └── Field.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Clients.jsx
│   │   │   ├── ClientDetail.jsx
│   │   │   ├── EngagementDetail.jsx
│   │   │   ├── Team.jsx         # partner only
│   │   │   └── Events.jsx       # partner + manager
│   │   ├── App.jsx              # router + auth guards
│   │   └── main.jsx
│   ├── public/_redirects        # SPA routing for Cloudflare Pages
│   ├── vite.config.js
│   └── package.json
├── .github/workflows/deploy.yml # CI: lint backend + deploy frontend to CF Pages
└── README.md                    # this file
```

---

## RBAC

| Role | Capabilities |
|------|-------------|
| `partner` | Full access — all clients, engagements, team management, events log |
| `manager` | Clients + engagements, no team management |
| `student` | Only engagements where `incharge = their username` (server-enforced) |

---

## Backend API

Base URL: `https://hfs-crm-production.up.railway.app/api`

All endpoints except `/auth/*` and `/webhooks/*` require `Authorization: Bearer <accessToken>`.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | `{ username, password }` → `{ user, accessToken }` + sets `hfc_refresh` cookie |
| POST | `/auth/refresh` | Reads `hfc_refresh` cookie → `{ accessToken }` |
| POST | `/auth/logout` | Clears refresh cookie |
| GET | `/auth/me` | Returns current user from token |

### Clients
`GET /clients` · `POST /clients` · `GET /clients/:id` · `PATCH /clients/:id` · `DELETE /clients/:id`

### Engagements
`GET /engagements` · `POST /engagements` · `GET /engagements/:id` · `PATCH /engagements/:id` · `DELETE /engagements/:id` · `POST /engagements/:id/roll-forward`

### Items
`GET /items?engagementId=` · `PATCH /items/:id` · `PATCH /items/bulk` · `POST /items/adhoc` · `DELETE /items/:id`

Item status values: `No progress` | `In progress` | `Completed` | `N/A`

### Inbox
`GET /inbox?engagementId=` · `PATCH /inbox/:id/assign`

### Documents
`POST /documents/upload` (multipart, max 50 MB) · `GET /documents/:id/download` → presigned URL · `DELETE /documents/:id`

### Team (partner only)
`GET /team` · `POST /team` · `PATCH /team/:id` · `DELETE /team/:id`

### Events (partner + manager)
`GET /events?userId=&entityType=&from=&to=&limit=`

### Webhooks (shared-secret: `X-Webhook-Secret` header)
`POST /webhooks/inbound-file` — WhatsApp file → MinIO → inbox
`POST /webhooks/portal-sync` — idempotent status update

---

## Environment Variables

### Backend (Railway)

| Variable | Value / Notes |
|----------|---------------|
| `DATABASE_URL` | Railway internal Postgres URL |
| `DATABASE_SSL` | `false` (Railway internal — no SSL needed) |
| `JWT_SECRET` | 64-char hex secret |
| `JWT_ACCESS_EXPIRY` | `15m` |
| `JWT_REFRESH_SECRET` | separate secret |
| `JWT_REFRESH_EXPIRY` | `7d` |
| `CORS_ORIGIN` | `https://app.hfccrm.org` |
| `MINIO_ENDPOINT` | `minio.hfccrm.org` |
| `MINIO_PORT` | `443` |
| `MINIO_USE_SSL` | `true` |
| `MINIO_ACCESS_KEY` | MinIO root user |
| `MINIO_SECRET_KEY` | MinIO root password |
| `MINIO_BUCKET` | `hfc-documents` |
| `WEBHOOK_SECRET` | Shared secret for webhook endpoints |
| `NODE_ENV` | `production` |

### Frontend (Cloudflare Pages + GitHub Actions)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://hfs-crm-production.up.railway.app/api` (hardcoded in `.github/workflows/deploy.yml`) |

### GitHub Secrets (for CI)

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploys to Pages (new Cloudflare account: Hfc.crm@outlook.com) |
| `CLOUDFLARE_ACCOUNT_ID` | `fbf096c172ecdca093a64faf0a19e002` |

---

## MinIO (Local Mini PC)

- Running via Docker Compose at `localhost:9000` (API) and `localhost:9001` (console)
- Exposed via **permanent** Cloudflare Tunnel `hfc-minio` at `minio.hfccrm.org`
- Tunnel runs as a macOS launchd service — survives reboots automatically
- Bucket: `hfc-documents` (auto-created on backend startup)
- Tunnel config: `~/.cloudflared/config.yml` on the Mini PC

### Tunnel management (on Mini PC)
```bash
# Check status
sudo launchctl list | grep cloudflare

# View logs
tail -f /Library/Logs/com.cloudflare.cloudflared.out.log

# Stop / start
sudo launchctl stop com.cloudflare.cloudflared
sudo launchctl start com.cloudflare.cloudflared
```

---

## CI/CD

Every push to `main`:
1. GitHub Actions lints the backend (`npm run lint --if-present`)
2. Builds the frontend (`npm run build` with `VITE_API_URL`)
3. Deploys to Cloudflare Pages project `hfc-smart-audit` via Wrangler

Railway does **not** auto-deploy on push. To trigger a Railway redeploy, use the Railway MCP connector's `redeploy` tool or push a new deployment from the Railway dashboard.

---

## Cloudflare Setup

| Resource | Details |
|----------|---------|
| Account | `Hfc.crm@outlook.com` |
| Domain | `hfccrm.org` |
| Pages project | `hfc-smart-audit` → `app.hfccrm.org` |
| Tunnel | `hfc-minio` (ID: `9960c899-ac01-4d08-a1a3-2e94f05b1197`) → `minio.hfccrm.org` |

---

## Railway IDs (for MCP connector)

Railway account: `grand-generosity` (hfc202612)

| Resource | ID |
|----------|----|
| Project | `3ee2f56d-6a02-4bbe-aa81-267774948562` |
| Backend service (hfs-crm) | `c4a07f97-85f9-4b81-81ed-e6980fe8f849` |
| Postgres service | `f15b944f-c264-4142-b897-017dc1397656` |
| Production environment | `788bcf26-4123-423e-bcfd-4cc764e1ff81` |

---

## Frontend Pages

| Page | Path | Access |
|------|------|--------|
| Login | `/login` | Public |
| Dashboard | `/` | All roles |
| Clients | `/clients` | All roles |
| Client Detail + Reference Data | `/clients/:id` | All roles |
| Engagement Detail (checklist, inbox, docs) | `/engagements/:id` | All roles |
| Team Management | `/team` | Partner only |
| Events / Audit Log | `/events` | Partner + Manager |

## Rate Limits

| Endpoint group | Limit |
|---------------|-------|
| `/auth/login`, `/auth/logout` | 100 requests / 15 min |
| `/auth/me`, `/auth/refresh` | 300 requests / min |
| All other `/api/*` | 300 requests / min |

---

## Pending / Next Steps

- [ ] **n8n setup** on local mini PC — workflow automation connecting Evolution API → backend webhooks
- [ ] **Evolution API setup** on local mini PC — WhatsApp Business API for document intake
- [ ] **Set up Railway auto-deploy** — Railway account `grand-generosity` (hfc202612) has GitHub connected but auto-deploy not configured; currently triggered manually via Railway MCP
- [x] **Frontend** — all pages built and deployed to `app.hfccrm.org`
- [x] **Permanent MinIO tunnel** — `hfc-minio` tunnel running as launchd service at `minio.hfccrm.org`
- [x] **Domain** — `hfccrm.org` purchased and configured (Cloudflare account: Hfc.crm@outlook.com)
- [x] **Reference Data UI** — year-gated, sections collapsed by default
