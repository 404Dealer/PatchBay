# Patchbay

**A tiny, fast, SMS‑first CRM built with Next.js + Supabase.**

> **Goal:** Become the *refine* of comms‑driven CRM — an extensible, open‑source core that lets anyone capture leads from anywhere, message them, and automate quotes in under 10 minutes.

<p align="center">
  <em>Next.js • TypeScript • Tailwind • shadcn/ui • Supabase (Auth, Postgres, Realtime, Edge Functions, Cron) • Twilio (optional)</em>
</p>

---

## ✨ Why Patchbay?

- **Massive simplicity**: leads → messages → quotes. No bloat.
- **Supabase‑native**: RLS security, Realtime updates, Edge Functions for webhooks, Cron for automations.
- **Bring Your Own Provider**: Twilio adapter for SMS, plus a built‑in **fake provider** so you can click around without credentials.
- **Flexible data**: per‑company custom fields via JSONB. No schema churn.
- **Contrib‑friendly**: typed domain, ports/adapters, small PR surface, preview deploys.

> If you just want to kick the tires: **works with no Twilio**.

---

## 📸 Screens (placeholders)

- Leads table → Lead detail (conversation thread)
- "Send quote" → SMS received

> Add your screenshots/GIF once you deploy locally.

---

## 🧱 Stack

- **App:** Next.js (App Router), TypeScript, Tailwind, shadcn/ui
- **Data:** Supabase (Postgres + Auth + Realtime + Storage)
- **Server glue:** Supabase Edge Functions (webhooks, workers) + Cron
- **Messaging:** Twilio (optional) via adapter, or Fake provider (default)
- **Tooling:** pnpm, turbo, Vitest, Playwright, GitHub Actions

---

## 🗺️ Architecture

```
apps/web (Next.js)
  ├─ routes (UI + server actions)
  └─ calls into → packages/core (domain) → packages/db (queries) → Supabase

supabase/functions
  ├─ twilio-inbound   # receives SMS → insert messages (inbound)
  ├─ twilio-status    # delivery updates → update messages.status
  └─ outbox-worker    # drains queued events (quote.created → send SMS)
```

**Key patterns**
- **Ports/Adapters**: `MessagingProvider` (Twilio/Fake), `TemplateEngine`.
- **Flexible fields**: `leads.properties` (JSONB) + a few generated columns for hot filters.
- **Transactional outbox**: reliable sends, retries, quiet hours.
- **RLS**: tenant isolation by default.

---

## 📥 Data Ingest (from websites & any source)
Patchbay accepts leads/quotes from **any** source you control:

**Option A — Direct DB insert (simple websites/forms)**
- From your website backend, insert into `leads` / `quotes` using the **service** key (server‑side only). Fastest path when you own both app + site.

**Option B — Supabase REST**
- Use Supabase’s REST API (PostgREST) to write `leads` / `quotes` from other stacks. Keep the service key off the client.

**Option C — Ingest Edge Functions (recommended for untrusted sources)**
- Create `functions/ingest-lead` and `functions/ingest-quote` that accept HTTPS POST (with a tenant token), validate, normalize fields, and insert rows.
- This is ideal for **external sites**, Zapier/Make, or partners.

**Example: ingest-quote (Deno) sketch**
```ts
// supabase/functions/ingest-quote/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const auth = req.headers.get('authorization') || ''
  // Verify a tenant-scoped token from Vault (or HMAC)
  if (!await verifyTenantToken(auth)) return new Response('unauthorized', { status: 401 })

  const payload = await req.json()
  const { tenant_id, lead_id, data, total_cents } = normalizeQuote(payload)

  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(url, key)

  // Insert quote (outbox trigger will queue the SMS)
  const { error } = await sb.from('quotes').insert({ tenant_id, lead_id, data, total_cents })
  if (error) return new Response('bad request', { status: 400 })
  return new Response('ok')
})
```

> Your clients’ websites can post directly to these ingest endpoints. You can also wire Zapier/Make to them or to Supabase REST.

---
apps/web (Next.js)
  ├─ routes (UI + server actions)
  └─ calls into → packages/core (domain) → packages/db (queries) → Supabase

supabase/functions
  ├─ twilio-inbound   # receives SMS → insert messages (inbound)
  ├─ twilio-status    # delivery updates → update messages.status
  └─ outbox-worker    # drains queued events (quote.created → send SMS)
