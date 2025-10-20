# Patchbay

**A tiny, fast, SMS‑first CRM built with Next.js + Supabase.**

> **Goal:** Be the fastest, most extensible comms‑first CRM: capture leads from anywhere, notify owners instantly, and (optionally) message leads — without schema churn or lock‑in.

<p align="center">
  <em>Next.js • TypeScript • Tailwind • shadcn/ui • Supabase (Auth, Postgres, Realtime, Edge Functions, Cron) • Twilio (optional)</em>
</p>

---

## 0) Executive Summary

Patchbay is an open‑source, multi‑tenant, communications‑first CRM built on **Next.js + Supabase**. It enables teams to capture leads from any source, converse via SMS, and automatically send quotes, with reliable delivery and tenant isolation by default. The project aims to be the **refine** of comms‑driven CRMs: extensible, simple, fast to deploy.

---

## 1) Goals & Non‑Goals

### Goals (v0.1 foundation)

* Multi‑tenant core with **RLS** enforced across all business tables.
* **Leads → Messages → Quotes** flow, with JSONB custom fields per tenant.
* **BYO Twilio** per tenant; inbound/outbound SMS via provider adapters.
* **Outbox worker** pattern for reliable messaging + retries + quiet hours.
* **Owner notifications** (reply alerts, quote events) via SMS/email.
* **Data ingest** from websites/partners via REST or Edge Functions.
* **Apache‑2.0** licensed open core with contributor‑friendly repo.

### Non‑Goals (v0.1)

* Billing/seats, advanced analytics, visual workflow builders, omnichannel telephony.
* Complex field builders (keep JSONB + per‑tenant schema; no UI designer yet).

---

## 2) Personas & Roles

* **Agency Admin** (you/your staff): can belong to multiple tenants; onboard clients, manage numbers/credentials.
* **Tenant Owner**: full control within their tenant; can invite staff.
* **Tenant Member**: day‑to‑day; manage leads/messages/quotes.
* **Viewer**: read‑only.

Roles are enforced via **memberships** + **RLS** (see §6).

---

## 3) Primary User Journeys

1. **Capture Lead**: ingest from website → `leads` row with `properties` JSONB → appears in Leads UI.
2. **Two‑Way SMS**: user sends from Lead → outbox (optionally) → Twilio → inbound reply → UI realtime update.
3. **Quote Auto‑SMS**: insert `quotes` row → outbox event → render template → send SMS → status webhook updates → message thread.
4. **Owner Notify**: on `message.received`/`quote.*`, enqueue `notifications` → worker sends owner alert via SMS/email.
5. **Tenant Setup**: create tenant → store **per‑tenant** Twilio creds → map numbers → create templates → go live.

---

## 4) System Architecture

```
apps/web (Next.js) ── UI + server actions ─┬─ packages/core (domain, ports)
                                          └─ packages/db (queries, migrations)

Supabase Postgres ─ business tables (RLS) + pg_cron + pg_net + Vault

Edge Functions (Deno)
  • twilio-inbound     ← Twilio webhook (SMS In)
  • twilio-status      ← Twilio webhook (DLR)
  • outbox-worker      ← Cron via pg_net (sends queued events)
  • reconcile-status   ← Nightly, reconciles missed DLRs
  • ingest-lead/quote  ← External capture endpoints (tenant token)
```

Key patterns: **Ports/Adapters**, **Outbox**, **JSONB custom fields**, **RLS everywhere**.

---

## 5) Data Model (Authoritative)

> All tables include `tenant_id` and have RLS enabled. Unique constraints include `tenant_id` where relevant.

### Tenancy & Auth

* `tenants(id, name, timezone, quiet_hours jsonb, created_at)`
* `profiles(id uuid PK → auth.users, display_name, created_at)`
* `memberships(user_id → profiles.id, tenant_id → tenants.id, role enum('owner','admin','member','viewer'), created_at, PRIMARY KEY(user_id, tenant_id))`

### Pipeline & Leads

* `pipelines(id, tenant_id, name, created_at)`
* `stages(id, tenant_id, pipeline_id, name, position, win_probability)`
* `leads(id, tenant_id, first_name, last_name, phone, email, stage_id, source, properties jsonb default '{}', consent_sms bool default true, last_contacted_at, created_at, updated_at, GENERATED COLUMNS e.g. zip)`

  * Indexes: `GIN(properties)`, `(tenant_id, stage_id)`, `(tenant_id, created_at)`
  * Uniques: `(tenant_id, phone)` nullable‑aware if needed

### 🔁 Quote Events (default: owner notifications)

