export type InstrumentType = 'Stock' | 'ETF'
export type Side = 'Long' | 'Short'
export type ExecutionAction = 'Entry' | 'Add' | 'Partial Exit' | 'Final Exit'

export type TradeStatus = 'OPEN' | 'CLOSED'

export interface Trade {
  id: string
  user_id: string
  account_id: string
  trade_no: number
  symbol: string
  instrument: InstrumentType
  side: Side
  status: TradeStatus
  opened_at: string
  closed_at: string | null
  setup: string | null
  entry_method: string | null
  exit_method: string | null
  stop_loss: number | null
  risk: number | null
  risk_multi: number | null
  adr_pct: number | null
  atr_pct: number | null
  lod_pct: number | null
  rvol: number | null
  rs: number | null
  bqi_regime: string | null
  bqi_swing: number | null
  bqi_avg: number | null
  highest_high: number | null
  lowest_low: number | null
  news: string | null
  length_days: number | null
  notes: string | null
  pnl: number | null
  gain_dollars: number | null
  gain_pct: number | null
  created_at: string
}

export interface Execution {
  id: string
  trade_id: string
  account_id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: number
  executed_at: string
  broker_exec_id: string | null
  broker_order_id: string | null
  action: ExecutionAction
  created_at: string
  pnl?: number | null
  position_size?: number | null

}
