/**
 * Oil & Gas audit workbook: summary, by-category gas breakdown, methodology &
 * disclosure, factor snapshots, full calculation trace, and validation. Built
 * from the OilGasCalculationResult; shares the snapshot/trace/issues/methodology
 * sheets with the cement report via ./shared.
 */

import ExcelJS from 'exceljs'

import type { OilGasCalculationResult, OilGasInputPayload } from '@/lib/engine/oilgas'
import {
  addFactorSnapshotsSheet,
  addIssuesSheet,
  addMethodologySheet,
  addTraceSheet,
  type MethodologyContent,
} from './shared'

const CATEGORY_LABELS: Record<string, string> = {
  stationaryCombustion: 'Stationary combustion',
  mobileCombustion: 'Mobile combustion',
  flaring: 'Flaring',
  venting: 'Venting',
  fugitiveComponents: 'Fugitive (component count)',
  refrigerants: 'Refrigerants',
  process: 'Process emissions',
  reported: 'Reported / direct',
}

export function oilGasBoundaryText(payload: OilGasInputPayload): string {
  const b = payload.organizationBoundary
  if (b.boundaryMethod === 'EQUITY_SHARE') {
    return `Equity share — ${b.consolidationPercent ?? b.ownershipSharePercent ?? 100}% of each source consolidated`
  }
  if (b.boundaryMethod === 'FINANCIAL_CONTROL') return 'Financial control — 100% of financially controlled assets'
  return 'Operational control — 100% of operated assets (IPIECA-recommended)'
}

export function oilGasMethodology(payload: OilGasInputPayload, result: OilGasCalculationResult): MethodologyContent {
  return {
    standards: [
      'GHG Protocol Corporate Standard (WRI/WBCSD)',
      'IPIECA / IOGP / API Petroleum Industry GHG Guidelines (4th ed., 2023)',
      'API Compendium of GHG Emission Methodologies (2021)',
      'US EPA GHGRP Subpart W (fugitive component-count leak factors)',
      'IPCC 2006 Guidelines, refined 2019 (combustion NCVs & EFs)',
      `IPCC ${result.gwpSet.replace('_', ' · ')} Global Warming Potentials`,
    ],
    boundary: oilGasBoundaryText(payload),
    gwpBasis: `${result.gwpSet.replace('_', ' · ')} — fossil CH4 weighted accordingly; refrigerant HFC GWPs on the 100-year basis`,
    covered: [
      'Stationary combustion (boilers, fired heaters, gas turbines, engines)',
      'Mobile combustion (owned/controlled; third-party shown as supporting Scope 3)',
      'Flaring (combustion CO2 + methane slip via DRE; inert CO2 passthrough)',
      'Venting (gas composition × volume × density; VRU capture)',
      'Fugitive emissions (EPA Subpart W component count; Tier 1/2/3)',
      'Refrigerants (Tier 1 capacity × leak rate; Tier 2 mass balance)',
      'Process emissions (SMR hydrogen, FCC regeneration, amine acid gas, generic/direct)',
    ],
    exclusions: [
      'Purchased electricity is Scope 2 — reported as a supporting line only, never in gross Scope 1, and not collected here.',
      'Tank emissions (flashing / working / breathing / loading / seal) — not modelled; enter material tank vents under Venting if known.',
      'Compressor sub-type modelling (reciprocating / wet & dry seal / turbine) — represented only via fugitive component counts and combustion.',
      'Glycol dehydrator (GRI-GLYCalc) modelling — not modelled; enter still-vent CH4 under Venting if quantified.',
      'CCS permanence accounting (transport / storage / leakage-reversal) — capture only reduces the vented quantity for the period.',
      'Uncertainty propagation (RSS / Monte Carlo) and top-down (OGMP 2.0 L4/L5) reconciliation — not computed.',
    ],
    notes: [
      'Gross Scope 1 is reported as full CO2e (CO2 + CH4 + N2O); biogenic CO2 is a memo item excluded from gross Scope 1.',
      result.massBalance.checked
        ? `Hydrocarbon mass-balance imbalance for the period: ${result.massBalance.imbalancePercent}% (${result.massBalance.note})`
        : 'Hydrocarbon mass-balance reconciliation not provided.',
    ],
  }
}

