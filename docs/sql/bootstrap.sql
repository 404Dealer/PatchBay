-- Bootstrap: create an initial tenant and membership for a given user
-- Replace these with your actual values before running
-- select your user id from dashboard -> Auth -> Users
-- e.g. set these via the SQL editor before executing the rest:
-- \set user_id '00000000-0000-0000-0000-000000000000'
-- \set tenant_name 'Acme Inc.'
-- \set tenant_token 'super-secret-opaque'

-- Create tenant
insert into tenants(name)
values (coalesce(:'tenant_name', 'Acme Inc.'))
returning id into :tenant_id;

-- Create profile row for the user if missing (auth.users already has the id)
insert into profiles(id, display_name)
values (:'user_id'::uuid, 'Owner')
on conflict (id) do nothing;

-- Add membership as owner
insert into memberships(user_id, tenant_id, role)
values (:'user_id'::uuid, :'tenant_id'::uuid, 'owner')
on conflict do nothing;

-- Optional: example pipeline and stage
insert into pipelines(tenant_id, name) values(:'tenant_id'::uuid, 'Default') returning id into :pipeline_id;
insert into stages(tenant_id, pipeline_id, name, position) values(:'tenant_id'::uuid, :'pipeline_id'::uuid, 'New', 0);

-- Set ingest token in Vault
-- Token format expected by verify_ingest_token: <tenant_id>:<opaque>
select public.set_tenant_token(:'tenant_id'::uuid, coalesce(:'tenant_token', 'dev-token'));

-- Show outputs
select :'tenant_id' as tenant_id, :'pipeline_id' as pipeline_id;

-- Optional: owner SMS alert via shared Twilio fallback. Uncomment and set target number if desired.
-- insert into notification_rules (tenant_id, event_type, channel, target, use_business_number)
-- values (:'tenant_id'::uuid, 'lead.created', 'sms', '+15551234567', true);


