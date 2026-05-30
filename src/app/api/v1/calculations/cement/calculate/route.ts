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

  let result
  try {
    result = calculate(payload)
  } catch (err) {
    return NextResponse.json(
      { error: 'Calculation engine error', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }

  const url = new URL(req.url)
  if (url.searchParams.get('save') === 'true') {
    try {
      const { getPayload } = await import('payload')
      const config = (await import('@/payload.config')).default
      const cms = await getPayload({ config })
      const saved = await cms.create({
        collection: 'calculations',
        draft: false,
        data: {
          name: `${payload.organization?.name ?? 'Org'} — ${payload.facility?.name ?? 'Facility'} — FY ${payload.calculationContext?.reportingPeriod?.year}`,
          reportingYear: payload.calculationContext?.reportingPeriod?.year ?? new Date().getFullYear(),
          status:
            result.status === 'BLOCKED'
              ? 'blocked'
              : result.status === 'SUCCESS_WITH_WARNINGS'
                ? 'success_with_warnings'
                : 'calculated',
          sectorCode: 'CEMENT',
          workflowStatus: 'draft',
          gwpSet: payload.calculationContext?.gwpSet ?? 'AR6',
          grossScope1Tonnes: result.scope1.grossScope1CO2Tonnes,
          biomassMemoTonnes: result.memoItems.biomassCO2Tonnes,
          supportingScope2Tonnes: result.supportingScope2.purchasedElectricityCO2Tonnes,
          supportingScope3Tonnes: result.supportingScope3.boughtClinkerCO2Tonnes,
          inputPayload: payload as unknown as Record<string, unknown>,
          result: result as unknown as Record<string, unknown>,
          calculationTrace: result.calculationTrace as unknown as Record<string, unknown>,
          factorSnapshots: result.factorSnapshots as unknown as Record<string, unknown>,
          calculatedAt: new Date().toISOString(),
        },
      })
      return NextResponse.json({ result, calculationId: saved.id })
    } catch (err) {
      // Persistence is best-effort: never block returning a correct result.
      return NextResponse.json({
        result,
        calculationId: null,
        persistenceWarning: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ result, calculationId: null })
}
