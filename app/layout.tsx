import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Trading Journal',
  description: 'Cloud trading journal with broker sync'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
