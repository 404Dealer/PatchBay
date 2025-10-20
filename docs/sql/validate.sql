-- Validation assertions: objects, RLS, functions, idempotency

-- Objects exist
select to_regclass('public.tenants')   is not null as tenants_ok;
select to_regclass('public.memberships') is not null as memberships_ok;
select to_regclass('public.profiles')  is not null as profiles_ok;
select to_regclass('public.pipelines') is not null as pipelines_ok;
select to_regclass('public.stages')    is not null as stages_ok;
select to_regclass('public.leads')     is not null as leads_ok;
select to_regclass('public.messages')  is not null as messages_ok;
select to_regclass('public.quotes')    is not null as quotes_ok;
select to_regclass('public.templates') is not null as templates_ok;
select to_regclass('public.messaging_credentials') is not null as messaging_credentials_ok;
select to_regclass('public.phone_numbers') is not null as phone_numbers_ok;
select to_regclass('public.outbox')    is not null as outbox_ok;
select to_regclass('public.notification_rules') is not null as notification_rules_ok;
select to_regclass('public.notifications') is not null as notifications_ok;
select to_regclass('public.rate_limits') is not null as rate_limits_ok;
select to_regclass('public.lead_field_schemas') is not null as lead_field_schemas_ok;

-- Enums present
select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname in (
  'membership_role','message_direction','message_channel','message_status','quote_status','notif_channel'
);

-- RLS enabled on key tables
with tables(name) as (
  values ('tenants'),('memberships'),('profiles'),('pipelines'),('stages'),('leads'),('messages'),('quotes'),('templates'),('messaging_credentials'),('phone_numbers'),('outbox'),('notification_rules'),('notifications'),('rate_limits'),('lead_field_schemas')
)
select name, relrowsecurity as rls_enabled
from tables t
join pg_class c on c.relname = t.name
join pg_namespace n on n.oid = c.relnamespace and n.nspname='public';

-- Functions exist
select proname from pg_proc p
join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
where proname in ('is_member','verify_ingest_token','resolve_tenant_for_inbound','verify_worker_token','take_token','set_tenant_token');

-- Token bucket quick behavior check (non-assertive, informational)
-- Edit the UUID below (tenant from bootstrap) before each call
with vars(tenant_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select public.take_token((select tenant_id from vars), 'sms', 2, 2.0) as take1;
with vars(tenant_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select public.take_token((select tenant_id from vars), 'sms', 2, 2.0) as take2;
with vars(tenant_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select public.take_token((select tenant_id from vars), 'sms', 2, 2.0) as take3_should_be_false_until_refill;


