/**
 * Pulp & Paper audit workbook: summary, by-category gas breakdown, biogenic
 * memo, reconciliation, assumptions, methodology, factor snapshots, trace,
 * and validation. Shares the methodology / snapshot / trace / issues sheets
 * with cement and O&G via ./shared.
 */

import ExcelJS from 'exceljs'

import type { PulpPaperCalculationResult, PulpPaperInputPayload } from '@/lib/engine/pulppaper'
import {
  addFactorSnapshotsSheet,
  addIssuesSheet,
  addMethodologySheet,
  addTraceSheet,
  type MethodologyContent,
} from './shared'

const CATEGORY_LABELS: Record<string, string> = {
  stationaryCombustion: 'Stationary combustion (fossil)',
  biomassCombustion: 'Biomass combustion (CH4/N2O; biogenic CO2 = memo)',
  limeKilns: 'Lime kilns / calciners',
  makeupCarbonates: 'Make-up carbonates (CaCO3 / Na2CO3 / dolomite)',
  mobile: 'Mobile (owned / controlled)',
  landfills: 'Mill-owned landfills',
  anaerobicWwt: 'Anaerobic WWT & sludge digestion',
  refrigerants: 'Refrigerant HFCs',
  chpAllocation: 'CHP allocation (analytical)',
  co2Transfers: 'CO2 transfers (PCC export / import)',
  reported: 'Reported / direct',
}

export function pulpPaperBoundaryText(payload: PulpPaperInputPayload): string {
  const b = payload.organizationBoundary
  if (b.boundaryMethod === 'EQUITY_SHARE') {
    return `Equity share — ${b.consolidationPercent ?? b.ownershipSharePercent ?? 100}% of each source consolidated`
  }
  if (b.boundaryMethod === 'FINANCIAL_CONTROL') return 'Financial control — 100% of financially controlled assets'
  return 'Operational control — 100% of operated assets (GHG Protocol recommended)'
}

export function pulpPaperMethodology(
  payload: PulpPaperInputPayload,
  result: PulpPaperCalculationResult,
): MethodologyContent {
  return {
    standards: [
      'GHG Protocol Corporate Standard (WRI/WBCSD)',
      'ICFPA / NCASI Calculation Tools v1.4 (sector-specific; WRI/WBCSD-endorsed)',
      'IPCC 2006 Guidelines, refined 2019 (combustion NCVs & EFs, FOD)',
      'US EPA GHGRP Subpart AA (Pulp & Paper) and Subpart C (Stationary Combustion)',
      'EU ETS MRR (Implementing Reg. 2018/2066, amended 2023–2024)',
      'CEPI Framework for Carbon Footprints of Paper & Board (2017)',
      'CSRD / ESRS E1 disclosure conventions',
      `IPCC ${result.gwpSet.replace('_', ' · ')} Global Warming Potentials`,
    ],
    boundary: pulpPaperBoundaryText(payload),
    gwpBasis: `${result.gwpSet.replace('_', ' · ')} — fossil & biogenic CH4 weighted accordingly; refrigerant HFC GWPs on the 100-year basis (industry convention)`,
    covered: [
      'Stationary fossil-fuel combustion (boilers, IR dryers, RTOs, turbines, engines)',
      'Biomass combustion CH4 / N2O — wood/bark, black liquor, sulphite liquor, biogas, NCG (biogenic CO2 reported as memo)',
      'Kraft mill lime kilns and calciners (fossil fuel + biogenic CaCO3 calcination as memo)',
      'Make-up carbonates: CaCO3 (0.440 tCO2/t), Na2CO3 (0.415 tCO2/t), dolomite (0.477 tCO2/t) — fossil origin',
      'Mobile / on-site equipment (owned/controlled; third-party shown as supporting Scope 3)',
      'Mill-owned landfill CH4 — direct gas measurement or simplified FOD',
      'Anaerobic wastewater treatment / sludge digestion CH4 — gas capture or activity-based (COD/BOD)',
      'Refrigerant HFC fugitives — mass balance (preferred) or screening factor',
      'CHP heat/power allocation via WRI/WBCSD Simplified Efficiency Method (analytical only)',
      'Fossil CO2 imports / exports — adjacent PCC plant deduction (§7.10)',
      'Reported / direct entries for corporate-aggregate disclosure',
    ],
    exclusions: [
      'Purchased electricity is Scope 2 — reported as a supporting line only, never in gross Scope 1.',
      'Third-party logistics / outsourced transport — Scope 3, excluded from gross.',
      'CCS permanence accounting (transport / storage / leakage-reversal) — not modelled.',
      'Detailed FOD with year-by-year deposit history — simplified FOD provided; detailed FOD deferred.',
      'Uncertainty propagation (Monte Carlo) and Annexure-C reconciliation packs — not computed.',
      'Multi-year base-year recalculation (GHG Protocol restatement) — single reporting year per inventory.',
    ],
    notes: [
      'Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + HFC refrigerants). Biogenic CO2 is the SEPARATE memo line.',
      'Biogenic CH4 and N2O DO count in gross Scope 1 (carbon-neutrality applies only to the CO2 carbon cycle).',
      'CFB boilers have N2O ~10× higher than other configurations — flagged when CFB tech selected.',
      'Lime kiln CaCO3 calcination CO2 is biogenic (recovery-cycle carbon) and goes to the memo, not gross Scope 1.',
    ],
  }
}

