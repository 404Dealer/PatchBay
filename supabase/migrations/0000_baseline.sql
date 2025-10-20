-- PatchBay — Baseline schema (idempotent).
-- Fresh Supabase project with Vault enabled.

-- Extensions
create extension if not exists "pgcrypto";

-- Helpers moved below after tables to avoid dependency on memberships at creation time

-- ===== Types (create if not exists via pg_type checks) =====
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='membership_role' and n.nspname='public') then
    create type membership_role as enum ('owner','admin','member','viewer');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='message_direction' and n.nspname='public') then
    create type message_direction as enum ('outbound','inbound');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='message_channel' and n.nspname='public') then
    create type message_channel as enum ('sms','whatsapp','email');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='message_status' and n.nspname='public') then
    create type message_status as enum ('queued','sent','delivered','failed','received');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='quote_status' and n.nspname='public') then
    create type quote_status as enum ('draft','sent','accepted','rejected');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typname='notif_channel' and n.nspname='public') then
    create type notif_channel as enum ('sms','email');
  end if;
end $$;

-- ===== 1) Tenancy & Auth =====
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'UTC',
  quiet_hours jsonb,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now(),
  constraint profiles_auth_fk foreign key (id) references auth.users(id) on delete cascade
);

create table if not exists memberships (
  user_id uuid not null references profiles(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  role membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);
create index if not exists memberships_tenant_idx on memberships(tenant_id);

-- ===== 2) Pipeline & Leads =====
create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index if not exists pipelines_tenant_idx on pipelines(tenant_id);

create table if not exists stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null default 0,
  win_probability int,
  created_at timestamptz not null default now()
);
create index if not exists stages_tenant_pipeline_idx on stages(tenant_id, pipeline_id, position);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  email text,
  stage_id uuid references stages(id) on delete set null,
  source text,
  properties jsonb not null default '{}'::jsonb,
  consent_sms boolean not null default true,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  zip text generated always as ((properties->>'zip')) stored
);
create index if not exists leads_props_gin on leads using gin (properties);
create index if not exists leads_tenant_stage_idx on leads(tenant_id, stage_id);
create index if not exists leads_tenant_created_idx on leads(tenant_id, created_at desc);
create unique index if not exists leads_tenant_phone_uniq on leads(tenant_id, phone) where phone is not null;

-- ===== 3) Messaging & Quotes =====
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  direction message_direction not null,
  channel message_channel not null default 'sms',
  provider_message_id text,
  from_number text,
  to_number text,
  subject text,
  body text,
  status message_status not null,
  error_code text,
  created_at timestamptz not null default now()
);
create index if not exists messages_tenant_lead_idx on messages(tenant_id, lead_id, created_at desc);
create index if not exists messages_provider_idx on messages(provider_message_id);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  data jsonb,
  total_cents int,
  currency text not null default 'USD',
  status quote_status not null default 'draft',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists quotes_tenant_lead_idx on quotes(tenant_id, lead_id, created_at desc);

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

-- ===== 4) Provider Config & Numbers =====
create table if not exists messaging_credentials (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  provider text not null default 'twilio',
  account_sid text,
  api_key_sid text,
  api_key_secret text,
  auth_token text,
  messaging_service_sid text,
  subaccount_sid text,
  created_at timestamptz not null default now()
);

create table if not exists phone_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  e164 text unique,
  messaging_service_sid text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ===== 5) Outbox & Notifications =====
create table if not exists outbox (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempt int not null default 0,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists outbox_due_idx on outbox(next_attempt_at asc);
create unique index if not exists outbox_quote_created_unique on outbox(tenant_id, event_type, (payload->>'quote_id')) where event_type = 'quote.created' and (payload->>'quote_id') is not null;
create unique index if not exists outbox_ingest_client_dedup_unique on outbox(tenant_id, (payload->>'client_dedup_key')) where (payload->>'client_dedup_key') is not null;

create table if not exists notification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  channel notif_channel not null,
  target text not null,
  use_business_number boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists notification_rules_idx on notification_rules(tenant_id, event_type);

create table if not exists notifications (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  attempt int not null default 0,
  next_attempt_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists notifications_due_idx on notifications(next_attempt_at asc);

-- ===== 6) Rate limiting =====
create table if not exists rate_limits (
  tenant_id uuid not null references tenants(id) on delete cascade,
  bucket text not null,
  tokens int not null,
  updated_at timestamptz not null,
  primary key(tenant_id, bucket)
);

-- ===== 7) Lead Field Schema =====
create table if not exists lead_field_schemas (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  json_schema jsonb not null,
  created_at timestamptz not null default now()
);

