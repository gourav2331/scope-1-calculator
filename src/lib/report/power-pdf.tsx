/**
 * Power Sector Scope 1 PDF — consultant deliverable:
 * cover (gross hero + by-category + by-gas + biogenic & CCS memo +
 * reconciliation + generation & intensity), methodology page, assurance
 * page (snapshots + validation + trace).
 */

import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import type { PowerCalculationResult, PowerInputPayload } from '@/lib/engine/power'
import { powerMethodology } from './power-workbook'
import {
  FactorSnapshotsSection,
  Line,
  MethodologySection,
  TraceSection,
  ValidationSection,
  num,
  rs,
} from './shared-pdf'

function ReportDoc({ payload, result }: { payload: PowerInputPayload; result: PowerCalculationResult }) {
  const c = result.scope1.byCategory
  const g = result.scope1.byGas
  const im = result.intensityMetrics
  return (
    <Document>
      <Page size="A4" style={rs.page}>
        <Text style={rs.h1}>Scope 1 GHG Inventory — Power Sector</Text>
        <Text style={rs.sub}>
          {payload.organization.name} · {payload.facility.name} · {payload.facility.technology} · FY{' '}
          {result.reportingPeriod.year} · {result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')}
        </Text>

        <View style={rs.hero}>
          <Text style={rs.heroLabel}>Gross Scope 1 — full CO2e (CO2 + CH4 + N2O + HFCs + SF6) − CCS</Text>
          <Text style={rs.heroValue}>{num(result.scope1.grossScope1CO2eTonnes)} tCO2e</Text>
          <Text style={rs.heroLabel}>
            Status: {result.status} · Data quality: {result.dataQuality.overall}
            {result.ccsCapturedAndStoredTonnes > 0
              ? ` · CCS deducted ${num(result.ccsCapturedAndStoredTonnes)} tCO2`
              : ''}
          </Text>
        </View>

        <Text style={rs.section}>Scope 1 by category</Text>
        <View style={rs.row}>
          <Text style={[rs.cellL, rs.th]}>Category</Text>
          <Text style={[rs.cellR, rs.th]}>tCO2e</Text>
        </View>
        <Line label="Stationary combustion (main)" value={num(c.stationaryMain.co2eTonnes)} />
        <Line label="Stationary combustion (auxiliary)" value={num(c.stationaryAuxiliary.co2eTonnes)} />
        <Line label="Biomass cofiring (CH4/N2O only)" value={num(c.biomassCofiring.co2eTonnes)} />
        <Line label="Mobile (owned / controlled)" value={num(c.mobile.co2eTonnes)} />
        <Line label="Process — wet FGD limestone" value={num(c.fgdLimestone.co2eTonnes)} />
        <Line label="Process — SCR/SNCR urea" value={num(c.scrUrea.co2eTonnes)} />
        <Line label="SF6 from gas-insulated switchgear" value={num(c.fugitiveSF6.co2eTonnes)} />
        <Line label="Refrigerant HFCs" value={num(c.fugitiveHFC.co2eTonnes)} />
        <Line label="Other CH4 fugitives (coal / NG pipework)" value={num(c.fugitiveOtherCH4.co2eTonnes)} />
        <Line label="Reported / direct" value={num(c.reported.co2eTonnes)} />
        <Line label="Gross Scope 1 total (after CCS deduction)" value={num(result.scope1.grossScope1CO2eTonnes)} unit="tCO2e" bold />

        <Text style={rs.section}>By gas</Text>
        <Line label="CO2" value={num(g.co2Tonnes)} unit="tCO2" />
        <Line label="CH4 (mass)" value={num(g.ch4Tonnes)} unit="tCH4" />
        <Line label="N2O (mass)" value={num(g.n2oTonnes)} unit="tN2O" />
        <Line label="SF6 (mass)" value={num(g.sf6Tonnes)} unit="tSF6" />
        <Line label="HFCs (as CO2e)" value={num(g.hfcCO2eTonnes)} unit="tCO2e" />

        <Text style={rs.section}>Separated buckets (NEVER merged into Scope 1)</Text>
        <Line label="Biogenic CO2 (memo — biomass cofiring)" value={num(result.memoItems.biogenicCO2Tonnes)} unit="tCO2" />
        <Line label="CCS process vent (memo — start-up / regen)" value={num(result.memoItems.ccsProcessVentTonnes)} unit="tCO2" />
        <Line label="Supporting Scope 2 — purchased electricity" value={num(result.supportingScope2.purchasedElectricityCO2eTonnes)} unit="tCO2e" />
        <Line label="Supporting Scope 3 — third-party mobile" value={num(result.supportingScope3.thirdPartyMobileCO2eTonnes)} unit="tCO2e" />

        {result.reconciliation.checked && (
          <>
            <Text style={rs.section}>Reconciliation vs disclosed figures</Text>
            {result.reconciliation.lines.map((l) => (
              <Line
                key={l.metric}
                label={`${l.label}${l.withinThreshold ? '' : '  ⚠ review'} — disclosed ${num(l.disclosed ?? 0)} ${l.unit}, modelled ${num(l.modelled)} ${l.unit}`}
                value={num(l.variancePercent ?? 0)}
                unit="%"
                bold={!l.withinThreshold}
              />
            ))}
            <Text style={rs.note}>{result.reconciliation.note}</Text>
          </>
        )}

        <Text style={rs.section}>Generation &amp; intensity</Text>
        {payload.activityData.production.grossGenerationMwh != null && <Line label="Gross generation" value={num(payload.activityData.production.grossGenerationMwh)} unit="MWh" />}
        {payload.activityData.production.netGenerationMwh != null && <Line label="Net generation (sent out)" value={num(payload.activityData.production.netGenerationMwh)} unit="MWh" />}
        {im.co2ePerMwhNet != null && <Line label="→ Intensity per MWh net (canonical KPI)" value={num(im.co2ePerMwhNet)} unit="kgCO2e/MWh" />}
        {im.co2ePerMwhGross != null && <Line label="→ Intensity per MWh gross" value={num(im.co2ePerMwhGross)} unit="kgCO2e/MWh" />}
        {im.fossilCo2PerMwhNet != null && <Line label="→ Fossil CO2 per MWh net" value={num(im.fossilCo2PerMwhNet)} unit="kgCO2/MWh" />}
        {im.co2ePerMwhNet == null && <Text style={rs.note}>No generation volumes entered; intensity metrics unavailable.</Text>}

        <Text style={rs.foot} fixed>
          Generated by Sustally Scope 1 Calculator · GHG Protocol + IPCC 2006/2019 + EU ETS MRR + US EPA Part 98 + India CEA v21 · Factor
          snapshots and full calculation trace on the following pages and in the Excel export.
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <MethodologySection m={powerMethodology(payload, result)} />
        <Text style={rs.section}>Assumptions &amp; limitations</Text>
        {result.assumptions.length === 0 ? (
          <Text style={rs.note}>No defaults, fallbacks, overrides or estimates — all inputs were entered directly with site-specific values.</Text>
        ) : (
          result.assumptions.map((a, i) => (
            <Text key={i} style={rs.note}>
              • [{a.kind.toLowerCase()}] {a.label} — {a.detail}
            </Text>
          ))
        )}
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Power · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <FactorSnapshotsSection snapshots={result.factorSnapshots} />
        <ValidationSection errors={result.errors} warnings={result.warnings} />
        <TraceSection trace={result.calculationTrace} />
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Power · assurance pack · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  )
}

export async function buildPowerPdf(payload: PowerInputPayload, result: PowerCalculationResult): Promise<Buffer> {
  return renderToBuffer(<ReportDoc payload={payload} result={result} />)
}
