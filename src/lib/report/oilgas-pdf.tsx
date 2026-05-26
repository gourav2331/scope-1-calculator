/**
 * Oil & Gas Scope 1 report PDF (consultant deliverable): cover with the gross
 * CO2e hero + category/gas breakdown + intensity, a methodology & disclosure
 * page, and an assurance page (factor snapshots, validation, full trace).
 */

import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import type { OilGasCalculationResult, OilGasInputPayload } from '@/lib/engine/oilgas'
import { oilGasMethodology } from './oilgas-workbook'
import {
  FactorSnapshotsSection,
  Line,
  MethodologySection,
  TraceSection,
  ValidationSection,
  num,
  rs,
} from './shared-pdf'

function ReportDoc({ payload, result }: { payload: OilGasInputPayload; result: OilGasCalculationResult }) {
  const c = result.scope1.byCategory
  const g = result.scope1.byGas
  const im = result.intensityMetrics
  return (
    <Document>
      <Page size="A4" style={rs.page}>
        <Text style={rs.h1}>Scope 1 GHG Inventory — Oil &amp; Gas</Text>
        <Text style={rs.sub}>
          {payload.organization.name} · {payload.facility.name} · {payload.facility.segment} · FY{' '}
          {result.reportingPeriod.year} · {result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')}
        </Text>

        <View style={rs.hero}>
          <Text style={rs.heroLabel}>Gross Scope 1 — full CO2e (CO2 + CH4 + N2O)</Text>
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
        <Line label="Stationary combustion" value={num(c.stationaryCombustion.co2eTonnes)} />
        <Line label="Mobile combustion (owned/controlled)" value={num(c.mobileCombustion.co2eTonnes)} />
        <Line label="Flaring" value={num(c.flaring.co2eTonnes)} />
        <Line label="Venting" value={num(c.venting.co2eTonnes)} />
        <Line label="Fugitive (component count)" value={num(c.fugitiveComponents.co2eTonnes)} />
        <Line label="Refrigerants" value={num(c.refrigerants.co2eTonnes)} />
        <Line label="Process emissions" value={num(c.process.co2eTonnes)} />
        <Line label="Reported / direct" value={num(c.reported.co2eTonnes)} />
        <Line label="Gross Scope 1 total" value={num(result.scope1.grossScope1CO2eTonnes)} unit="tCO2e" bold />

        <Text style={rs.section}>By gas</Text>
        <Line label="CO2" value={num(g.co2Tonnes)} unit="tCO2" />
        <Line label={`CH4 — ${num(g.ch4Tonnes)} tCH4 (as CO2e)`} value={num(g.ch4CO2eTonnes)} unit="tCO2e" />
        <Line label={`N2O — ${num(g.n2oTonnes)} tN2O (as CO2e)`} value={num(g.n2oCO2eTonnes)} unit="tCO2e" />
        <Line label="Refrigerants (HFCs, as CO2e)" value={num(g.refrigerantCO2eTonnes)} unit="tCO2e" />

        <Text style={rs.section}>Separated buckets (never merged into Scope 1)</Text>
        <Line label="Biogenic CO2 (memo item)" value={num(result.memoItems.biogenicCO2Tonnes)} unit="tCO2" />
        <Line
          label="Supporting Scope 2 — purchased electricity"
          value={num(result.supportingScope2.purchasedElectricityCO2eTonnes)}
          unit="tCO2e"
        />
        <Line
          label="Supporting Scope 3 — third-party mobile"
          value={num(result.supportingScope3.thirdPartyMobileCO2eTonnes)}
          unit="tCO2e"
        />

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
        {im.co2ePerBoe != null && <Line label="Per barrel of oil equivalent" value={num(im.co2ePerBoe)} unit="kgCO2e/BOE" />}
        {im.co2ePerBblCrude != null && <Line label="Per barrel of crude processed" value={num(im.co2ePerBblCrude)} unit="kgCO2e/bbl" />}
        {im.co2ePerTonneLng != null && <Line label="Per tonne of LNG" value={num(im.co2ePerTonneLng, 3)} unit="tCO2e/t" />}
        {im.co2ePerMMscfThroughput != null && <Line label="Per MMscf throughput" value={num(im.co2ePerMMscfThroughput, 3)} unit="tCO2e/MMscf" />}
        {im.methaneIntensityPercent != null && <Line label="Methane intensity (% of gas production)" value={num(im.methaneIntensityPercent, 3)} unit="%" />}
        {im.co2ePerBoe == null && im.co2ePerBblCrude == null && im.co2ePerTonneLng == null && im.methaneIntensityPercent == null && (
          <Text style={rs.note}>No production denominators entered; intensity metrics unavailable.</Text>
        )}

        <Text style={rs.foot} fixed>
          Generated by Sustally Scope 1 Calculator · IPIECA / API / EPA Subpart W / IPCC methodology · Full factor
          snapshots and calculation trace on the following pages and in the Excel export.
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <MethodologySection m={oilGasMethodology(payload, result)} />
        <Text style={rs.section}>Assumptions &amp; limitations</Text>
        {result.assumptions.length === 0 ? (
          <Text style={rs.note}>
            No defaults, fallbacks, overrides or estimates — all inputs were entered directly with site-specific values.
          </Text>
        ) : (
          result.assumptions.map((a, i) => (
            <Text key={i} style={rs.note}>
              • [{a.kind.toLowerCase()}] {a.label} — {a.detail}
            </Text>
          ))
        )}
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Oil &amp; Gas · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <FactorSnapshotsSection snapshots={result.factorSnapshots} />
        <ValidationSection errors={result.errors} warnings={result.warnings} />
        <TraceSection trace={result.calculationTrace} />
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Oil &amp; Gas · assurance pack · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  )
}

export async function buildOilGasPdf(payload: OilGasInputPayload, result: OilGasCalculationResult): Promise<Buffer> {
  return renderToBuffer(<ReportDoc payload={payload} result={result} />)
}
