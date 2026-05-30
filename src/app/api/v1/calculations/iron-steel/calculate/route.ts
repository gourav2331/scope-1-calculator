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

  let result
  try {
    result = calculateIronSteel(payload)
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
          sectorCode: 'IRON_STEEL',
          workflowStatus: 'draft',
          gwpSet: result.gwpSet,
          grossScope1Tonnes: result.scope1.grossScope1CO2eTonnes,
          biomassMemoTonnes: result.memoItems.biogenicCO2Tonnes,
          supportingScope2Tonnes: result.supportingScope2.purchasedElectricityCO2eTonnes,
          supportingScope3Tonnes: result.supportingScope3.thirdPartyMobileCO2eTonnes,
          inputPayload: payload as unknown as Record<string, unknown>,
          result: result as unknown as Record<string, unknown>,
          calculationTrace: result.calculationTrace as unknown as Record<string, unknown>,
          factorSnapshots: result.factorSnapshots as unknown as Record<string, unknown>,
          calculatedAt: new Date().toISOString(),
        },
      })
      return NextResponse.json({ result, calculationId: saved.id })
    } catch (err) {
      return NextResponse.json({
        result,
        calculationId: null,
        persistenceWarning: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({ result, calculationId: null })
}
