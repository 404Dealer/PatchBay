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
  -- lock row if exists
  select tokens::numeric, updated_at into v_tokens, v_updated_at
  from rate_limits where tenant_id = p_tenant_id and bucket = p_bucket for update;

  if not found then
    -- initialize bucket and take one token
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


