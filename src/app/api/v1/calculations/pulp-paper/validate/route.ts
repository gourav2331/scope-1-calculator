import { NextResponse } from 'next/server'

import { calculatePulpPaper } from '@/lib/engine/pulppaper'
import type { PulpPaperInputPayload } from '@/lib/engine/pulppaper'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let payload: PulpPaperInputPayload
  try {
    payload = (await req.json()) as PulpPaperInputPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = calculatePulpPaper(payload)
  return NextResponse.json({
    status: result.status,
    errors: result.errors,
    warnings: result.warnings,
  })
}
