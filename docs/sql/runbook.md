# Supabase rollout runbook (fresh project)

## Prereqs
- Vault is enabled in your Supabase project.
- You have at least one user in Auth and can copy their `id` and session token.

## Apply baseline
1) Open SQL Editor and run:

```
-- File: supabase/migrations/0000_baseline.sql (paste entire contents)
```

Safe to re-run; it uses IF NOT EXISTS / OR REPLACE.

## Bootstrap
2) In SQL Editor, open bootstrap and edit inline placeholders, then run:

```
-- File: docs/sql/bootstrap.sql
-- Edit in-file DO block variables:
--   v_user_id := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
--   v_tenant_name := 'Acme Inc.'
--   v_tenant_token := 'dev-token-opaque'
-- Optional: uncomment the notification_rules insert at the bottom if you want
--           the owner to receive SMS alerts via the shared Twilio fallback.
```

Copy printed `tenant_id`.

## Validate
3) Run validation queries:

```
-- File: docs/sql/validate.sql
-- Edit the UUID inline in the token-bucket section
```

Scan that all checks look reasonable (tables exist, RLS enabled, functions present). The token-bucket section will likely show true, true, false on immediate calls.

## RLS smoke (client)
4) Run small client test:

```
// File: docs/sql/rls-smoke.ts
// envs: SUPABASE_URL, SUPABASE_ANON_KEY, USER_ACCESS_TOKEN, TENANT_ID
```

It should log `RLS smoke ok` and only return rows for the provided tenant.

## Reset / rollback (fresh project)
- Use Dashboard Reset Database; or execute:

```
drop schema public cascade; create schema public;
```

Then re-apply baseline and bootstrap.

## Future migrations
- Keep `0000_baseline.sql` immutable after first apply.
- Add new migrations as separate files; for policy changes use `drop policy if exists` prior to `create policy`.
- Include a small validation query alongside each migration.


