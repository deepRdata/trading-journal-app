import { Suspense } from 'react'
import CallbackClient from './CallbackClient'

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Connecting to Schwab…</div>}>
      <CallbackClient />
    </Suspense>
  )
}
