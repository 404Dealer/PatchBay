-- Set per-tenant ingest token in Vault
create or replace function public.set_tenant_token(p_tenant_id uuid, p_token text)
returns void
language plpgsql
security definer
as $$
begin
  perform vault.set('tenant_token:'||p_tenant_id::text, p_token);
end;$$;


