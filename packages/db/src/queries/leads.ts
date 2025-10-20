import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const LeadInput = z.object({
  tenantId: z.string().uuid(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  properties: z.record(z.any()).default({})
})

export async function insertLead(serviceKey: string, url: string, input: z.infer<typeof LeadInput>) {
  const sb = createClient(url, serviceKey)
  const { error } = await sb.from('leads').insert({
    tenant_id: input.tenantId,
    first_name: input.first_name ?? null,
    last_name: input.last_name ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    properties: input.properties
  } as any)
  if (error) throw error
}