-- Helper: membership check
create or replace function public.is_member(target_tenant uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from memberships m
    where m.user_id = auth.uid() and m.tenant_id = target_tenant
  );
$$;

-- ===== RLS Enablement =====
alter table tenants enable row level security;
alter table memberships enable row level security;
alter table profiles enable row level security;
alter table pipelines enable row level security;
alter table stages enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table quotes enable row level security;
alter table templates enable row level security;
alter table messaging_credentials enable row level security;
alter table phone_numbers enable row level security;
alter table outbox enable row level security;
alter table notification_rules enable row level security;
alter table notifications enable row level security;
alter table rate_limits enable row level security;
alter table lead_field_schemas enable row level security;

-- ===== Policies: generic tenant-scoped =====
do $$
declare rec record;
begin
  for rec in
    select *
    from (values
      ('pipelines','tenant_id'),
      ('stages','tenant_id'),
      ('leads','tenant_id'),
      ('messages','tenant_id'),
      ('quotes','tenant_id'),
      ('templates','tenant_id'),
      ('messaging_credentials','tenant_id'),
      ('phone_numbers','tenant_id'),
      ('outbox','tenant_id'),
      ('notification_rules','tenant_id'),
      ('notifications','tenant_id'),
      ('rate_limits','tenant_id'),
      ('lead_field_schemas','tenant_id')
    ) as t(table_name, tenant_column)
  loop
    execute format('drop policy if exists %I on %I', rec.table_name||'_tenant_select', rec.table_name);
    execute format('drop policy if exists %I on %I', rec.table_name||'_tenant_all', rec.table_name);
    execute format('create policy %I on %I for select using (public.is_member(%I.%I));',
      rec.table_name||'_tenant_select', rec.table_name, rec.table_name, rec.tenant_column);
    execute format('create policy %I on %I for all using (public.is_member(%I.%I)) with check (public.is_member(%I.%I));',
      rec.table_name||'_tenant_all', rec.table_name, rec.table_name, rec.tenant_column, rec.table_name, rec.tenant_column);
  end loop;
end $$;

-- Profiles policies (self access)
drop policy if exists profiles_self_select on profiles;
create policy profiles_self_select on profiles for select using (id = auth.uid());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());

-- ===== Policy overrides for tenants/memberships (bootstrap-friendly) =====
drop policy if exists tenants_tenant_select on tenants;
drop policy if exists tenants_tenant_all on tenants;

drop policy if exists tenants_member_read on tenants;
create policy tenants_member_read on tenants for select using (
  exists (
    select 1 from memberships m where m.tenant_id = tenants.id and m.user_id = auth.uid()
  )
);

drop policy if exists tenants_insert_any_auth on tenants;
create policy tenants_insert_any_auth on tenants for insert with check (auth.uid() is not null);

drop policy if exists memberships_tenant_all on memberships;
drop policy if exists memberships_tenant_select on memberships;

drop policy if exists memberships_member_read on memberships;
create policy memberships_member_read on memberships for select using (
  exists (
    select 1 from memberships m2 where m2.tenant_id = memberships.tenant_id and m2.user_id = auth.uid()
  )
);

drop policy if exists memberships_self_insert on memberships;
create policy memberships_self_insert on memberships for insert with check (
  user_id = auth.uid()
);

drop policy if exists memberships_member_all on memberships;
create policy memberships_member_all on memberships for all using (
  exists (
    select 1 from memberships m2 where m2.tenant_id = memberships.tenant_id and m2.user_id = auth.uid()
  )
);

