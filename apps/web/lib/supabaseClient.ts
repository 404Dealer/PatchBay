import { createServerComponentClient, createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export function getServerComponentSupabase() {
  return createServerComponentClient({ cookies })
}

export function getRouteSupabase() {
  return createRouteHandlerClient({ cookies })
}