```

**Key patterns**

- **Ports/Adapters**: `MessagingProvider` (Twilio/Fake), `TemplateEngine`.
- **Flexible fields**: `leads.properties` (JSONB) + a few generated columns for hot filters.
- **Transactional outbox**: reliable sends, retries, quiet hours.
- **RLS**: tenant isolation by default.

---

## 📦 Repo layout

```
suplead/
├─ apps/
│  └─ web/                      # Next.js (App Router)
├─ packages/
│  ├─ core/                     # domain types, zod schemas, use-cases
│  ├─ db/                       # migrations, typed queries (Kysely/Drizzle)
│  ├─ adapters/
│  │  ├─ messaging-twilio/
│  │  └─ messaging-fake/
│  └─ ui/                       # shadcn components (DataTable, Kanban, etc.)
├─ supabase/
│  ├─ migrations/               # SQL (tables, RLS, indexes, seeds)
│  └─ functions/
│     ├─ twilio-inbound/
│     ├─ twilio-status/
│     └─ outbox-worker/
├─ .github/workflows/ci.yml
├─ LICENSE
├─ README.md
├─ CONTRIBUTING.md
└─ SECURITY.md
```

---

## 🚀 Quick start

### 0) Prereqs

- Node 20+, pnpm, GitHub account
- Supabase project (grab `URL`, `anon`, `service_role`)
- Optional: Twilio (Account SID, Auth Token, Messaging Service SID)

### 1) Bootstrap

```bash
pnpm i -g pnpm
pnpm create next-app suplead --ts --eslint --app --src-dir --tailwind --no-import-alias
cd suplead
pnpm add @supabase/supabase-js zod
pnpm add -D @types/node
# shadcn/ui (pick minimal components)
pnpm dlx shadcn@latest add button input table dialog textarea toast
```

### 2) Configure Supabase

- Create a new project in the Supabase dashboard.
- Run the SQL in `supabase/migrations/0001_init.sql` (provided) to create tables, RLS, indexes.
- (Optional) run the seed SQL to create demo data.

### 3) Environment

Create `/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# UI/Mode flags
NEXT_PUBLIC_SINGLE_TENANT=true        # hide tenant switch; auto-use the user's default tenant
PATCHBAY_ENFORCE_ROLES=true           # enable role-based UI guards (owner/admin/member/viewer)

# Optional Twilio (per-tenant BYO credentials still stored in DB)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=                     # used for signature validation
TWILIO_MESSAGING_SERVICE_SID=
```

> **Next.js tip:** any variable prefixed with `NEXT_PUBLIC_` is bundled to the client. **Never put secrets there.**

### 4) Run locally

```bash
pnpm dev
```

Visit http://localhost:3000 → you can browse leads, open a lead, and send messages (fake provider by default). [http://localhost:3000](http://localhost:3000) → you can browse leads, open a lead, and send messages (fake provider by default).

---

## 📡 Edge Functions (webhooks & worker)

### Deploy functions

```bash
# init once
pnpm dlx supabase init

# set secret for functions to talk to your DB
pnpm dlx supabase secrets set --project-ref <ref> SUPABASE_SERVICE_ROLE_KEY=...

# deploy
pnpm dlx supabase functions deploy twilio-inbound --project-ref <ref>
pnpm dlx supabase functions deploy twilio-status  --project-ref <ref>
pnpm dlx supabase functions deploy outbox-worker  --project-ref <ref>
```

### Point Twilio webhooks

- **Inbound**: `https://<project-ref>.supabase.co/functions/v1/twilio-inbound`
- **Status**:  `https://<project-ref>.supabase.co/functions/v1/twilio-status`

### Cron (scheduled sends / retries / quiet hours)

**Supabase way (recommended):** use **pg_cron** + **pg_net** and store a function token in **Vault**. Create once:

```sql
-- Store a bearer token (e.g., a Function JWT) in Vault
-- Dashboard → Database → Vault: OUTBOX_FN_TOKEN

-- Cron job: every minute call the outbox worker with Authorization header
select
  net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/outbox-worker',
    headers := jsonb_build_object('authorization', 'Bearer ' || vault.get('OUTBOX_FN_TOKEN'))
  );
```

Create the schedule in Dashboard → **Cron** with `* * * * *`.

> Keep the token out of SQL/text files; rotate in Vault when needed.

---

## 🧬 Data model (simplified)

```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  first_name text, last_name text,
  phone text, email text,
  stage_id uuid references stages(id),
  source text,
  properties jsonb not null default '{}'::jsonb, -- per-company fields
  last_contacted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index leads_properties_gin on leads using gin (properties);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null references leads(id) on delete cascade,
  direction text check (direction in ('outbound','inbound')) not null,
  channel text check (channel in ('sms','whatsapp','email')) not null,
  provider_message_id text,
  from_number text, to_number text,
  body text not null,
  status text check (status in ('queued','sent','delivered','failed','received')),
  error_code text,
  created_at timestamptz default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id uuid not null references leads(id) on delete cascade,
  data jsonb not null,      -- flexible: items, terms, etc.
  total_cents int not null,
  currency text default 'USD',
  status text check (status in ('draft','sent','accepted','rejected')) default 'draft',
  created_at timestamptz default now(),
  sent_at timestamptz
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,      -- e.g. 'quote_sms'
  content text not null,  -- e.g. "Hi {{first_name}}, your quote is ${{total}}: {{short_url}}"
  unique (tenant_id, key)
);

create table outbox (
  id bigint generated by default as identity primary key,
  tenant_id uuid not null,
  event_type text not null,   -- 'quote.created', 'quote.send', ...
  payload jsonb not null,
  attempt int not null default 0,
  next_attempt_at timestamptz default now(),
  processed_at timestamptz
);
```