**Reality check:** Quotes are **generated on your clients’ websites** and written into Patchbay’s **Supabase DB**. By default, Patchbay **does not text the lead**. Instead it **notifies the business owner/staff** so they can follow up.

**Flow**

1. External site posts a row into `quotes` (via REST or `ingest-quote`).
2. A trigger enqueues an **outbox** event: `event_type='quote.created'` with `{quote_id, lead_id}`.
3. The **outbox worker** evaluates tenant mode:

   * **Notification‑Only (no tenant provider creds)** → send **owner/admin notification** via your **agency provider**.
   * **Full Comms (tenant has provider + has opted‑in)** → optionally send a **lead notification** using tenant’s provider **if** `tenant_settings.send_quote_to_lead=true` *and* a `templates('quote_sms')` exists.
4. Delivery/status are logged to `messages` (owner alerts can log to a separate `notifications` table or `messages` with `channel='sms'` + `is_owner_notification=true`).

**Trigger (unchanged)**

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

**Optional tenant setting**

```sql
alter table tenants add column if not exists send_quote_to_lead boolean default false;
```

> Default behavior is safe: **owner notifications only**. Tenant‑initiated lead texts are opt‑in and require provider credentials + a template.

---

## 6) Security Model

* **Auth:** Supabase Auth; derive `tenant_id` from `memberships` on each request.
* **RLS:** Explicitly `enable row level security` on all tables; policies check membership.
* **Secrets:** Function tokens and encryption keys in **Vault**; per‑tenant API secrets can be encrypted at rest via `pgcrypto`.
* **Twilio Webhooks:** Validate `X‑Twilio‑Signature`; HTTPS only.
* **Consent & A2P:** On STOP/STOPALL/UNSUBSCRIBE… → `consent_sms=false` and emit confirm; HELP returns info; START re‑enables.
* **Rate Limiting:** Token bucket per tenant for send endpoints & worker dispatch.

---

## 7) Interfaces, APIs & Functions

### Ports (TypeScript)

```ts
// Messaging
export type MessageStatus = 'queued'|'sent'|'delivered'|'failed'|'received'
export interface MessagingProvider {
  send(input: { tenantId: string; leadId: string; to: string; body: string; from?: string }): Promise<{ providerId: string; status: MessageStatus }>
}

// Templates
export interface TemplateEngine {
  render(content: string, ctx: { lead: any; quote?: any; tenant: any }): string
}
```

### Provider Registry

`MessagingProviderRegistry.get(tenantId)` → resolves `messaging_credentials` and returns a configured provider (Twilio or Fake).

### Next.js Server APIs

* `POST /api/messages/send` — Inputs: `{leadId, to, body}`; Behavior: check consent/rate limit → call provider (or enqueue via outbox) → insert `messages` row → 200.

### Edge Functions (Deno)

* `twilio-inbound` — Validate signature → resolve tenant (MessagingServiceSid → To) → insert `messages(inbound)` → optional STOP/HELP handling.
* `twilio-status` — Validate signature → update `messages.status`/`error_code`.
* `outbox-worker` — Cron every minute; fetch due events; enforce quiet hours; send via provider; mark processed; retry with backoff.
* `reconcile-status` — Nightly; reconcile last 24h with Twilio to correct missed DLRs.
* `ingest-lead`, `ingest-quote` — Public endpoints with tenant token; validate → insert rows; rely on triggers to enqueue outbox when needed.

### Triggers

* `quotes_outbox`: AFTER INSERT on `quotes` → enqueue `outbox(event='quote.created', payload={quote_id, lead_id})`.
* `messages_touch`: AFTER INSERT on `messages` → update `leads.updated_at`.

---

## 8) Configuration & Environments

**.env**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# UI/Mode
NEXT_PUBLIC_SINGLE_TENANT=true
PATCHBAY_ENFORCE_ROLES=true

