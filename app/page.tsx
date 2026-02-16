import Link from 'next/link'
import { AuthGate } from '@/components/AuthGate'

export default function HomePage() {
  return (
    <AuthGate>
      <div className="container">
        <div className="nav">
          <Link href="/trades">Trades</Link>
          <Link href="/import">Import Excel</Link>
          <Link href="/broker">Broker Sync</Link>
        </div>

        <div className="card">
          <h1 style={{marginTop:0}}>Trading Journal</h1>
          <p className="small">
            MVP: journal from anywhere + executions ledger. Next: Schwab sync + dashboards.
          </p>
          <p>
            Start with <Link href="/import">Import Excel</Link> to pull your 2026 journal in, or go to{' '}
            <Link href="/trades">Trades</Link> to create a trade manually.
          </p>
        </div>
      </div>
    </AuthGate>
  )
}
