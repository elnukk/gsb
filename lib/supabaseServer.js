// /lib/supabaseServer.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY // only for server use!

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey)
