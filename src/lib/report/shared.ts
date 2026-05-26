/**
 * Shared Excel (exceljs) report helpers used by both the cement and oil & gas
 * report builders. The factor-snapshot, calculation-trace and validation tables
 * are identical across sectors (they consume the shared engine result types),
 * so they live here. The methodology-disclosure sheet is driven by a
 * sector-supplied `MethodologyContent`.
 */

import ExcelJS from 'exceljs'

import type { FactorSnapshot, TraceEntry, ValidationMessage } from '@/lib/engine/types'

/** Sector-agnostic methodology disclosure block for the assurance pack. */
export interface MethodologyContent {
  standards: string[]
  boundary: string
  gwpBasis: string
  /** Scope 1 source categories actually covered by this pack. */
  covered: string[]
  /** What is deliberately NOT covered / excluded (assurance honesty). */
  exclusions: string[]
  notes?: string[]
}

export function addMethodologySheet(wb: ExcelJS.Workbook, m: MethodologyContent): void {
  const ws = wb.addWorksheet('Methodology & disclosure')
  ws.columns = [
    { header: 'Section', key: 'k', width: 30 },
    { header: 'Detail', key: 'v', width: 96 },
  ]
  ws.getRow(1).font = { bold: true }
  const block = (label: string, items: string[]) => {
    if (items.length === 0) return
    items.forEach((it, i) => ws.addRow({ k: i === 0 ? label : '', v: it }))
  }
  block('Standards & methodologies', m.standards)
  ws.addRow({ k: 'Consolidation boundary', v: m.boundary })
  ws.addRow({ k: 'GWP basis', v: m.gwpBasis })
  block('Scope 1 sources covered', m.covered)
  block('Exclusions / not covered', m.exclusions)
  if (m.notes) block('Notes', m.notes)
}

export function addFactorSnapshotsSheet(wb: ExcelJS.Workbook, snapshots: FactorSnapshot[]): void {
  const ws = wb.addWorksheet('Factor snapshots')
  ws.columns = [
    { header: 'Factor code', key: 'code', width: 30 },
    { header: 'Name', key: 'name', width: 42 },
    { header: 'Value', key: 'value', width: 14 },
    { header: 'Unit', key: 'unit', width: 16 },
    { header: 'Source', key: 'source', width: 46 },
    { header: 'Version', key: 'ver', width: 12 },
    { header: 'Year', key: 'year', width: 8 },
    { header: 'Priority', key: 'rank', width: 9 },
    { header: 'Overridden', key: 'ov', width: 11 },
    { header: 'Override reason', key: 'reason', width: 42 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const s of snapshots) {
    ws.addRow({
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
}

export function addTraceSheet(wb: ExcelJS.Workbook, trace: TraceEntry[]): void {
  const ws = wb.addWorksheet('Calculation trace')
  ws.columns = [
    { header: 'Step', key: 'step', width: 42 },
    { header: 'Category', key: 'cat', width: 20 },
    { header: 'Method', key: 'method', width: 28 },
    { header: 'Formula', key: 'formula', width: 64 },
    { header: 'Inputs', key: 'inputs', width: 64 },
    { header: 'Output tCO2e', key: 'out', width: 16 },
    { header: 'Fallback', key: 'fb', width: 32 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const t of trace) {
    ws.addRow({
      step: t.step,
      cat: t.category,
      method: t.method ?? '',
      formula: t.formula,
      inputs: JSON.stringify(t.inputs),
      out: t.outputTonnesCO2,
      fb: t.fallbackApplied ?? '',
    })
  }
}

export function addIssuesSheet(
  wb: ExcelJS.Workbook,
  errors: ValidationMessage[],
  warnings: ValidationMessage[],
): void {
  const ws = wb.addWorksheet('Warnings and errors')
  ws.columns = [
    { header: 'Severity', key: 'sev', width: 12 },
    { header: 'Code', key: 'code', width: 46 },
    { header: 'Message', key: 'msg', width: 84 },
    { header: 'Field', key: 'field', width: 42 },
  ]
  ws.getRow(1).font = { bold: true }
  for (const e of errors) ws.addRow({ sev: 'ERROR', code: e.code, msg: e.message, field: e.fieldPath ?? '' })
  for (const w of warnings) ws.addRow({ sev: 'WARNING', code: w.code, msg: w.message, field: w.fieldPath ?? '' })
}
