import { NextResponse } from 'next/server'

import { calculatePulpPaper } from '@/lib/engine/pulppaper'
import type { PulpPaperInputPayload } from '@/lib/engine/pulppaper'
import { buildPulpPaperPdf } from '@/lib/report/pulppaper-pdf'
import { buildPulpPaperWorkbook } from '@/lib/report/pulppaper-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: PulpPaperInputPayload; format: 'json' | 'xlsx' | 'pdf' | 'csv' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculatePulpPaper(payload)
  const base = `scope1-pulppaper-${(payload.facility?.name ?? 'mill').replace(/\s+/g, '_')}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }
  if (format === 'xlsx') {
    const buf = await buildPulpPaperWorkbook(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      },
    })
  }
  if (format === 'csv') {
    // CSV bundle: summary key/value rows + per-category gas breakdown.
    const c = result.scope1.byCategory
    const g = result.scope1.byGas
    const im = result.intensityMetrics
    const rows: Array<[string, string | number, string]> = [
      ['Organisation', payload.organization.name, ''],
      ['Mill', payload.facility.name, ''],
      ['Mill type', payload.facility.millType, ''],
      ['Reporting year', result.reportingPeriod.year, ''],
      ['Methodology pack', result.methodologyPack, ''],
      ['GWP set', result.gwpSet, ''],
      ['Status', result.status, ''],
      ['Data quality', result.dataQuality.overall, ''],
      ['Gross Scope 1', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
      ['Stationary combustion CO2e', c.stationaryCombustion.co2eTonnes, 'tCO2e'],
      ['Biomass combustion CO2e (CH4+N2O only)', c.biomassCombustion.co2eTonnes, 'tCO2e'],
      ['Lime kilns CO2e', c.limeKilns.co2eTonnes, 'tCO2e'],
      ['Make-up carbonates CO2e', c.makeupCarbonates.co2eTonnes, 'tCO2e'],
      ['Mobile (owned) CO2e', c.mobile.co2eTonnes, 'tCO2e'],
      ['Landfills CO2e', c.landfills.co2eTonnes, 'tCO2e'],
      ['Anaerobic WWT CO2e', c.anaerobicWwt.co2eTonnes, 'tCO2e'],
      ['Refrigerants CO2e', c.refrigerants.co2eTonnes, 'tCO2e'],
      ['CO2 transfers (signed) CO2e', c.co2Transfers.co2eTonnes, 'tCO2e'],
      ['Reported CO2e', c.reported.co2eTonnes, 'tCO2e'],
      ['By gas - CO2', g.co2Tonnes, 'tCO2'],
      ['By gas - CH4 (mass)', g.ch4Tonnes, 'tCH4'],
      ['By gas - CH4 (as CO2e)', g.ch4CO2eTonnes, 'tCO2e'],
      ['By gas - N2O (mass)', g.n2oTonnes, 'tN2O'],
      ['By gas - N2O (as CO2e)', g.n2oCO2eTonnes, 'tCO2e'],
      ['By gas - Refrigerants (as CO2e)', g.refrigerantCO2eTonnes, 'tCO2e'],
      ['Biogenic CO2 (memo - excluded)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
      ['Supporting Scope 2 - electricity', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
      ['Supporting Scope 3 - 3p mobile', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
      ['Air-dry pulp produced', payload.activityData.production.airDryPulpTonnes ?? '', 'ADt'],
      ['Paper produced', payload.activityData.production.paperProducedTonnes ?? '', 't'],
      ['Board produced', payload.activityData.production.boardProducedTonnes ?? '', 't'],
      ['Intensity - per ADt pulp', im.co2ePerAdtPulp ?? '', 'kgCO2e/ADt'],
      ['Intensity - per t paper', im.co2ePerTonnePaper ?? '', 'kgCO2e/t'],
      ['Intensity - per t board', im.co2ePerTonneBoard ?? '', 'kgCO2e/t'],
      ['Fossil CO2 per ADt pulp', im.fossilCo2PerAdtPulp ?? '', 'kgCO2/ADt'],
    ]
    const esc = (s: string | number) => {
      const str = String(s)
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
    }
    const csv = ['item,value,unit', ...rows.map((r) => r.map(esc).join(','))].join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.csv"`,
      },
    })
  }

  if (format === 'pdf') {
    const buf = await buildPulpPaperPdf(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }
  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
