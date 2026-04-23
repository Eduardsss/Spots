import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    'KĻŪDA: Trūkst obligāto vides mainīgo: SUPABASE_URL un SUPABASE_SERVICE_ROLE_KEY'
  )
  process.exit(1)
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
