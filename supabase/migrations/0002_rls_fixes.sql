-- Fix RLS policies for tenants and memberships to allow initial bootstrap

-- Drop generic policies that reference tenant_id on tenants
drop policy if exists tenants_tenant_select on tenants;
drop policy if exists tenants_tenant_all on tenants;

-- Tenants: allow select for members; allow insert for authenticated users
create policy tenants_member_read on tenants for select using (
  exists (
    select 1 from memberships m where m.tenant_id = tenants.id and m.user_id = auth.uid()
  )
);

create policy tenants_insert_any_auth on tenants for insert with check (auth.uid() is not null);

-- Memberships: keep generic select; allow self-insert to create initial membership
drop policy if exists memberships_tenant_all on memberships;
drop policy if exists memberships_tenant_select on memberships;

create policy memberships_member_read on memberships for select using (
  exists (
    select 1 from memberships m2 where m2.tenant_id = memberships.tenant_id and m2.user_id = auth.uid()
  )
);

create policy memberships_self_insert on memberships for insert with check (
  user_id = auth.uid()
);

create policy memberships_member_all on memberships for all using (
  exists (
    select 1 from memberships m2 where m2.tenant_id = memberships.tenant_id and m2.user_id = auth.uid()
  )
);


