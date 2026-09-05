# HFC CRM — Hassan Farooq & Co. Audit Practice Management System

A production CRM for managing audit clients, engagements, checklists, and document intake via WhatsApp.

---

## Live URLs

| Service | URL |
|---------|-----|
| Frontend | https://hfc-crm.pages.dev |
| Backend API | https://backend-production-fd304.up.railway.app |
| Health check | https://backend-production-fd304.up.railway.app/health |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Pages                                    │
│  Vite + React 18 SPA — hfc-crm.pages.dev            │
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
│  Managed PostgreSQL │  │  MinIO (Docker)             │
│  postgres.railway   │  │  ← Cloudflare Tunnel →      │
│  .internal:5432     │  │  operator-gba-...           │
└─────────────────────┘  │  .trycloudflare.com (temp)  │
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
│   │   │   ├── documents.js     # file upload/download via MinIO
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
├── MINIO_SETUP_CONTEXT.md       # context doc for MinIO session
├── FRONTEND_BUILD_CONTEXT.md    # context doc for frontend build session
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

Base URL: `https://backend-production-fd304.up.railway.app/api`

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
`POST /documents/upload` (multipart) · `GET /documents/:id/download` → presigned URL · `DELETE /documents/:id`

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
| `CORS_ORIGIN` | `https://hfc-crm.pages.dev` |
| `MINIO_ENDPOINT` | Cloudflare Tunnel hostname (no protocol) |
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
| `VITE_API_URL` | `https://backend-production-fd304.up.railway.app/api` |

### GitHub Secrets (for CI)

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Wrangler deploys to Pages |
| `CLOUDFLARE_ACCOUNT_ID` | `63a6c25304f9a1c93135c345c6160119` |

---

## MinIO (Local Mini PC)

- Running via Docker Compose at `localhost:9000` (API) and `localhost:9001` (console)
- Exposed via Cloudflare Tunnel (currently temporary `trycloudflare.com` URL — dies on reboot)
- **Permanent tunnel pending** — requires buying a domain (e.g. `hfc-smart-audit.com`)
- Bucket: `hfc-documents` (auto-created on backend startup)
- Credentials: `hfc_admin` / (password set during setup — stored in Docker Compose on mini PC)

See `MINIO_SETUP_CONTEXT.md` for full setup details.

---

## CI/CD

Every push to `main`:
1. GitHub Actions lints the backend (`npm run lint --if-present`)
2. Builds the frontend (`npm run build` with `VITE_API_URL`)
3. Deploys to Cloudflare Pages via Wrangler

Railway does **not** auto-deploy on push (GitHub webhook not set up for the Railway account). To trigger a Railway redeploy, use the Railway MCP connector's `connect-service-source` tool.

---

## Railway IDs (for MCP connector)

| Resource | ID |
|----------|----|
| Project | `87d93f2b-f07d-45cd-a6f2-3fe3a4a3b50b` |
| Backend service | `2f470b2f-0505-4a5f-beb0-ffe501add113` |
| Postgres service | `82f12543-1804-4c13-97dd-e8fe15a71f4f` |
| Production environment | `879ea755-9c8c-4fbc-ab27-a116cb765c63` |

---

## Frontend Pages (all live at hfc-crm.pages.dev)

| Page | Path | Access |
|------|------|--------|
| Login | `/login` | Public |
| Dashboard | `/` | All roles |
| Clients | `/clients` | All roles |
| Client Detail + Engagements | `/clients/:id` | All roles |
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

- [ ] **Permanent Cloudflare Tunnel** for MinIO — buy domain (e.g. `hfc-smart-audit.com`), set up named tunnel + launchd service so it survives reboots
- [ ] **n8n setup** on local mini PC — workflow automation connecting Evolution API → backend webhooks
- [ ] **Evolution API setup** on local mini PC — WhatsApp Business API for document intake
- [x] **Frontend** — all pages built and deployed
- [ ] **Set up Railway auto-deploy** — add GitHub webhook for `hfc202612` Railway account (currently triggered manually via MCP)
