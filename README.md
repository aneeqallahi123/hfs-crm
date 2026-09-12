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
| n8n | https://n8n.hfccrm.org |

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
┌──────────▼──────────┐  ┌───────▼─────────────────────────────────────┐
│  Railway            │  │  Local Mini PC (macOS)                       │
│  PostgreSQL         │  │                                              │
│  (postgres:16)      │  │  MinIO (Docker)  → minio.hfccrm.org         │
│  postgres.railway   │  │  n8n    (Docker)  → n8n.hfccrm.org          │
│  .internal:5432     │  │  Evolution API   → localhost:8080 (internal) │
└─────────────────────┘  │                                              │
                         │  Cloudflare Tunnel: hfc-minio                │
                         │  (runs as launchd service, survives reboots) │
                         └─────────────────────────────────────────────┘
```

### WhatsApp Automation Flow

```
Outbound (CRM → WA group):
  EngagementDetail "Send to group"
    → POST /api/engagements/:id/whatsapp-message
    → n8n send-wa-message workflow
    → Evolution API sendText
    → WA group receives message
    → selected item statuses flip to Requested

Inbound (WA group → inbox):
  Evolution API MESSAGES_UPSERT webhook
    → n8n receive-wa-file workflow (filters media only)
    → POST /api/webhooks/inbound-file
    → file downloaded + uploaded to MinIO
    → inbox_files row inserted (matched by wa_group_id)
    → unmatched_inbox row if group unknown
```

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
│   │   │   ├── engagements.js   # CRUD /engagements + roll-forward + WA send
│   │   │   ├── items.js         # checklist items CRUD + bulk update
│   │   │   ├── inbox.js         # WhatsApp file inbox
│   │   │   ├── documents.js     # file upload/download via MinIO (50 MB limit)
│   │   │   ├── library.js       # task library CRUD
│   │   │   ├── client-library.js# per-client library customisation
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
│   │   │   ├── EngagementDetail.jsx  # main checklist + WA send UI
│   │   │   ├── Library.jsx           # task library management
│   │   │   ├── Team.jsx              # partner only
│   │   │   └── Events.jsx            # partner + manager
│   │   ├── lib/metrics.js       # composeMessage(), status helpers
│   │   ├── App.jsx              # router + auth guards
│   │   └── main.jsx
│   ├── public/_redirects        # SPA routing for Cloudflare Pages
│   ├── vite.config.js
│   └── package.json
├── n8n/
│   ├── send-wa-message.json     # outbound WA workflow export
│   └── receive-wa-file.json     # inbound WA file workflow export
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

Clients carry a `waGroupId` field — the WhatsApp group ID linked to that client's engagements.

### Engagements
`GET /engagements` · `POST /engagements` · `GET /engagements/:id` · `PATCH /engagements/:id` · `DELETE /engagements/:id` · `POST /engagements/:id/roll-forward`

`POST /engagements/:id/whatsapp-message` — send a message to the engagement's linked WA group
- Body: `{ itemIds: string[], messageText: string }`
- Auth: partner | manager
- Calls n8n send webhook; on success flips all `itemIds` statuses to `Requested`
- Returns `{ sent: true, updatedCount }`

### Items
`GET /items?engagementId=` · `PATCH /items/:id` · `PATCH /items/bulk` · `POST /items/adhoc` · `DELETE /items/:id`

Item status values: `No progress` | `In progress` | `Requested` | `Under Review` | `Completed` | `N/A`

Items carry a `kind` field: `document` (default) | `number` | `information` — determines the UI shown in the expanded task panel (file upload vs. text input). `kind` is seeded from the Task Library on engagement creation and can be overridden per-engagement.

### Inbox
`GET /inbox?engagementId=` · `PATCH /inbox/:id/assign`

### Documents
`POST /documents/upload` (multipart, max 50 MB) · `GET /documents/:id/download` → presigned URL · `DELETE /documents/:id`

### Library
`GET /library` · `PUT /library` — task library CRUD (partner only)

### Team (partner only)
`GET /team` · `POST /team` · `PATCH /team/:id` · `DELETE /team/:id`

### Events (partner + manager)
`GET /events?userId=&entityType=&from=&to=&limit=`

### Webhooks (shared-secret: `X-Webhook-Secret` header)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/inbound-file` | WhatsApp file metadata from n8n → `inbox_files`. Evolution API has already written the bytes to MinIO; this verifies the object with `statObject` and records it. Unknown groups stored in `unmatched_inbox`. Deduplicates by `message_id`. Rejects files > `MAX_INBOX_FILE_MB` (200 MB) with 413. Also accepts a legacy `fileBase64` body for files under `MAX_INBOX_BASE64_MB` (15 MB). |
| POST | `/webhooks/portal-sync` | Idempotent status update |

---

