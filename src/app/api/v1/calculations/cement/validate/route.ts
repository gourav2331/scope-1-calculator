import { NextResponse } from 'next/server'

import { calculate } from '@/lib/engine/calculate'
import type { InputPayload } from '@/lib/engine/types'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let payload: InputPayload
  try {
    payload = (await req.json()) as InputPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = calculate(payload)
  return NextResponse.json({
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
  })
}
