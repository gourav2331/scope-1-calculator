/**
 * Shared @react-pdf building blocks for the cement and oil & gas report PDFs:
 * common styles, a number formatter, a key/value line, and the methodology /
 * factor-snapshot / validation / trace sections (identical across sectors since
 * they consume the shared engine result types).
 */

import { StyleSheet, Text, View } from '@react-pdf/renderer'
import React from 'react'

import type { FactorSnapshot, TraceEntry, ValidationMessage } from '@/lib/engine/types'
import type { MethodologyContent } from './shared'

export const rs = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1a2230' },
  h1: { fontSize: 18, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  sub: { fontSize: 9, color: '#5a6678', marginBottom: 14 },
  section: { fontSize: 12, marginTop: 16, marginBottom: 6, fontFamily: 'Helvetica-Bold' },
  hero: { backgroundColor: '#4b1da8', color: '#ffffff', padding: 14, borderRadius: 4, marginBottom: 8 },
  heroLabel: { fontSize: 9, color: '#d9c9ff' },
  heroValue: { fontSize: 24, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#dde3ea', paddingVertical: 3 },
  cellL: { flex: 3 },
  cellR: { flex: 1, textAlign: 'right' },
  th: { fontFamily: 'Helvetica-Bold', color: '#5a6678', fontSize: 8 },
  bold: { fontFamily: 'Helvetica-Bold' },
  warn: { color: '#9a6700', marginBottom: 2 },
  err: { color: '#b3261e', marginBottom: 2 },
  note: { fontSize: 8, color: '#5a6678', marginTop: 4 },
  bullet: { fontSize: 9, marginBottom: 2 },
  kv: { flexDirection: 'row', marginBottom: 3 },
  kvK: { width: 130, color: '#5a6678' },
  kvV: { flex: 1 },
  foot: { position: 'absolute', bottom: 22, left: 36, right: 36, fontSize: 7, color: '#9aa4b2', textAlign: 'center' },
})

export const num = (v: number | null | undefined, dp = 2) =>
  v === null || v === undefined ? 'n/a' : v.toLocaleString('en-IN', { maximumFractionDigits: dp })

export function Line({ label, value, unit, bold }: { label: string; value: string; unit?: string; bold?: boolean }) {
  return (
    <View style={rs.row}>
      <Text style={[rs.cellL, bold ? rs.bold : {}]}>{label}</Text>
      <Text style={[rs.cellR, bold ? rs.bold : {}]}>
        {value}
        {unit ? ` ${unit}` : ''}
      </Text>
    </View>
  )
}

export function MethodologySection({ m }: { m: MethodologyContent }) {
  return (
    <View>
      <Text style={rs.section}>Methodology &amp; disclosure</Text>
      <View style={rs.kv}>
        <Text style={rs.kvK}>Standards</Text>
        <Text style={rs.kvV}>{m.standards.join(' · ')}</Text>
      </View>
      <View style={rs.kv}>
        <Text style={rs.kvK}>Consolidation boundary</Text>
        <Text style={rs.kvV}>{m.boundary}</Text>
      </View>
      <View style={rs.kv}>
        <Text style={rs.kvK}>GWP basis</Text>
        <Text style={rs.kvV}>{m.gwpBasis}</Text>
      </View>
      <Text style={[rs.bold, { marginTop: 8, marginBottom: 3 }]}>Scope 1 sources covered</Text>
      {m.covered.map((c, i) => (
        <Text key={i} style={rs.bullet}>• {c}</Text>
      ))}
      <Text style={[rs.bold, { marginTop: 8, marginBottom: 3 }]}>Exclusions / not covered</Text>
      {m.exclusions.map((e, i) => (
        <Text key={i} style={rs.bullet}>• {e}</Text>
      ))}
      {m.notes?.map((nt, i) => (
        <Text key={i} style={rs.note}>{nt}</Text>
      ))}
    </View>
  )
}

export function FactorSnapshotsSection({ snapshots }: { snapshots: FactorSnapshot[] }) {
  return (
    <View>
      <Text style={rs.section}>Factor snapshots (provenance)</Text>
      {snapshots.map((f, i) => (
        <Line
          key={i}
          label={`${f.factorName} [${f.source} ${f.sourceVersion}]${f.overridden ? ' (OVERRIDDEN)' : ''}`}
          value={num(f.value, 4)}
          unit={f.unit}
        />
      ))}
    </View>
  )
}

export function ValidationSection({ errors, warnings }: { errors: ValidationMessage[]; warnings: ValidationMessage[] }) {
  return (
    <View>
      <Text style={rs.section}>Validation</Text>
      {errors.length === 0 && warnings.length === 0 && <Text>No warnings or errors. All inputs validated.</Text>}
      {errors.map((e, i) => (
        <Text key={`e${i}`} style={rs.err}>ERROR · {e.code} — {e.message}</Text>
      ))}
      {warnings.map((w, i) => (
        <Text key={`w${i}`} style={rs.warn}>WARNING · {w.code} — {w.message}</Text>
      ))}
    </View>
  )
}

export function TraceSection({ trace }: { trace: TraceEntry[] }) {
  return (
    <View>
      <Text style={rs.section}>Calculation trace</Text>
      {trace.map((t, i) => (
        <View key={i} style={{ marginBottom: 4 }}>
          <Text style={rs.bold}>
            {t.step} — {num(t.outputTonnesCO2)} tCO2e {t.fallbackApplied ? `(fallback: ${t.fallbackApplied})` : ''}
          </Text>
          <Text style={rs.note}>{t.formula} · inputs {JSON.stringify(t.inputs)}</Text>
        </View>
      ))}
    </View>
  )
}