## WhatsApp Automation

### Infrastructure

| Component | Where | Details |
|-----------|-------|---------|
| Evolution API | Local Mini PC (Docker) | `localhost:8080`, instance: `my-whatsapp` |
| n8n | Local Mini PC (Docker) | `localhost:5678`, exposed at `n8n.hfccrm.org` |

### Linking a WhatsApp group to an engagement

1. Get the group JID from Evolution API (format: `120363XXXXXXXXXX@g.us`)
2. Set `wa_group_id` on the client or engagement record
3. The "Send to group" button in the ComposeModal becomes active

### n8n Workflows

**`send-wa-message`** — outbound  
Trigger: `POST https://n8n.hfccrm.org/webhook/hfs-send-wa-message`  
Nodes: Webhook → Auth Check (`x-webhook-secret` header) → Evolution API `POST /message/sendText/{instance}` → Respond OK / Respond 401

**`receive-wa-file`** — inbound  
Trigger: Evolution API `MESSAGES_UPSERT` webhook  
Nodes: Filter media → Filter groups → Extract media metadata (Code) → `POST /api/webhooks/inbound-file` → Log errors
Sends metadata only; requires `S3_ENABLED=true` **and** `Webhook Base64` **off** in Evolution API.

### Outbound — "Send to group" flow

1. Partner selects tasks in EngagementDetail, clicks **Message client**
2. ComposeModal opens with auto-composed message (editable)
3. **Send to group** button calls `POST /api/engagements/:id/whatsapp-message`
4. Backend forwards to n8n with `{ groupId, messageText }` + `x-webhook-secret` header (10 s timeout)
5. n8n calls Evolution API → message delivered to WA group
6. On success: statuses flip to `Requested`, inline confirmation shown in modal

### Inbound — file intake flow

1. Client shares file in linked WA group
2. Evolution API fires `MESSAGES_UPSERT` webhook to n8n
3. Evolution API (with `S3_ENABLED=true`) has already written the decrypted file straight to MinIO over localhost, and reports it as `mediaUrl` in the payload
4. n8n filters for media and POSTs **metadata only** — `{ groupId, mediaUrl, fileName, mimeType, size, sender, messageId }` — to `/webhooks/inbound-file`
5. Backend resolves engagement by `wa_group_id`, derives the MinIO object key from `mediaUrl`, and `statObject`s it to confirm it exists and read its true size
6. `inbox_files` row inserted with `source='whatsapp'`; unrecognised groups go to `unmatched_inbox`
7. Files appear in the engagement's Documents inbox

**The file bytes never pass through n8n, Railway or Cloudflare** — only the MinIO object reference does. This is what allows 200 MB files: the old path base64-encoded the file through n8n (16 MB payload cap) and pushed it back to MinIO through the Cloudflare Tunnel (100 MB request-body cap on the Free plan).

---

## Task Types (kind)

Tasks in the Task Library are typed as **Document**, **Number**, or **Information**.

| Type | UI in EngagementDetail | Storage |
|------|----------------------|---------|
| `document` | File upload button | MinIO via `inbox_files` |
| `number` | Text input(s) | `items.value` (JSON array) |
| `information` | Text input(s) | `items.value` (JSON array) |

- Multiple values are supported for `number`/`information` — use **+ Add another value**
- `kind` is copied from the library into `items` when an engagement is created
- Partners can override `kind` per-engagement via the Type dropdown in the expanded task panel

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
| `WEBHOOK_SECRET` | Shared secret for all webhook endpoints |
| `N8N_SEND_WEBHOOK_URL` | `https://n8n.hfccrm.org/webhook/hfs-send-wa-message` |
| `EVOLUTION_INSTANCE` | `my-whatsapp` |
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

## MinIO & n8n (Local Mini PC)

Both services run via Docker on the local Mini PC and are exposed through the **same** Cloudflare Tunnel (`hfc-minio`).

### Tunnel config (`~/.cloudflared/config.yml` on Mini PC)
```yaml
tunnel: hfc-minio
credentials-file: /Users/automation-aneeq/.cloudflared/9960c899-ac01-4d08-a1a3-2e94f05b1197.json
ingress:
  - hostname: minio.hfccrm.org
    service: http://localhost:9000
  - hostname: n8n.hfccrm.org
    service: http://localhost:5678
  - service: http_status:404
```

The tunnel runs as a macOS launchd service (`/Library/LaunchDaemons/com.cloudflare.cloudflared.plist`) and survives reboots automatically.

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

### MinIO
- Docker Compose at `localhost:9000` (API) and `localhost:9001` (console)
- Bucket: `hfc-documents` (auto-created on backend startup)

