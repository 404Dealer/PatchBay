# Local Setup (Supabase + Vercel)

## 1) Prereqs
- Node 20+, pnpm
- Supabase CLI (`pnpm dlx supabase --help`)

## 2) Env
Copy `.env.example` → `.env` and set:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY` (server only)
- Optional Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`
- Shared fallback (optional): add `TWILIO_FROM_E164` if you want a default sending number when no Messaging Service SID is provided.

## 3) Migrations
```bash
pnpm dlx supabase init
pnpm dlx supabase db push   # or: run SQL under supabase/migrations in order
```

## 4) Deploy Functions
```bash
pnpm dlx supabase secrets set --project-ref <ref> SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY
pnpm dlx supabase secrets set --project-ref <ref> TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN
pnpm dlx supabase secrets set --project-ref <ref> TWILIO_MESSAGING_SERVICE_SID=$TWILIO_MESSAGING_SERVICE_SID TWILIO_FROM_E164=$TWILIO_FROM_E164
pnpm dlx supabase functions deploy twilio-inbound --project-ref <ref>
pnpm dlx supabase functions deploy twilio-status  --project-ref <ref>
pnpm dlx supabase functions deploy outbox-worker  --project-ref <ref>
```

## 5) Vault tokens
In Supabase SQL editor:
```sql
-- Outbox worker bearer token
select vault.set('OUTBOX_FN_TOKEN', '<random_long_token>');
```

## 6) Cron (pg_net)
Create a Cron job (every minute) to call the worker with the Vault token:
```sql
select net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/outbox-worker',
  headers := jsonb_build_object('authorization', 'Bearer ' || vault.get('OUTBOX_FN_TOKEN'))
);
```

## 7) Ingest tokens per tenant
Rotate with the provided route after first login:
```bash
POST /api/settings/rotate-tenant-token
```
This stores the opaque token in Vault: `tenant_token:<tenant_id>`.

## 8) Run the app
```bash
pnpm install
pnpm dev
```

## 9) Optional: Drizzle introspect
```bash
pnpm db:gen
```
