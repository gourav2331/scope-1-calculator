import { NextResponse } from 'next/server'

import { calculatePower } from '@/lib/engine/power'
import type { PowerInputPayload } from '@/lib/engine/power'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let payload: PowerInputPayload
  try {
    payload = (await req.json()) as PowerInputPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = calculatePower(payload)
  return NextResponse.json({
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
  })
}
