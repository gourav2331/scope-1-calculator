import ExcelJS from 'exceljs'

import type { CalculationResult, InputPayload } from '@/lib/engine/types'

/** Build an audit workbook: summary, scope breakdown, factor snapshots, full trace. */
export async function buildWorkbook(
  payload: InputPayload,
  result: CalculationResult,
): Promise<Buffer> {
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

  const factors = wb.addWorksheet('Factor snapshots')
  factors.columns = [
    { header: 'Factor code', key: 'code', width: 30 },
    { header: 'Name', key: 'name', width: 40 },
    { header: 'Value', key: 'value', width: 14 },
    { header: 'Unit', key: 'unit', width: 16 },
    { header: 'Source', key: 'source', width: 44 },
    { header: 'Version', key: 'ver', width: 12 },
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Priority', key: 'rank', width: 9 },
    { header: 'Overridden', key: 'ov', width: 11 },
    { header: 'Override reason', key: 'reason', width: 40 },
  ]
  factors.getRow(1).font = { bold: true }
  for (const s of result.factorSnapshots) {
    factors.addRow({
      code: s.factorCode,
      name: s.factorName,
      value: s.value,
      unit: s.unit,
      source: s.source,
      ver: s.sourceVersion,
      year: s.factorYear ?? '',
      rank: s.priorityRank,
      ov: s.overridden ? 'YES' : 'no',
      reason: s.overrideReason ?? '',
    })
  }

  const trace = wb.addWorksheet('Calculation trace')
  trace.columns = [
    { header: 'Step', key: 'step', width: 40 },
    { header: 'Category', key: 'cat', width: 18 },
    { header: 'Method', key: 'method', width: 26 },
    { header: 'Formula', key: 'formula', width: 60 },
    { header: 'Inputs', key: 'inputs', width: 60 },
    { header: 'Output tCO2', key: 'out', width: 16 },
    { header: 'Fallback', key: 'fb', width: 30 },
  ]
  trace.getRow(1).font = { bold: true }
  for (const t of result.calculationTrace) {
    trace.addRow({
      step: t.step,
      cat: t.category,
      method: t.method ?? '',
      formula: t.formula,
      inputs: JSON.stringify(t.inputs),
      out: t.outputTonnesCO2,
      fb: t.fallbackApplied ?? '',
    })
  }

  const issues = wb.addWorksheet('Warnings and errors')
  issues.columns = [
    { header: 'Severity', key: 'sev', width: 12 },
    { header: 'Code', key: 'code', width: 44 },
    { header: 'Message', key: 'msg', width: 80 },
    { header: 'Field', key: 'field', width: 40 },
  ]
  issues.getRow(1).font = { bold: true }
  for (const e of result.errors) issues.addRow({ sev: 'ERROR', code: e.code, msg: e.message, field: e.fieldPath ?? '' })
  for (const w of result.warnings) issues.addRow({ sev: 'WARNING', code: w.code, msg: w.message, field: w.fieldPath ?? '' })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