# Twilio (global, optional; per‑tenant creds live in DB)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=        # used for signature validation
TWILIO_MESSAGING_SERVICE_SID=
```

> `NEXT_PUBLIC_*` is bundled to the client — never store secrets there.

**Cron via pg_net + Vault**

```sql
-- Vault: store OUTBOX_FN_TOKEN
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/outbox-worker',
  headers := jsonb_build_object('authorization', 'Bearer '|| vault.get('OUTBOX_FN_TOKEN'))
);
```

---

## 9) Deployment Topology

* **Vercel** for `apps/web` (Next.js).
* **Supabase** for Postgres (RLS), Edge Functions, Vault, pg_cron/pg_net.
* **Twilio** webhooks → `twilio-inbound`, `twilio-status`.
* **Subaccounts + Messaging Services** per tenant (ISV best practice).

---

## 10) Observability & Ops

* **Logs:** Edge function logs; DB error tables; store `error_code` on `messages`/`outbox`/`notifications`.
* **Idempotency:** Use unique keys (e.g., `quote_id`) inside worker to avoid duplicate sends.
* **Dead‑letter:** After N attempts, flag outbox rows for manual review.

---

## 11) Testing Strategy

* **Unit:** provider adapters, template rendering, token bucket.
* **Integration:** send API (fake + Twilio), inbound/status functions.
* **RLS Tests:** run queries as anon vs service; verify denial outside tenant.
* **E2E:** create lead → send → inbound reply → realtime thread updates.

---

## 12) Coding Standards

* TypeScript strict, Zod schemas at boundaries.
* ESLint + Prettier (or Biome); Conventional Commits.
* Directory hygiene: `apps/web`, `packages/{core,db,adapters,ui}`, `supabase/{migrations,functions}`.

---

## 13) Work Breakdown (Boilerplate Foundation)

**A. Repo & Tooling**

* [ ] pnpm + turbo monorepo; CI: lint/typecheck/test/preview.
* [ ] `packages/core` with ports (`MessagingProvider`, `TemplateEngine`) + zod types.
* [ ] `packages/db` with migrations folder + seed script; Kysely/Drizzle setup.
* [ ] `packages/adapters/messaging-fake` + `messaging-twilio` (skeleton only).
* [ ] `packages/ui` (shadcn baseline: Button, Input, Table, Dialog, Toast).

**B. Database & RLS**

* [ ] Authoritative SQL: all tables in §5 with **RLS enabled** + base policies.
* [ ] Indexes & uniques (JSONB GIN, `(tenant_id, phone)`, `(tenant_id, key)`).

**C. Edge Functions**

* [ ] `twilio-inbound` with signature validation stub.
* [ ] `twilio-status` updater.
* [ ] `outbox-worker` loop w/ backoff & quiet hours.
* [ ] `reconcile-status` skeleton.
* [ ] `ingest-lead` + `ingest-quote` skeletons.

**D. Web App**

* [ ] Auth bootstrap; single‑tenant mode flag.
* [ ] Leads list + Lead detail + Conversation component (Realtime subscribe).
* [ ] `POST /api/messages/send` (fake by default; Twilio when creds present).
* [ ] Settings pages: tenant templates, numbers, credentials (minimal UI).

**E. Docs**

* [ ] README (install, env, deploy; already drafted).
* [ ] CONTRIBUTING + SECURITY + Issue templates.

**Acceptance**: Seeded demo can (1) create lead, (2) send message (fake), (3) accept inbound payload (simulated), (4) see realtime update, (5) insert `quotes` row → outbox enqueued.

---

## 14) Risks & Mitigations

* **A2P compliance:** enforce STOP/HELP/START; document BYO Twilio registration.
* **Secrets exposure:** Vault + pgcrypto; never store secrets in `NEXT_PUBLIC_*`.
* **Multi‑tenant leaks:** RLS tests; derive tenant on server; never trust client `tenant_id`.

---

## 15) Roadmap (post‑foundation)

* Email adapter (Resend); attachments via Supabase Storage.
* Quiet hours UI, timezone per tenant; scheduling UI.
* Web form widget; UTM capture; Zapier/Make templates.
* Role‑based page middleware; audit log.
* Dashboard & basic analytics once usage data informs metrics.

---

## Appendix A — RLS Enablement & Policy Shape

```sql
-- Enable RLS (repeat for all tables)
alter table leads enable row level security;

-- Base SELECT policy example
create policy leads_tenant_read on leads for select using (
  exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.tenant_id = leads.tenant_id
  )
);

-- Base ALL policy example
create policy leads_tenant_all on leads for all using (
  exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.tenant_id = leads.tenant_id
  )
);
```

## Appendix B — Consent Behavior (US)

| Keyword(s)                               | Action                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT | set `consent_sms=false`; send confirm; block further sends |
| START/YES/UNSTOP                         | set `consent_sms=true`; send confirm                       |
| HELP/INFO                                | help text with business info                               |

## Appendix C — Ingest Payload Shapes (suggested)

```json
// Lead
{ "tenant_token": "...", "lead": { "first_name":"...", "phone":"...", "properties": {"zip":"78249","service_type":"shed"} } }

