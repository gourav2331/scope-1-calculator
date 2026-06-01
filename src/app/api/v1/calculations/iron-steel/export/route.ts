import { NextResponse } from 'next/server'

import { calculateIronSteel } from '@/lib/engine/ironsteel'
import type { IronSteelInputPayload } from '@/lib/engine/ironsteel'
import { buildIronSteelPdf } from '@/lib/report/ironsteel-pdf'
import { buildIronSteelWorkbook } from '@/lib/report/ironsteel-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: IronSteelInputPayload; format: 'json' | 'xlsx' | 'pdf' | 'csv' | 'audit-pack' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculateIronSteel(payload)
  // Strip non-ASCII characters from the filename — Content-Disposition
  // headers must be ASCII-only (bytes 0-255). Em-dash / smart quotes /
  // accented chars in facility names would otherwise crash with
  // "Cannot convert argument to a ByteString...".
  const safeName = (payload.facility?.name ?? 'plant')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
  const base = `scope1-ironsteel-${safeName}-FY${result.reportingPeriod.year}`

  if (format === 'json') {
    return new NextResponse(JSON.stringify({ inputPayload: payload, result }, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${base}.json"`,
      },
    })
  }
  if (format === 'xlsx') {
    const buf = await buildIronSteelWorkbook(payload, result)
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
      ['Process route', payload.facility.processRoute, ''],
      ['Reporting year', result.reportingPeriod.year, ''],
      ['Methodology pack', result.methodologyPack, ''],
      ['GWP set', result.gwpSet, ''],
      ['Status', result.status, ''],
      ['Data quality', result.dataQuality.overall, ''],
      ['Gross Scope 1', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
      ['Stationary combustion', c.stationaryCombustion.co2eTonnes, 'tCO2e'],
      ['Mobile (owned)', c.mobile.co2eTonnes, 'tCO2e'],
      ['Coke oven', c.cokeOven.co2eTonnes, 'tCO2e'],
      ['Flaring', c.flaring.co2eTonnes, 'tCO2e'],
      ['Sinter', c.sinter.co2eTonnes, 'tCO2e'],
      ['DRI', c.dri.co2eTonnes, 'tCO2e'],
      ['BF/BOF', c.bfBof.co2eTonnes, 'tCO2e'],
      ['EAF', c.eaf.co2eTonnes, 'tCO2e'],
      ['Lime kiln', c.limeKiln.co2eTonnes, 'tCO2e'],
      ['Fugitive HFC', c.fugitiveHFC.co2eTonnes, 'tCO2e'],
      ['Fugitive SF6', c.fugitiveSF6.co2eTonnes, 'tCO2e'],
      ['Fugitive other (CH4)', c.fugitiveOther.co2eTonnes, 'tCO2e'],
      ['Reported / direct', c.reported.co2eTonnes, 'tCO2e'],
      ['By gas - CO2', g.co2Tonnes, 'tCO2'],
      ['By gas - CH4 (mass)', g.ch4Tonnes, 'tCH4'],
      ['By gas - CH4 (as CO2e)', g.ch4CO2eTonnes, 'tCO2e'],
      ['By gas - N2O (mass)', g.n2oTonnes, 'tN2O'],
      ['By gas - N2O (as CO2e)', g.n2oCO2eTonnes, 'tCO2e'],
      ['By gas - HFCs (as CO2e)', g.hfcCO2eTonnes, 'tCO2e'],
      ['By gas - SF6 (as CO2e)', g.sf6CO2eTonnes, 'tCO2e'],
      ['Biogenic CO2 (memo - excluded)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
      ['Supporting Scope 2 - electricity', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
      ['Supporting Scope 3 - 3p mobile', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
      ['Crude steel produced', payload.activityData.production.crudeSteelTonnes ?? '', 't'],
      ['Hot rolled produced', payload.activityData.production.hotRolledTonnes ?? '', 't'],
      ['Hot metal produced', payload.activityData.production.hotMetalTonnes ?? '', 't'],
      ['Intensity per t crude steel', im.co2ePerTonneCrudeSteel ?? '', 'kgCO2e/t'],
      ['Intensity per t hot rolled', im.co2ePerTonneHotRolled ?? '', 'kgCO2e/t'],
      ['Intensity per t hot metal', im.co2ePerTonneHotMetal ?? '', 'kgCO2e/t'],
      ['Fossil CO2 per t crude steel', im.fossilCo2PerTonneCrudeSteel ?? '', 'kgCO2/t'],
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
    const buf = await buildIronSteelPdf(payload, result)
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
      buildIronSteelWorkbook(payload, result),
      buildIronSteelPdf(payload, result),
    ])
    zip.file(`${base}.xlsx`, xlsxBuf)
    zip.file(`${base}.pdf`, pdfBuf)
    zip.file(`${base}.json`, JSON.stringify({ inputPayload: payload, result }, null, 2))
    zip.file('input-payload.json', JSON.stringify(payload, null, 2))
    zip.file('factor-snapshots.json', JSON.stringify(result.factorSnapshots, null, 2))
    zip.file('calculation-trace.json', JSON.stringify(result.calculationTrace, null, 2))
    zip.file('assumptions.json', JSON.stringify(result.assumptions, null, 2))
    zip.file('validation.json', JSON.stringify({ errors: result.errors, warnings: result.warnings }, null, 2))
    const readme = [
      '# Sustally Scope 1 — Iron & Steel assurance pack',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Organisation: ${payload.organization?.name ?? '—'}`,
      `Plant: ${payload.facility?.name ?? '—'} (${payload.facility?.processRoute ?? '—'})`,
      `Reporting year: ${result.reportingPeriod.year}`,
      `Methodology pack: ${result.methodologyPack}`,
      `GWP set: ${result.gwpSet}`,
      `Status: ${result.status}`,
      `Data quality: ${result.dataQuality.overall}`,
      `Gross Scope 1: ${result.scope1.grossScope1CO2eTonnes} tCO2e`,
      `Biogenic CO2 (memo, excluded): ${result.memoItems.biogenicCO2Tonnes} tCO2`,
      '',
      'Contents:',
      `  ${base}.xlsx             Audit workbook (summary, by-category, methodology, snapshots, trace, validation)`,
      `  ${base}.pdf              PDF inventory report (consultant deliverable)`,
      `  ${base}.json             Full input + result snapshot (for re-run / archive)`,
      '  input-payload.json       Input payload alone',
      '  factor-snapshots.json    Every emission factor used, with provenance',
      '  calculation-trace.json   Step-by-step engine trace',
      '  assumptions.json         Defaults / fallbacks / overrides / estimates relied on',
      '  validation.json          Validation errors + warnings raised by the engine',
      '',
      'Standards followed: GHG Protocol Corporate + ISO 14064-1:2018 +',
      'ISO 14404-1/2/3/4 + worldsteel CO2 v11 (2024) + IPCC 2006 Vol 3 Ch 4',
      '+ 2019 Refinement + EU ETS MRR (Reg 2018/2066) + EU CBAM (Reg 2023/956)',
      '+ US EPA GHGRP Subpart Q + India CCTS / Green Steel Notification.',
      '',
      'This pack is the complete audit trail for the calculation. Every factor',
      'is traceable to a citable source; every step is recorded. Re-import the',
      '.json into the calculator to reproduce the result exactly.',
      '',
    ].join('\n')
    zip.file('README.txt', readme)
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer' })
    return new NextResponse(new Uint8Array(zipBuf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${base}-audit-pack.zip"`,
      },
    })
  }
  return NextResponse.json({ error: 'Unknown format' }, { status: 400 })
}