> **`backend` requires `minio` v8+.** Evolution writes every inbound file under a key containing
> the group JID (`…/120363…@g.us/…`). The v7 client signs object paths containing `@` in a way
> MinIO rejects, so `statObject`/`getObject`/`removeObject` on those objects fail with 403 while
> listing and presigned URLs still work — a confusing failure mode worth not rediscovering.

### Evolution API → MinIO (required for large inbound files)

Evolution writes received WhatsApp media directly to MinIO on the same machine, so the bytes
never cross the network. Both of these are required:

1. In Evolution's `.env` / compose:
```env
S3_ENABLED=true
S3_ENDPOINT=host.docker.internal   # or the MinIO container name on a shared Docker network
S3_PORT=9000
S3_USE_SSL=false                   # localhost hop — must NOT go via minio.hfccrm.org
S3_BUCKET=hfc-documents            # same bucket as MINIO_BUCKET
S3_ACCESS_KEY=<same as MINIO_ACCESS_KEY>
S3_SECRET_KEY=<same as MINIO_SECRET_KEY>
S3_REGION=us-east-1
```

   Note `S3_BUCKET` **must equal `MINIO_BUCKET`** (`hfc-documents`). Evolution shipped here
   pointed at a separate `evolution-media` bucket, which the CRM never reads — media was being
   stored correctly and then ignored.

2. In the Evolution manager UI (`localhost:8080/manager`), **Events → Webhook → "Webhook Base64" must be OFF**.
   With it on, Evolution embeds the entire file as base64 in the `MESSAGES_UPSERT` payload, and
   n8n rejects anything over ~12 MB with a 413 (`N8N_PAYLOAD_SIZE_MAX`, 16 MB default) before
   any node runs — the execution may not even appear in n8n's log.

### n8n
- Docker at `localhost:5678`
- Recommended: `N8N_DEFAULT_BINARY_DATA_MODE=filesystem`
- Workflows imported from `n8n/` directory in this repo
- `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is set, so `$env` **is** readable inside nodes. Workflows
  reference `$env.CRM_BACKEND_URL`, `$env.WEBHOOK_SECRET`, `$env.EVOLUTION_*` rather than
  hardcoding secrets. (An earlier version of this README claimed the opposite.)

---

## CI/CD

Every push to `main`:
1. GitHub Actions lints the backend (`npm run lint --if-present`)
2. Builds the frontend (`npm run build` with `VITE_API_URL`)
3. Deploys to Cloudflare Pages project `hfc-smart-audit` via Wrangler
4. Railway auto-deploys the backend from `main`

---

## Cloudflare Setup

| Resource | Details |
|----------|---------|
| Account | `Hfc.crm@outlook.com` |
| Domain | `hfccrm.org` |
| Pages project | `hfc-smart-audit` → `app.hfccrm.org` |
| Tunnel | `hfc-minio` (ID: `9960c899-ac01-4d08-a1a3-2e94f05b1197`) → `minio.hfccrm.org` + `n8n.hfccrm.org` |

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
| Engagement Detail (checklist, inbox, docs, WA send) | `/engagements/:id` | All roles |
| Task Library | `/library` | Partner only |
| Team Management | `/team` | Partner only |
| Events / Audit Log | `/events` | Partner + Manager |

---

## Rate Limits

| Endpoint group | Limit |
|---------------|-------|
| `/auth/login`, `/auth/logout` | 100 requests / 15 min |
| `/auth/me`, `/auth/refresh` | 600 requests / min |
| All other `/api/*` | 600 requests / min |

---

## Completed Features

- [x] Frontend — all pages built and deployed to `app.hfccrm.org`
- [x] Permanent MinIO tunnel — `hfc-minio` running as launchd service at `minio.hfccrm.org`
- [x] n8n tunnel — same `hfc-minio` tunnel, `n8n.hfccrm.org`
- [x] Domain — `hfccrm.org` purchased and configured
- [x] Task Library — master checklist with Document / Number / Information task types
- [x] Task type sync — `kind` copied from library into engagement items on creation; overridable per-engagement
- [x] WhatsApp outbound automation — "Send to group" in ComposeModal → n8n → Evolution API → WA group; statuses flip to Requested
- [x] WhatsApp inbound automation — Evolution API → n8n → `/webhooks/inbound-file` → MinIO → inbox; unknown groups stored in `unmatched_inbox`
- [x] n8n setup — running at `n8n.hfccrm.org`, two workflows active
- [x] Evolution API setup — instance `my-whatsapp` running locally

## Pending / Next Steps

- [ ] **Set up Railway auto-deploy** — Railway account `grand-generosity` has GitHub connected; verify auto-deploy is active on push to `main`
- [ ] **Rotate webhook secret** — generate a new one with `openssl rand -hex 32` and update Railway env var + n8n workflow node values
- [ ] **Unmatched inbox UI** — surface files from `unmatched_inbox` table in a global admin view
