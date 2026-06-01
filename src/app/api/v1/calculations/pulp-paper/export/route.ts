import { NextResponse } from 'next/server'

import { calculatePulpPaper } from '@/lib/engine/pulppaper'
import type { PulpPaperInputPayload } from '@/lib/engine/pulppaper'
import { buildPulpPaperPdf } from '@/lib/report/pulppaper-pdf'
import { buildPulpPaperWorkbook } from '@/lib/report/pulppaper-workbook'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { payload: PulpPaperInputPayload; format: 'json' | 'xlsx' | 'pdf' | 'csv' | 'audit-pack' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { payload, format } = body
  if (!payload) return NextResponse.json({ error: 'Missing payload' }, { status: 400 })

  const result = calculatePulpPaper(payload)
  // Strip non-ASCII characters from the filename — Content-Disposition
  // headers must be ASCII-only (bytes 0-255). Em-dash / smart quotes /
  // accented chars in facility names would otherwise crash with
  // "Cannot convert argument to a ByteString...".
  const safeName = (payload.facility?.name ?? 'mill')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
  const base = `scope1-pulppaper-${safeName}-FY${result.reportingPeriod.year}`

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
  if (format === 'audit-pack') {
    // Assurance bundle: every deliverable a verifier needs, in one ZIP.
    //  - <base>.xlsx       — the consultant-grade workbook
    //  - <base>.pdf        — the PDF inventory report
    //  - <base>.json       — full input payload + result + trace + snapshots
    //  - input-payload.json — input payload alone (for re-run)
    //  - factor-snapshots.json — every factor used, with provenance
    //  - calculation-trace.json — step-by-step engine trace
    //  - README.txt        — manifest + assurance statement
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const [xlsxBuf, pdfBuf] = await Promise.all([
      buildPulpPaperWorkbook(payload, result),
      buildPulpPaperPdf(payload, result),
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
      '# Sustally Scope 1 — Pulp & Paper assurance pack',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Organisation: ${payload.organization?.name ?? '—'}`,
      `Mill: ${payload.facility?.name ?? '—'} (${payload.facility?.millType ?? '—'})`,
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
      'Standards followed: GHG Protocol Corporate · ICFPA/NCASI v1.4 · IPCC 2006 (refined 2019)',
      '· US EPA GHGRP Subpart AA & C · EU ETS MRR · CSRD/ESRS E1 · AR5/AR6 GWPs.',
      '',
      'This pack is the complete audit trail for the calculation. Every factor is',
      'traceable to a citable source; every step is recorded. Re-import the .json',
      'into the calculator to reproduce the result exactly.',
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
