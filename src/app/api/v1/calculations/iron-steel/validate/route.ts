import { NextResponse } from 'next/server'

import { calculateIronSteel } from '@/lib/engine/ironsteel'
import type { IronSteelInputPayload } from '@/lib/engine/ironsteel'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let payload: IronSteelInputPayload
  try {
    payload = (await req.json()) as IronSteelInputPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = calculateIronSteel(payload)
  return NextResponse.json({
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
  })
}
