import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://omhbavxbszlekkxxiylc.supabase.co'
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
