/**
 * Pulp & Paper Scope 1 report PDF (consultant deliverable):
 * cover (gross CO2e hero + by-category + by-gas + biogenic memo + reconciliation
 * + intensity), methodology page, assurance page (snapshots + validation + trace).
 */

import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import type { PulpPaperCalculationResult, PulpPaperInputPayload } from '@/lib/engine/pulppaper'
import { pulpPaperMethodology } from './pulppaper-workbook'
import {
  FactorSnapshotsSection,
  Line,
  MethodologySection,
  TraceSection,
  ValidationSection,
  num,
  rs,
} from './shared-pdf'

function ReportDoc({ payload, result }: { payload: PulpPaperInputPayload; result: PulpPaperCalculationResult }) {
  const c = result.scope1.byCategory
  const g = result.scope1.byGas
  const im = result.intensityMetrics
  return (
    <Document>
      <Page size="A4" style={rs.page}>
        <Text style={rs.h1}>Scope 1 GHG Inventory — Pulp &amp; Paper</Text>
        <Text style={rs.sub}>
          {payload.organization.name} · {payload.facility.name} · {payload.facility.millType} · FY{' '}
          {result.reportingPeriod.year} · {result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')}
        </Text>

        <View style={rs.hero}>
          <Text style={rs.heroLabel}>Gross Scope 1 — full CO2e (CO2 + CH4 + N2O + HFCs)</Text>
          <Text style={rs.heroValue}>{num(result.scope1.grossScope1CO2eTonnes)} tCO2e</Text>
          <Text style={rs.heroLabel}>
            Status: {result.status} · Data quality: {result.dataQuality.overall}
          </Text>
        </View>

        <Text style={rs.section}>Scope 1 by category</Text>
        <View style={rs.row}>
          <Text style={[rs.cellL, rs.th]}>Category</Text>
          <Text style={[rs.cellR, rs.th]}>tCO2e</Text>
        </View>
        <Line label="Stationary combustion (fossil)" value={num(c.stationaryCombustion.co2eTonnes)} />
        <Line label="Biomass combustion (CH4 + N2O; biogenic CO2 = memo)" value={num(c.biomassCombustion.co2eTonnes)} />
        <Line label="Lime kilns / calciners" value={num(c.limeKilns.co2eTonnes)} />
        <Line label="Make-up carbonates" value={num(c.makeupCarbonates.co2eTonnes)} />
        <Line label="Mobile (owned / controlled)" value={num(c.mobile.co2eTonnes)} />
        <Line label="Mill-owned landfills" value={num(c.landfills.co2eTonnes)} />
        <Line label="Anaerobic WWT / sludge digestion" value={num(c.anaerobicWwt.co2eTonnes)} />
        <Line label="Refrigerant HFCs" value={num(c.refrigerants.co2eTonnes)} />
        <Line label="CO2 transfers (PCC export / import)" value={num(c.co2Transfers.co2eTonnes)} />
        <Line label="Reported / direct" value={num(c.reported.co2eTonnes)} />
        <Line label="Gross Scope 1 total" value={num(result.scope1.grossScope1CO2eTonnes)} unit="tCO2e" bold />

        <Text style={rs.section}>By gas</Text>
        <Line label="CO2" value={num(g.co2Tonnes)} unit="tCO2" />
        <Line label={`CH4 — ${num(g.ch4Tonnes)} tCH4 (as CO2e)`} value={num(g.ch4CO2eTonnes)} unit="tCO2e" />
        <Line label={`N2O — ${num(g.n2oTonnes)} tN2O (as CO2e)`} value={num(g.n2oCO2eTonnes)} unit="tCO2e" />
        <Line label="Refrigerants (HFCs, as CO2e)" value={num(g.refrigerantCO2eTonnes)} unit="tCO2e" />

        <Text style={rs.section}>Separated buckets (NEVER merged into Scope 1)</Text>
        <Line label="Biogenic CO2 (memo — biomass / lime kiln / makeup biogenic)" value={num(result.memoItems.biogenicCO2Tonnes)} unit="tCO2" />
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

        <Text style={rs.section}>Intensity</Text>
        {im.co2ePerAdtPulp != null && <Line label="Per air-dry tonne pulp (ADt)" value={num(im.co2ePerAdtPulp)} unit="kgCO2e/ADt" />}
        {im.co2ePerTonnePaper != null && <Line label="Per tonne paper" value={num(im.co2ePerTonnePaper)} unit="kgCO2e/t" />}
        {im.co2ePerTonneBoard != null && <Line label="Per tonne board" value={num(im.co2ePerTonneBoard)} unit="kgCO2e/t" />}
        {im.fossilCo2PerAdtPulp != null && <Line label="Fossil CO2 per ADt pulp" value={num(im.fossilCo2PerAdtPulp)} unit="kgCO2/ADt" />}
        {im.co2ePerAdtPulp == null && im.co2ePerTonnePaper == null && im.co2ePerTonneBoard == null && (
          <Text style={rs.note}>No production denominators entered; intensity metrics unavailable.</Text>
        )}

        {result.chpAllocations.length > 0 && (
          <>
            <Text style={rs.section}>CHP allocation (Simplified Efficiency Method)</Text>
            {result.chpAllocations.map((a, i) => (
              <Text key={i} style={rs.note}>
                {a.label} — heat {num(a.heatEmissionsTonnes)} tCO2e ({num(a.heatEfKgPerGj)} kg/GJ); power {num(a.powerEmissionsTonnes)} tCO2e ({num(a.powerEfKgPerGj)} kg/GJ)
              </Text>
            ))}
          </>
        )}

        <Text style={rs.foot} fixed>
          Generated by Sustally Scope 1 Calculator · ICFPA/NCASI v1.4 + IPCC 2006 + AR5/AR6 methodology · Factor
          snapshots and full calculation trace on the following pages and in the Excel export.
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <MethodologySection m={pulpPaperMethodology(payload, result)} />
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
          Sustally Scope 1 Calculator · Pulp &amp; Paper · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <FactorSnapshotsSection snapshots={result.factorSnapshots} />
        <ValidationSection errors={result.errors} warnings={result.warnings} />
        <TraceSection trace={result.calculationTrace} />
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Pulp &amp; Paper · assurance pack · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  )
}

export async function buildPulpPaperPdf(payload: PulpPaperInputPayload, result: PulpPaperCalculationResult): Promise<Buffer> {
  return renderToBuffer(<ReportDoc payload={payload} result={result} />)
}
