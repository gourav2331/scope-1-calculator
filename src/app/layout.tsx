import type { Metadata } from 'next'
import { Inter, Newsreader } from 'next/font/google'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

// Editorial serif used for headlines (Anthropic / Claude-style typography).
const newsreader = Newsreader({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600'],
  variable: '--font-serif',
})

export const metadata: Metadata = {
  title: 'Sustally Scope 1 Calculator',
  description: 'Cement-first Scope 1 calculator built with Next.js and Payload.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  )
}
