import { createClient } from "@supabase/supabase-js"

// The URL and the publishable (anon) key are public by design: they only identify the project. What a signed-in
// person may read or change is decided by row-level security and the api_* functions in supabase/migrations.
// Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (e.g. in Vercel) to point the app at another project.
const url = import.meta.env?.VITE_SUPABASE_URL ?? "https://cnovieupqdbowbaobvsw.supabase.co"
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_bqa9n7w0mIcn7WDYWIZIqQ_UQXxmgW8"

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
