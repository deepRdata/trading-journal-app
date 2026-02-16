import { supabase } from './supabaseClient'

export async function recomputeExecutionActions(trade_id: string) {
  const { data: rows, error } = await supabase
    .from('executions')
    .select('*')
    .eq('trade_id', trade_id)
    .order('executed_at', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  const execs = (rows ?? []) as any[]

  let position = 0
  const updates: { id: string; action: string }[] = []
  let seenEntry = false

  for (const ex of execs) {
    const isBuy = ex.side === 'BUY'
    if (isBuy) {
      const action = seenEntry ? 'Add' : 'Entry'
      seenEntry = true
      position += Number(ex.quantity)
      updates.push({ id: ex.id, action })
    } else {
      // SELL
      position -= Number(ex.quantity)
      const action = position === 0 ? 'Final Exit' : 'Partial Exit'
      updates.push({ id: ex.id, action })
    }
  }

  // batch update
  for (const u of updates) {
    const { error: e2 } = await supabase.from('executions').update({ action: u.action }).eq('id', u.id)
    if (e2) throw e2
  }
}
