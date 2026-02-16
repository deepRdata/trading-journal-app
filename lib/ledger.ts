import { Execution } from './types'

export interface LedgerRow {
  ex: Execution
  position: number
  avgPrice: number | null
  positionSize: number | null
  /**
   * Cumulative realized P/L for the trade so far.
   * We only surface it on the row where the position goes to 0 (final exit),
   * so the table doesn’t show confusing numbers on entry/partials.
   */
  realizedPnl: number | null
}

export function buildLedger(execs: Execution[]): LedgerRow[] {
  // sorted oldest -> newest
  const rows: LedgerRow[] = []
  let position = 0
  let costBasis = 0 // total $ cost of current position
  let realized = 0

  for (const ex of execs) {
    const qty = Number(ex.quantity)
    const px = Number(ex.price)

    if (!Number.isFinite(qty) || !Number.isFinite(px) || qty <= 0) {
      rows.push({
        ex,
        position,
        avgPrice: position > 0 ? round2(costBasis / position) : null,
        positionSize: position > 0 ? round2(position * (costBasis / position)) : null,
        realizedPnl: null
      })
      continue
    }

    if (ex.side === 'BUY') {
      position += qty
      costBasis += qty * px
    } else {
      // SELL reduces basis proportionally using current average cost.
      // If we somehow see a SELL with no position (bad import / missing BUY),
      // ignore it so we don’t fabricate huge “realized” numbers.
      if (position <= 0) {
        // no-op
      } else {
        const avg = costBasis / position
        realized += (px - avg) * qty
        position -= qty
        costBasis -= avg * qty
      }
    }

    const avgPrice = position > 0 ? costBasis / position : null
    const positionSize = position > 0 ? position * (avgPrice ?? px) : null

    rows.push({
      ex,
      position,
      avgPrice: avgPrice != null ? round2(avgPrice) : null,
      positionSize: positionSize != null ? round2(positionSize) : null,
      // only show realized P/L on final exit row (position == 0 after a SELL)
      realizedPnl: ex.side === 'SELL' && position === 0 ? round2(realized) : null
    })
  }

  return rows
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
