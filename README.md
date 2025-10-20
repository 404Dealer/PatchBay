# Patchbay

> Developer Preview (alpha): APIs and UI are subject to change. Not production-ready.

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

## 📸 Screenshots

Coming soon — feel free to contribute GIFs or screenshots once you have a local deployment running.

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
apps/web            ── Next.js UI + server actions
packages/core       ── domain types, ports/adapters, rate limiting
packages/db         ── SQL migrations, queries, seeds
packages/ui         ── shared UI components (shadcn-derived)
packages/adapters   ── messaging-fake, messaging-twilio
supabase/functions  ── twilio-inbound, twilio-status, outbox-worker, reconcile-status, ingest-*
supabase/migrations ── authoritative schema, policies, helpers
docs/               ── setup guides, runbooks, SQL helpers
```

**Key patterns**
- **Ports/Adapters**: `MessagingProvider`, `TemplateEngine`, provider registry.
- **Flexible fields**: `leads.properties` (JSONB) with targeted indexes and generated columns.
- **Transactional outbox**: reliable sends, retries, quiet hours.
- **RLS**: tenant isolation by default, enforced in SQL.

---

## 📥 Data Ingest (from websites & any source)
Patchbay accepts leads/quotes from **any** source you control:

**Option A — Direct DB insert (simple websites/forms)**
- From your website backend, insert into `leads` / `quotes` using the **service** key (server-side only). Fastest path when you own both app + site.

**Option B — Supabase REST**
- Use Supabase’s REST API (PostgREST) to write `leads` / `quotes` from other stacks. Keep the service key off the client.

**Option C — Ingest Edge Functions (recommended for untrusted sources)**
- Create `functions/ingest-lead` and `functions/ingest-quote` that accept HTTPS POST (with a tenant token), validate, normalize fields, and insert rows.
- This is ideal for **external sites**, Zapier/Make, or partners.

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

## 📦 Repo layout

```
apps/web
packages/{core,db,ui}
packages/adapters/{messaging-fake,messaging-twilio}
docs/
supabase/functions/{twilio-inbound,twilio-status,outbox-worker,reconcile-status,ingest-lead,ingest-quote,_shared}
supabase/migrations
CONTRIBUTING.md, LICENSE, NOTICE, README.md, SECURITY.md
```

---

## 🚀 Quick start

### 0) Prereqs

- Node 20+, pnpm, GitHub account
- Supabase project (grab `URL`, `anon`, `service_role`)
- Optional: Twilio (Account SID, Auth Token, Messaging Service SID)

> Need every setup detail (Vault tokens, cron, secrets)? See `docs/local-setup.md`.

### 1) Clone & install

```bash
git clone https://github.com/<your-org>/patchbay.git
cd PatchBay
pnpm install
```

### 2) Environment

Create `/.env.local` (or copy from a template) and set:

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
# Optional: fallback From number when no Messaging Service is supplied
TWILIO_FROM_E164=
```

> **Next.js tip:** any variable prefixed with `NEXT_PUBLIC_` is bundled to the client. **Never put secrets there.**

### 3) Database migrations

- **Supabase CLI (recommended):** `pnpm dlx supabase db push`
- **Dashboard SQL editor:** run the scripts in `supabase/migrations` in order.

If you need seed data, load fixtures manually or connect a demo integration.

### 4) Shared Twilio fallback (optional)

If your tenants do not yet bring their own Twilio credentials, Patchbay can fall back to a shared Twilio account.

1. Fill in the Twilio vars above in `.env.local` so local API routes can send through your shared account.
2. Mirror the same secrets into Supabase Edge Functions so the outbox worker can send using them (note the function env uses `SUPABASE_SERVICE_ROLE_KEY`):

   ```bash
   pnpm dlx supabase secrets set \
     TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID \
     TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN \
     TWILIO_MESSAGING_SERVICE_SID=$TWILIO_MESSAGING_SERVICE_SID \
     TWILIO_FROM_E164=$TWILIO_FROM_E164
   ```

   Supply only the variables you use—if you rely on a Messaging Service SID, `TWILIO_FROM_E164` can be omitted.
3. (Per tenant) insert an SMS notification rule so owners receive new lead alerts via your shared Twilio number:

   ```sql
   insert into notification_rules (tenant_id, event_type, channel, target, use_business_number)
   values ('<tenant-uuid>', 'lead.created', 'sms', '<client_phone_e164>', true)
   on conflict do nothing;
   ```

   Add additional rules for multiple recipients as needed.

### 5) Run locally

```bash
pnpm dev
```

Visit http://localhost:3000 → browse leads, open a lead, and send messages (fake provider by default).

Need Vault tokens, cron wiring, and full Supabase CLI flow? See `docs/local-setup.md`.

---

## 📡 Edge Functions (webhooks & worker)

### Deploy functions

```bash
# init once
pnpm dlx supabase init

# set secret for functions to talk to your DB
pnpm dlx supabase secrets set --project-ref <ref> SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY

# deploy
pnpm dlx supabase functions deploy twilio-inbound --project-ref <ref>
pnpm dlx supabase functions deploy twilio-status  --project-ref <ref>
pnpm dlx supabase functions deploy outbox-worker  --project-ref <ref>
```

### Point Twilio webhooks

- **Inbound**: `https://<project-ref>.supabase.co/functions/v1/twilio-inbound`
- **Status**:  `https://<project-ref>.supabase.co/functions/v1/twilio-status`

### Cron (scheduled sends / retries / quiet hours)

Use **pg_cron** + **pg_net** with a Vault-managed bearer token:

```sql
select
  net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/outbox-worker',
    headers := jsonb_build_object('authorization', 'Bearer ' || vault.get('OUTBOX_FN_TOKEN'))
  );
```

Create the schedule in Dashboard → **Cron** with `* * * * *`. Rotate tokens in Vault as needed. See `docs/local-setup.md` for walkthroughs.

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
**Apache License 2.0** — permissive, patent-grant, enterprise-friendly. See `LICENSE` and `NOTICE` for full terms and attribution. The project already ships under Apache-2.0; no additional steps are required to use or contribute.

