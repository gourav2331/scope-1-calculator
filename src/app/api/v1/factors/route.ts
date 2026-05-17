import { NextResponse } from 'next/server'

import { CONSTANT_FACTORS, FUEL_DEFAULTS, GAS_DEFAULTS } from '@/lib/engine/constants'

export const runtime = 'nodejs'

/** Exposes the seed factor library so the UI can show defaults and let the user override them. */
export function GET() {
  return NextResponse.json({
    constants: Object.values(CONSTANT_FACTORS),
    fuels: Object.values(FUEL_DEFAULTS),
    gases: Object.values(GAS_DEFAULTS),
  })
}
