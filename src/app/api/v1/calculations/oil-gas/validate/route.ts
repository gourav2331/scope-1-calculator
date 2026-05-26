import { NextResponse } from 'next/server'

import { calculateOilGas } from '@/lib/engine/oilgas'
import type { OilGasInputPayload } from '@/lib/engine/oilgas'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let payload: OilGasInputPayload
  try {
    payload = (await req.json()) as OilGasInputPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = calculateOilGas(payload)
  return NextResponse.json({
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
  })
}
