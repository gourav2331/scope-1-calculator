import type { Metadata } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Sustally Scope 1 Calculator',
  description: 'Cement-first Scope 1 calculator built with Next.js and Payload.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