-- ===== Triggers =====
create or replace function public.touch_lead_updated_at()
returns trigger language plpgsql as $$
begin
  update leads set updated_at = now() where id = new.lead_id;
  return new;
end;$$;

drop trigger if exists messages_touch on messages;
create trigger messages_touch after insert on messages
for each row execute function public.touch_lead_updated_at();

create or replace function public.enqueue_quote_created()
returns trigger language plpgsql as $$
begin
  insert into outbox(tenant_id, event_type, payload)
  values (new.tenant_id, 'quote.created', jsonb_build_object('quote_id', new.id, 'lead_id', new.lead_id));
  return new;
end;$$;

drop trigger if exists quotes_outbox on quotes;
create trigger quotes_outbox after insert on quotes
for each row execute function public.enqueue_quote_created();

-- ===== Functions: Vault/token helpers and inbound resolution =====
-- Ingest token verification using Vault
-- Token format: <tenant_id>:<opaque>
create or replace function public.verify_ingest_token(in_token text)
returns uuid
language plpgsql
security definer
as $$
declare
  tid uuid;
  opaque text;
  stored text;
  sep int;
begin
  if in_token is null then return null; end if;
  sep := position(':' in in_token);
  if sep = 0 then return null; end if;
  tid := (substring(in_token from 1 for sep-1))::uuid;
  opaque := substring(in_token from sep+1);
  if tid is null or opaque is null or length(opaque) = 0 then return null; end if;
  stored := vault.get('tenant_token:'||tid::text);
  if stored is null then return null; end if;
  if stored = opaque then return tid; else return null; end if;
end;$$;

-- Resolve tenant for inbound by MessagingServiceSid or To number
create or replace function public.resolve_tenant_for_inbound(msid text, to_e164 text)
returns uuid
language sql
stable
as $$
  with by_msid as (
    select tenant_id from messaging_credentials where messaging_service_sid = msid and msid is not null
  ), by_to as (
    select tenant_id from phone_numbers where e164 = to_e164 and to_e164 is not null
  )
  select tenant_id from by_msid
  union all
  select tenant_id from by_to
  limit 1;
$$;

-- Worker token verification via Vault
create or replace function public.verify_worker_token(in_token text)
returns boolean
language plpgsql
security definer
as $$
declare
  stored text;
begin
  if in_token is null then return false; end if;
  stored := vault.get('OUTBOX_FN_TOKEN');
  if stored is null then return false; end if;
  return stored = in_token;
end;$$;

-- Atomic token bucket helper
create or replace function public.take_token(
  p_tenant_id uuid,
  p_bucket text,
  p_capacity int,
  p_refill_per_sec numeric
) returns boolean
language plpgsql
security definer
as $$
declare
  v_tokens numeric;
  v_updated_at timestamptz;
  v_now timestamptz := now();
  v_elapsed numeric;
  v_refilled numeric;
begin
  select tokens::numeric, updated_at into v_tokens, v_updated_at
  from rate_limits where tenant_id = p_tenant_id and bucket = p_bucket for update;

  if not found then
    insert into rate_limits(tenant_id, bucket, tokens, updated_at)
    values (p_tenant_id, p_bucket, greatest(p_capacity - 1, 0), v_now)
    on conflict (tenant_id, bucket) do nothing;
    return true;
  end if;

  v_elapsed := extract(epoch from (v_now - v_updated_at));
  v_refilled := least(p_capacity::numeric, v_tokens + (v_elapsed * p_refill_per_sec));
  if v_refilled < 1 then
    update rate_limits set tokens = floor(v_refilled)::int, updated_at = v_now
    where tenant_id = p_tenant_id and bucket = p_bucket;
    return false;
  else
    update rate_limits set tokens = floor(v_refilled - 1)::int, updated_at = v_now
    where tenant_id = p_tenant_id and bucket = p_bucket;
    return true;
  end if;
end
$$;

-- Set per-tenant ingest token in Vault
create or replace function public.set_tenant_token(p_tenant_id uuid, p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform vault.set('tenant_token:'||p_tenant_id::text, p_token);
end;$$;


