import { insertLead } from './queries/leads'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const service = process.env.SUPABASE_SERVICE_KEY!
  const tenantId = process.env.SEED_TENANT_ID!
  await insertLead(service, url, { tenantId, first_name: 'Demo', last_name: 'Lead', phone: '+15555550123', properties: { zip: '00000' } })
  console.log('Seed complete')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