// Quote
{ "tenant_token": "...", "quote": { "lead_id":"uuid", "total_cents": 120000, "data": {"items":[{"name":"10x12 shed","cents":120000}]}} }
```

## Appendix D — Directory Skeleton

```
apps/web
packages/core
packages/db
packages/adapters/messaging-fake
packages/adapters/messaging-twilio
packages/ui
supabase/migrations
supabase/functions/{twilio-inbound,twilio-status,outbox-worker,reconcile-status,ingest-lead,ingest-quote}
```

---

## 🔌 Adapters & Extensions

Patchbay is designed to be **adapter‑driven**. SMS/Twilio ships first, but the same interfaces support Email (Resend), WhatsApp (Meta/Twilio), Telegram, Push (FCM), MessageBird/Vonage, etc.

### Ports (stable contracts)

```ts
// Channel can be extended by adapters without code changes
export type Channel = 'sms' | 'email' | 'whatsapp' | 'messenger' | 'push' | (string & {})

export type MessageStatus = 'queued'|'sent'|'delivered'|'failed'|'received'

export interface MessagingProvider {
  send(input: { tenantId: string; leadId: string; channel: Channel; to: string; body: string; from?: string }): Promise<{ providerId: string; status: MessageStatus }>
  parseInbound?(req: Request): Promise<{ channel: Channel; from: string; to: string; body: string; providerId?: string }>
  parseStatus?(req: Request): Promise<{ providerId: string; status: MessageStatus; errorCode?: string }>
}

export interface ProviderManifest {
  id: string                   // e.g. 'twilio', 'resend', 'telegram'
  displayName: string
  channels: Channel[]          // e.g. ['sms'], ['email']
  configSchema: unknown        // zod schema for per‑tenant config
}
```

### Registry (per‑tenant resolution)

```ts
// Given a tenantId + desired channel, resolve an initialized provider
export async function getProvider(tenantId: string, channel: Channel): Promise<MessagingProvider> {
  const cfg = await db.getTenantProviderConfig(tenantId, channel) // from messaging_credentials
  switch (cfg.id) {
    case 'twilio': return createTwilioProvider(cfg)
    case 'resend': return createResendEmailProvider(cfg)
    // ... more
    default: throw new Error('No provider for channel')
  }
}
```

### Webhooks (normalized inbound/status)

Each adapter exposes `parseInbound` / `parseStatus`. Edge Functions call the parser and upsert **normalized** records into `messages` so the UI stays provider‑agnostic.

### How to add a new adapter (PR‑friendly)

1. Create `packages/adapters/messaging-<name>` with `create<Name>Provider(cfg) → MessagingProvider`.
2. Add config fields to `messaging_credentials` (or use a JSONB `provider_config`).
3. Wire the adapter into the **registry** and add minimal docs + tests.
4. If inbound webhooks are needed, add a function `/<name>-inbound` that calls the adapter’s `parseInbound` and writes to `messages`.

**Next adapters to consider:**

* **Email** (Resend) for quotes/receipts
* **WhatsApp** (Twilio or Meta Cloud API)
* **Telegram** (Bot API)
* **Push** (FCM) for owner notifications

---

## 🧭 Tenant Modes & Agency SMS Fallback

Patchbay supports two operational modes per tenant:

**Mode 1 — Full Comms** (tenant has their own provider creds)

* Outbound/inbound with **the tenant’s numbers**.
* Owners can also get notifications from the same numbers or a separate system number.

**Mode 2 — Notification‑Only (default if no creds)**

* **No customer SMS** is sent.
* **Owner/Admin notifications only** are sent via **your agency’s Twilio** (fallback provider).
* Ideal for clients who haven’t onboarded Twilio yet; they still get their leads instantly.

**Env (agency fallback)**

```
AGENCY_TWILIO_ACCOUNT_SID=
AGENCY_TWILIO_API_KEY_SID=
AGENCY_TWILIO_API_KEY_SECRET=
AGENCY_TWILIO_MESSAGING_SERVICE_SID=
AGENCY_SYSTEM_NUMBER=            # optional; or use a Messaging Service pool
```

**DB**

* Use `phone_numbers(is_system=true)` per tenant to map a distinct sender for owner alerts (recommended), even when using your agency’s Twilio.

**Send Guardrails**

```ts
// Pseudocode in send API / worker
if (!tenantHasProviderCreds && target === 'lead') {
  throw new Error('Customer messaging disabled until tenant connects a provider')
}
const provider = tenantHasProviderCreds
  ? getTenantProvider(tenantId, 'sms')
  : getAgencyProvider('sms') // allowed only for owner/admin targets
```

**Ingest default**

* `ingest-lead` automatically enqueues an owner SMS notification when `tenantHasProviderCreds === false`.

**Compliance**

* Register your agency brand/campaign with use case **Account Notifications** (not marketing) for owner alerts.
* STOP/HELP from owner numbers should toggle an owner‑level opt‑out and suppress further notifications.