export async function buildOilGasWorkbook(
  payload: OilGasInputPayload,
  result: OilGasCalculationResult,
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
  const rows: [string, number | string, string][] = [
    ['Organisation', payload.organization.name, ''],
    ['Facility', payload.facility.name, ''],
    ['Segment / type', `${payload.facility.segment} / ${payload.facility.facilityType}`, ''],
    ['Reporting year', result.reportingPeriod.year, ''],
    ['Methodology pack', result.methodologyPack, ''],
    ['GWP set', result.gwpSet, ''],
    ['Status', result.status, ''],
    ['Data quality', result.dataQuality.overall, ''],
    ['— Gross Scope 1 (CO2 + CH4 + N2O)', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
    ['  Stationary combustion', cat.stationaryCombustion.co2eTonnes, 'tCO2e'],
    ['  Mobile combustion (owned)', cat.mobileCombustion.co2eTonnes, 'tCO2e'],
    ['  Flaring', cat.flaring.co2eTonnes, 'tCO2e'],
    ['  Venting', cat.venting.co2eTonnes, 'tCO2e'],
    ['  Fugitive (component count)', cat.fugitiveComponents.co2eTonnes, 'tCO2e'],
    ['  Refrigerants', cat.refrigerants.co2eTonnes, 'tCO2e'],
    ['  Process', cat.process.co2eTonnes, 'tCO2e'],
    ['  Reported / direct', cat.reported.co2eTonnes, 'tCO2e'],
    ['— By gas: CO2', g.co2Tonnes, 'tCO2'],
    ['  CH4 (mass)', g.ch4Tonnes, 'tCH4'],
    ['  CH4 (as CO2e)', g.ch4CO2eTonnes, 'tCO2e'],
    ['  N2O (mass)', g.n2oTonnes, 'tN2O'],
    ['  N2O (as CO2e)', g.n2oCO2eTonnes, 'tCO2e'],
    ['  Refrigerants (as CO2e)', g.refrigerantCO2eTonnes, 'tCO2e'],
    ['Biogenic CO2 (memo, excluded)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
    ['Supporting Scope 2 (electricity)', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
    ['Supporting Scope 3 (third-party mobile)', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
    ['Intensity — per BOE', result.intensityMetrics.co2ePerBoe ?? 'n/a', 'kgCO2e/BOE'],
    ['Intensity — per bbl crude', result.intensityMetrics.co2ePerBblCrude ?? 'n/a', 'kgCO2e/bbl'],
    ['Intensity — per t LNG', result.intensityMetrics.co2ePerTonneLng ?? 'n/a', 'tCO2e/t'],
    ['Methane intensity', result.intensityMetrics.methaneIntensityPercent ?? 'n/a', '% of gas prod.'],
    ['Mass-balance imbalance', result.massBalance.checked ? (result.massBalance.imbalancePercent ?? 0) : 'n/a', '%'],
    ['Reconciliation', result.reconciliation.checked ? result.reconciliation.note : 'No disclosed figures provided.', '(see Reconciliation sheet)'],
    ['Assumptions & limitations', result.assumptions.length, '(see Assumptions sheet)'],
  ]
  rows.forEach(([k, v, u]) => summary.addRow({ k, v, u }))
  summary.getRow(1).font = { bold: true }
  summary.getRow(10).font = { bold: true } // gross Scope 1 line

  // --- By category (gas-level) ------------------------------------------
  const byCat = wb.addWorksheet('By category')
  byCat.columns = [
    { header: 'Category', key: 'cat', width: 32 },
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
  byCat.addRow({ cat: 'GROSS SCOPE 1', co2: g.co2Tonnes, ch4: g.ch4Tonnes, n2o: g.n2oTonnes, bio: result.memoItems.biogenicCO2Tonnes, co2e: result.scope1.grossScope1CO2eTonnes })
  byCat.lastRow!.font = { bold: true }

  // --- Reconciliation (disclosed vs modelled, per metric) ---------------
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

  // --- Assumptions & limitations register -------------------------------
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
  addMethodologySheet(wb, oilGasMethodology(payload, result))
  addFactorSnapshotsSheet(wb, result.factorSnapshots)
  addTraceSheet(wb, result.calculationTrace)
  addIssuesSheet(wb, result.errors, result.warnings)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
