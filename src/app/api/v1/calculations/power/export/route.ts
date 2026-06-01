import { NextResponse } from 'next/server'

import { calculatePower } from '@/lib/engine/power'
import type { PowerInputPayload } from '@/lib/engine/power'
import { buildPowerPdf } from '@/lib/report/power-pdf'
import { buildPowerWorkbook } from '@/lib/report/power-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: PowerInputPayload; format: 'json' | 'xlsx' | 'pdf' | 'csv' | 'audit-pack' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculatePower(payload)
  // Strip non-ASCII characters from the filename — Content-Disposition
  // headers must be ASCII-only (bytes 0-255). Em-dash / smart quotes /
  // accented chars in facility names would otherwise crash with
  // "Cannot convert argument to a ByteString...".
  const safeName = (payload.facility?.name ?? 'plant')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
  const base = `scope1-power-${safeName}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }
  if (format === 'xlsx') {
    const buf = await buildPowerWorkbook(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${base}.xlsx"`,
      },
    })
  }
  if (format === 'csv') {
    const c = result.scope1.byCategory
    const g = result.scope1.byGas
    const im = result.intensityMetrics
    const rows: Array<[string, string | number, string]> = [
      ['Organisation', payload.organization.name, ''],
      ['Plant', payload.facility.name, ''],
      ['Plant technology', payload.facility.technology, ''],
      ['Reporting year', result.reportingPeriod.year, ''],
      ['Methodology pack', result.methodologyPack, ''],
      ['GWP set', result.gwpSet, ''],
      ['Status', result.status, ''],
      ['Data quality', result.dataQuality.overall, ''],
      ['Gross Scope 1', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
      ['CCS captured & stored (deducted)', result.ccsCapturedAndStoredTonnes, 'tCO2'],
      ['Stationary - main', c.stationaryMain.co2eTonnes, 'tCO2e'],
      ['Stationary - auxiliary', c.stationaryAuxiliary.co2eTonnes, 'tCO2e'],
      ['Biomass cofiring (CH4/N2O only in gross)', c.biomassCofiring.co2eTonnes, 'tCO2e'],
      ['Mobile (owned)', c.mobile.co2eTonnes, 'tCO2e'],
      ['Process - FGD limestone', c.fgdLimestone.co2eTonnes, 'tCO2e'],
      ['Process - SCR/SNCR urea', c.scrUrea.co2eTonnes, 'tCO2e'],
      ['Fugitive SF6', c.fugitiveSF6.co2eTonnes, 'tCO2e'],
      ['Fugitive HFC', c.fugitiveHFC.co2eTonnes, 'tCO2e'],
      ['Fugitive other CH4', c.fugitiveOtherCH4.co2eTonnes, 'tCO2e'],
      ['Reported / direct', c.reported.co2eTonnes, 'tCO2e'],
      ['By gas - CO2', g.co2Tonnes, 'tCO2'],
      ['By gas - CH4 (mass)', g.ch4Tonnes, 'tCH4'],
      ['By gas - N2O (mass)', g.n2oTonnes, 'tN2O'],
      ['By gas - SF6 (mass)', g.sf6Tonnes, 'tSF6'],
      ['By gas - HFCs (CO2e)', g.hfcCO2eTonnes, 'tCO2e'],
      ['Biogenic CO2 (memo - excluded)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
      ['CCS process vent (memo)', result.memoItems.ccsProcessVentTonnes, 'tCO2'],
      ['Supporting Scope 2 - electricity', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
      ['Supporting Scope 3 - 3p mobile', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
      ['Gross generation', payload.activityData.production.grossGenerationMwh ?? '', 'MWh'],
      ['Net generation', payload.activityData.production.netGenerationMwh ?? '', 'MWh'],
      ['Intensity per MWh net (the headline)', im.co2ePerMwhNet ?? '', 'kgCO2e/MWh'],
      ['Intensity per MWh gross', im.co2ePerMwhGross ?? '', 'kgCO2e/MWh'],
      ['Fossil CO2 per MWh net', im.fossilCo2PerMwhNet ?? '', 'kgCO2/MWh'],
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
    const buf = await buildPowerPdf(payload, result)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${base}.pdf"`,
      },
    })
  }
  if (format === 'audit-pack') {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const [xlsxBuf, pdfBuf] = await Promise.all([
      buildPowerWorkbook(payload, result),
      buildPowerPdf(payload, result),
    ])
    zip.file(`${base}.xlsx`, xlsxBuf)
    zip.file(`${base}.pdf`, pdfBuf)
    zip.file(`${base}.json`, JSON.stringify({ inputPayload: payload, result }, null, 2))
    zip.file('input-payload.json', JSON.stringify(payload, null, 2))
    zip.file('factor-snapshots.json', JSON.stringify(result.factorSnapshots, null, 2))
    zip.file('calculation-trace.json', JSON.stringify(result.calculationTrace, null, 2))
    zip.file('assumptions.json', JSON.stringify(result.assumptions, null, 2))
    zip.file('validation.json', JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2))
    zip.file('README.txt', `Power Sector Scope 1 audit pack — ${base}\n\nMethodology pack: ${result.methodologyPack}\nGWP set: ${result.gwpSet}\nStatus: ${result.status}\n\nFiles:\n  ${base}.xlsx — Excel report\n  ${base}.pdf — PDF report\n  input-payload.json — input data\n  factor-snapshots.json — every default factor used (with source + version)\n  calculation-trace.json — every formula step\n  assumptions.json — defaults + fallbacks register\n  validation.json — errors + warnings\n`)
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${base}-audit-pack.zip"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