> **Custom fields:** add anything into `leads.properties` per tenant (company). Index the 1–2 fields you filter by most.

---

## 🔁 Quote → SMS automation

**Use‑case:** Your client writes a new row into `quotes` (from any tool). Patchbay detects it and texts the lead a quote automatically.

1. A DB trigger enqueues an **outbox** event:

```sql
create or replace function enqueue_quote_send() returns trigger as $$
begin
  insert into outbox(tenant_id, event_type, payload)
  values (NEW.tenant_id, 'quote.created', jsonb_build_object('quote_id', NEW.id, 'lead_id', NEW.lead_id));
  return NEW;
end; $$ language plpgsql;

create trigger quotes_outbox after insert on quotes
for each row execute function enqueue_quote_send();
```

2. The **outbox worker** function (cron) picks it up, renders the tenant’s `templates.quote_sms` with `{{tokens}}` from `lead` + `quote.data`, checks consent/quiet hours, sends via provider, inserts an outbound `messages` row, marks outbox as processed.

> Idempotency: key on `quote_id` in the worker so you don’t double‑send.

---

## 🔐 Security & compliance

- **RLS** on all business tables with `tenant_id` checks.
- **Secrets**: service role key is server/edge only; never on the client.
- **Webhook signatures**: Twilio signature validation is **required**.
- **Consent**: STOP/HELP handling flips `consent_sms=false` and suppresses sends.
- **Rate limits**: token bucket per tenant for `/api/messages/send`.

### Consent behavior (US)
| Keyword(s) | Action |
|---|---|
| `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT` | Set `consent_sms=false`; enqueue a confirmation reply; block further sends except HELP/START. |
| `START`, `YES`, `UNSTOP` | Set `consent_sms=true`; send opt-in confirmation. |
| `HELP`, `INFO` | Send help message with business name and support contact. |

> A2P 10DLC (US long codes) requires brand/campaign registration; ensure each tenant is compliant when using 10DLC.

---

## 🧩 Configuration

- **Providers**: set Twilio env vars to enable real SMS. If absent, the Fake provider is used.
- **API Keys**: prefer Twilio **API Key SID/Secret** for REST calls; keep the **Auth Token** only for webhook signature validation.
- **Templates**: create a `templates` row with `key='quote_sms'` and your message. Supported tokens: `{{first_name}}`, `{{last_name}}`, `{{total}}`, and any path from `lead.properties` or `quote.data`.
- **Quiet hours**: tenant setting read by the worker; sends outside the window are delayed.
- **Secrets**: store function tokens in **Vault**. For per‑tenant API keys, either store in Vault or encrypt at rest in Postgres (e.g., `pgcrypto`). Example:
  ```sql
  -- Encrypt at rest using a key from Vault
  update messaging_credentials
  set api_key_secret = pgp_sym_encrypt(api_key_secret, vault.get('ENC_KEY'))
  where tenant_id = '<id>';
  ```

---

## 🧪 Tests

- **Unit**: template rendering, Twilio adapter status mapping, outbox logic.
- **Integration**: API send (fake + Twilio), inbound/status functions.
- **E2E**: create lead → send → inbound reply → thread updates via Realtime.

---

## 🤝 Contributing

We love contributions! Please read **CONTRIBUTING.md**.

- Fork → create a branch → make changes → PR.
- All PRs run lint, typecheck, tests, and a preview deploy.
- Use Conventional Commits (e.g. `feat:`, `fix:`, `docs:`).

**Good first issues**

- STOP/HELP handler in inbound function
- CSV/Sheets import polishing
- Quiet hours + timezone settings
- Drizzle/Kysely typed queries
- Template variables & examples

Join Discussions for Q&A and feature proposals.

---

## 🗺️ Roadmap (high‑level)

- Email adapter (Resend) + templates
- Web form widget for capture (UTM auto‑capture)
- Attachments via Supabase Storage
- Multi‑tenant admin, audit log, scheduled sends
- WhatsApp through provider channel

---

## 📄 License
**Apache License 2.0** — permissive, patent‑grant, enterprise‑friendly.

- ✅ Commercial use, modification, redistribution allowed.
- ✅ Explicit **patent license** to users and contributors.
- 📌 Obligations: include the **LICENSE** text and a **NOTICE** file (if present) when redistributing binaries/source; keep copyright notices.

> Why Apache for Patchbay? It keeps adoption friction low (like MIT) and is often preferred by enterprises because of the patent grant. Great for an open‑core SaaS.

**Next steps** (repo hygiene):
- Add `LICENSE` with Apache‑2.0 text (top‑level).
- Add `NOTICE` with your attribution:
  ```
  Patchbay
  Copyright (c) 2025 Iron Edge Digital
  ```
- Update `package.json` → `"license": "Apache-2.0"`.
- Use a lightweight **DCO** (Developer Certificate of Origin) instead of a CLA to keep contributions easy.

