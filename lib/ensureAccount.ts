import { supabase } from './supabaseClient'

export async function ensureDefaultAccount(user_id: string) {
  const { data, error } = await supabase.from('accounts').select('*').eq('user_id', user_id).limit(1)
  if (error) throw error
  if (data && data.length > 0) return data[0]

  const { data: created, error: err2 } = await supabase
    .from('accounts')
    .insert({ user_id, name: 'Main Cash', broker: 'SCHWAB', currency: 'USD' })
    .select('*')
    .single()
  if (err2) throw err2
  return created
}