export async function buildPulpPaperWorkbook(
  payload: PulpPaperInputPayload,
  result: PulpPaperCalculationResult,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sustally Scope 1 Calculator'
  wb.created = new Date()

  // --- Summary -----------------------------------------------------------
  const summary = wb.addWorksheet('Summary')
  summary.columns = [
    { header: 'Item', key: 'k', width: 50 },
    { header: 'Value', key: 'v', width: 24 },
    { header: 'Unit', key: 'u', width: 18 },
  ]
  const cat = result.scope1.byCategory
  const g = result.scope1.byGas
  const im = result.intensityMetrics
  const rows: [string, number | string, string][] = [
    ['Organisation', payload.organization.name, ''],
    ['Mill', payload.facility.name, ''],
    ['Mill type', payload.facility.millType, ''],
    ['Reporting year', result.reportingPeriod.year, ''],
    ['Methodology pack', result.methodologyPack, ''],
    ['GWP set', result.gwpSet, ''],
    ['Status', result.status, ''],
    ['Data quality', result.dataQuality.overall, ''],
    ['— Gross Scope 1 (CO2 + CH4 + N2O + HFCs)', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
    ['  Stationary combustion (fossil)', cat.stationaryCombustion.co2eTonnes, 'tCO2e'],
    ['  Biomass combustion (CH4/N2O)', cat.biomassCombustion.co2eTonnes, 'tCO2e'],
    ['  Lime kilns', cat.limeKilns.co2eTonnes, 'tCO2e'],
    ['  Make-up carbonates', cat.makeupCarbonates.co2eTonnes, 'tCO2e'],
    ['  Mobile (owned)', cat.mobile.co2eTonnes, 'tCO2e'],
    ['  Landfills', cat.landfills.co2eTonnes, 'tCO2e'],
    ['  Anaerobic WWT', cat.anaerobicWwt.co2eTonnes, 'tCO2e'],
    ['  Refrigerants', cat.refrigerants.co2eTonnes, 'tCO2e'],
    ['  CO2 transfers (export/import)', cat.co2Transfers.co2eTonnes, 'tCO2e'],
    ['  Reported / direct', cat.reported.co2eTonnes, 'tCO2e'],
    ['— By gas: CO2', g.co2Tonnes, 'tCO2'],
    ['  CH4 (mass)', g.ch4Tonnes, 'tCH4'],
    ['  CH4 (as CO2e)', g.ch4CO2eTonnes, 'tCO2e'],
    ['  N2O (mass)', g.n2oTonnes, 'tN2O'],
    ['  N2O (as CO2e)', g.n2oCO2eTonnes, 'tCO2e'],
    ['  Refrigerants (as CO2e)', g.refrigerantCO2eTonnes, 'tCO2e'],
    ['Biogenic CO2 (memo, EXCLUDED from gross)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
    ['Supporting Scope 2 (electricity)', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
    ['Supporting Scope 3 (third-party mobile)', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
    ['Intensity — per ADt pulp', im.co2ePerAdtPulp ?? 'n/a', 'kgCO2e/ADt'],
    ['Intensity — per t paper', im.co2ePerTonnePaper ?? 'n/a', 'kgCO2e/t'],
    ['Intensity — per t board', im.co2ePerTonneBoard ?? 'n/a', 'kgCO2e/t'],
    ['Fossil CO2 intensity — per ADt pulp', im.fossilCo2PerAdtPulp ?? 'n/a', 'kgCO2/ADt'],
    ['Reconciliation — disclosed gross', result.reconciliation.checked ? (result.reconciliation.disclosedGrossCO2eTonnes ?? 'n/a') : 'n/a', 'tCO2e'],
    ['Reconciliation — modelled gross', result.reconciliation.checked ? result.reconciliation.modelledGrossCO2eTonnes : 'n/a', 'tCO2e'],
    ['Reconciliation — variance', result.reconciliation.checked ? (result.reconciliation.variancePercent ?? 0) : 'n/a', '%'],
    ['Assumptions & limitations', result.assumptions.length, '(see Assumptions sheet)'],
  ]
  rows.forEach(([k, v, u]) => summary.addRow({ k, v, u }))
  summary.getRow(1).font = { bold: true }
  summary.getRow(10).font = { bold: true } // gross Scope 1 line

  // --- By category (gas-level) ------------------------------------------
  const byCat = wb.addWorksheet('By category')
  byCat.columns = [
    { header: 'Category', key: 'cat', width: 44 },
    { header: 'CO2 (t)', key: 'co2', width: 16 },
    { header: 'CH4 (t)', key: 'ch4', width: 16 },
    { header: 'N2O (t)', key: 'n2o', width: 16 },
    { header: 'Biogenic CO2 (t)', key: 'bio', width: 18 },
    { header: 'CO2e (t)', key: 'co2e', width: 16 },
  ]
  byCat.getRow(1).font = { bold: true }
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const a = cat[key as keyof typeof cat]
    byCat.addRow({ cat: label, co2: a.co2Tonnes, ch4: a.ch4Tonnes, n2o: a.n2oTonnes, bio: a.biogenicCO2Tonnes, co2e: a.co2eTonnes })
  }
  byCat.addRow({
    cat: 'GROSS SCOPE 1',
    co2: g.co2Tonnes,
    ch4: g.ch4Tonnes,
    n2o: g.n2oTonnes,
    bio: result.memoItems.biogenicCO2Tonnes,
    co2e: result.scope1.grossScope1CO2eTonnes,
  })
  byCat.lastRow!.font = { bold: true }

  // --- Biogenic memo breakdown -----------------------------------------
  const memo = wb.addWorksheet('Biogenic memo')
  memo.columns = [
    { header: 'Biogenic CO2 source', key: 'src', width: 44 },
    { header: 'tonnes CO2', key: 't', width: 16 },
  ]
  memo.getRow(1).font = { bold: true }
  memo.addRow({ src: 'Biomass combustion (boilers, recovery furnaces)', t: cat.biomassCombustion.biogenicCO2Tonnes })
  memo.addRow({ src: 'Lime kiln biogenic CaCO3 calcination', t: cat.limeKilns.biogenicCO2Tonnes })
  memo.addRow({ src: 'Makeup carbonate (biogenic origin)', t: cat.makeupCarbonates.biogenicCO2Tonnes })
  memo.addRow({ src: 'CO2 transfers (biogenic)', t: cat.co2Transfers.biogenicCO2Tonnes })
  memo.addRow({ src: 'TOTAL biogenic CO2 (memo — EXCLUDED from gross Scope 1)', t: result.memoItems.biogenicCO2Tonnes })
  memo.lastRow!.font = { bold: true }

  // --- CHP allocation --------------------------------------------------
  if (result.chpAllocations.length > 0) {
    const chp = wb.addWorksheet('CHP allocation')
    chp.columns = [
      { header: 'Unit', key: 'label', width: 32 },
      { header: 'Heat emissions (tCO2e)', key: 'h', width: 22 },
      { header: 'Power emissions (tCO2e)', key: 'p', width: 22 },
      { header: 'EF heat (kg/GJ)', key: 'efh', width: 16 },
      { header: 'EF power (kg/GJ)', key: 'efp', width: 16 },
    ]
    chp.getRow(1).font = { bold: true }
    for (const a of result.chpAllocations) {
      chp.addRow({ label: a.label, h: a.heatEmissionsTonnes, p: a.powerEmissionsTonnes, efh: a.heatEfKgPerGj, efp: a.powerEfKgPerGj })
    }
  }

  // --- Reconciliation --------------------------------------------------
  const recon = wb.addWorksheet('Reconciliation')
  recon.columns = [
    { header: 'Disclosed metric', key: 'metric', width: 26 },
    { header: 'Disclosed', key: 'disclosed', width: 18 },
    { header: 'Modelled', key: 'modelled', width: 18 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Variance %', key: 'variance', width: 14 },
    { header: 'Within ±5%?', key: 'within', width: 14 },
  ]
  recon.getRow(1).font = { bold: true }
  if (!result.reconciliation.checked) {
    recon.addRow({ metric: 'No disclosed figures provided — reconciliation not performed.' })
  } else {
    for (const l of result.reconciliation.lines) {
      recon.addRow({
        metric: l.label,
        disclosed: l.disclosed,
        modelled: l.modelled,
        unit: l.unit,
        variance: l.variancePercent,
        within: l.withinThreshold ? 'yes' : 'REVIEW',
      })
    }
    recon.addRow({})
    recon.addRow({ metric: result.reconciliation.note })
  }

  // --- Assumptions ----------------------------------------------------
  const KIND_LABELS: Record<string, string> = { DEFAULT: 'Default', FALLBACK: 'Fallback', OVERRIDE: 'Override', ESTIMATE: 'Estimate' }
  const asmp = wb.addWorksheet('Assumptions')
  asmp.columns = [
    { header: 'Type', key: 'kind', width: 14 },
    { header: 'Item', key: 'label', width: 38 },
    { header: 'Detail / basis', key: 'detail', width: 90 },
  ]
  asmp.getRow(1).font = { bold: true }
  if (result.assumptions.length === 0) {
    asmp.addRow({ kind: '—', label: 'No defaults, fallbacks, overrides or estimates', detail: 'All inputs were entered directly with site-specific values.' })
  } else {
    for (const a of result.assumptions) asmp.addRow({ kind: KIND_LABELS[a.kind] ?? a.kind, label: a.label, detail: a.detail })
  }

  // --- Methodology + assurance pack -------------------------------------
  addMethodologySheet(wb, pulpPaperMethodology(payload, result))
  addFactorSnapshotsSheet(wb, result.factorSnapshots)
  addTraceSheet(wb, result.calculationTrace)
  addIssuesSheet(wb, result.errors, result.warnings)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
