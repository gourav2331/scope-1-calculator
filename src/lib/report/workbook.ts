import ExcelJS from 'exceljs'

import type { CalculationResult, InputPayload } from '@/lib/engine/types'
import {
  addFactorSnapshotsSheet,
  addIssuesSheet,
  addMethodologySheet,
  addTraceSheet,
  type MethodologyContent,
} from './shared'

export function cementBoundaryText(payload: InputPayload): string {
  const b = payload.organizationBoundary
  if (b.boundaryMethod === 'EQUITY_SHARE') {
    return `Equity share — ${b.consolidationPercent ?? b.ownershipSharePercent ?? 100}% of each source consolidated`
  }
  if (b.boundaryMethod === 'FINANCIAL_CONTROL') return 'Financial control — 100% of financially controlled assets'
  return 'Operational control — 100% of operated assets'
}

export function cementMethodology(payload: InputPayload, result: CalculationResult): MethodologyContent {
  return {
    standards: [
      'GHG Protocol Corporate Standard (WRI/WBCSD)',
      'CSI Cement CO2 & Energy Protocol v2.0 (clinker-based)',
      'US EPA cement-based method (automatic fallback when clinker data is unavailable)',
      'IPCC 2006 Guidelines (combustion NCVs & EFs)',
      `IPCC ${payload.calculationContext.gwpSet} Global Warming Potentials`,
    ],
    boundary: cementBoundaryText(payload),
    gwpBasis: `${payload.calculationContext.gwpSet} (100-year)`,
    covered: [
      'Clinker calcination (plant CaO/MgO, CSI default, or IPCC default)',
      'Bypass dust and cement kiln dust (CKD)',
      'Raw meal organic carbon (TOC)',
      'Kiln fuels (conventional + alternative fossil) and non-kiln fossil fuel',
      'Owned/controlled mobile combustion',
      'Fugitive emissions (refrigerants / SF6) as CO2e',
    ],
    exclusions: [
      'Gross Scope 1 is CO2-only per the CSI protocol; combustion CH4/N2O is computed but reported as a separate non-CSI addendum, never inside gross Scope 1.',
      'Biomass/biogenic CO2 is a memo item, excluded from gross Scope 1 (its CH4/N2O remain in the addendum).',
      'Purchased electricity is supporting Scope 2; bought (net external) clinker is supporting Scope 3 — neither is in gross Scope 1.',
    ],
    notes: [result.nonCsiCombustionGhg.note],
  }
}

/** Build an audit workbook: summary, methodology, factor snapshots, full trace, validation. */
export async function buildWorkbook(payload: InputPayload, result: CalculationResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sustally Scope 1 Calculator'
  wb.created = new Date()

  const summary = wb.addWorksheet('Summary')
  summary.columns = [
    { header: 'Item', key: 'k', width: 48 },
    { header: 'Value', key: 'v', width: 24 },
    { header: 'Unit', key: 'u', width: 18 },
  ]
  const c = result.scope1.components
  const rows: [string, number | string, string][] = [
    ['Organisation', payload.organization.name, ''],
    ['Facility', payload.facility.name, ''],
    ['Reporting year', result.reportingPeriod.year, ''],
    ['Methodology pack', result.methodologyPack, ''],
    ['Status', result.status, ''],
    ['GWP set', payload.calculationContext.gwpSet, ''],
    ['— Gross Scope 1 (CO2)', result.scope1.grossScope1CO2Tonnes, 'tCO2'],
    ['  Clinker calcination', c.clinkerCalcinationCO2Tonnes, 'tCO2'],
    ['  Bypass dust', c.bypassDustCO2Tonnes, 'tCO2'],
    ['  CKD', c.ckdCO2Tonnes, 'tCO2'],
    ['  Raw meal TOC', c.rawMealTocCO2Tonnes, 'tCO2'],
    ['  Conventional kiln fuel', c.conventionalKilnFuelCO2Tonnes, 'tCO2'],
    ['  Alternative fossil kiln fuel', c.alternativeFossilKilnFuelCO2Tonnes, 'tCO2'],
    ['  Non-kiln fossil fuel', c.nonKilnFossilCO2Tonnes, 'tCO2'],
    ['  Mobile combustion (owned)', c.mobileCombustionCO2Tonnes, 'tCO2'],
    ['  Fugitive emissions', c.fugitiveCO2eTonnes, 'tCO2e'],
    ['Biomass CO2 (memo, excluded)', result.memoItems.biomassCO2Tonnes, 'tCO2'],
    ['Non-CSI combustion CH4/N2O (separate)', result.nonCsiCombustionGhg.ch4N2oCO2eTonnes, 'tCO2e'],
    ['Supporting Scope 2 (electricity)', result.supportingScope2.purchasedElectricityCO2Tonnes, 'tCO2'],
    ['Supporting Scope 3 (bought clinker)', result.supportingScope3.boughtClinkerCO2Tonnes, 'tCO2'],
    ['Net CO2 (optional)', result.optionalNetReporting.netCO2Tonnes ?? 'n/a', 'tCO2'],
    ['Intensity per t clinker', result.intensityMetrics.grossCO2PerTonneClinker ?? 'n/a', 'kgCO2/t'],
    ['Intensity per t cementitious', result.intensityMetrics.grossCO2PerTonneCementitious ?? 'n/a', 'kgCO2/t'],
    ['Data quality', result.dataQuality.overall, ''],
  ]
  rows.forEach(([k, v, u]) => summary.addRow({ k, v, u }))
  summary.getRow(1).font = { bold: true }
  summary.getRow(8).font = { bold: true }

  addMethodologySheet(wb, cementMethodology(payload, result))
  addFactorSnapshotsSheet(wb, result.factorSnapshots)
  addTraceSheet(wb, result.calculationTrace)
  addIssuesSheet(wb, result.errors, result.warnings)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
