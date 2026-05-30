/**
 * Iron & Steel Scope 1 PDF — consultant deliverable:
 * cover (gross hero + by-category + by-gas + biogenic memo + reconciliation
 * + production & intensity), methodology page, assurance page (snapshots +
 * validation + trace).
 */

import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

import type { IronSteelCalculationResult, IronSteelInputPayload } from '@/lib/engine/ironsteel'
import { ironSteelMethodology } from './ironsteel-workbook'
import {
  FactorSnapshotsSection,
  Line,
  MethodologySection,
  TraceSection,
  ValidationSection,
  num,
  rs,
} from './shared-pdf'

function ReportDoc({ payload, result }: { payload: IronSteelInputPayload; result: IronSteelCalculationResult }) {
  const c = result.scope1.byCategory
  const g = result.scope1.byGas
  const im = result.intensityMetrics
  return (
    <Document>
      <Page size="A4" style={rs.page}>
        <Text style={rs.h1}>Scope 1 GHG Inventory — Iron &amp; Steel</Text>
        <Text style={rs.sub}>
          {payload.organization.name} · {payload.facility.name} · {payload.facility.processRoute} · FY{' '}
          {result.reportingPeriod.year} · {result.methodologyPack} · GWP {result.gwpSet.replace('_', ' · ')}
        </Text>

        <View style={rs.hero}>
          <Text style={rs.heroLabel}>Gross Scope 1 — full CO2e (CO2 + CH4 + N2O + HFCs + SF6)</Text>
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
        <Line label="Mobile (owned / controlled)" value={num(c.mobile.co2eTonnes)} />
        <Line label="Onsite coke production" value={num(c.cokeOven.co2eTonnes)} />
        <Line label="Process-gas flaring (COG / BFG / BOFG)" value={num(c.flaring.co2eTonnes)} />
        <Line label="Sinter plant" value={num(c.sinter.co2eTonnes)} />
        <Line label="DRI (NG / coal / H2)" value={num(c.dri.co2eTonnes)} />
        <Line label="Blast furnace + BOF" value={num(c.bfBof.co2eTonnes)} />
        <Line label="Electric arc furnace (EAF)" value={num(c.eaf.co2eTonnes)} />
        <Line label="Onsite lime kiln" value={num(c.limeKiln.co2eTonnes)} />
        <Line label="Refrigerant HFCs" value={num(c.fugitiveHFC.co2eTonnes)} />
        <Line label="SF6 from switchgear" value={num(c.fugitiveSF6.co2eTonnes)} />
        <Line label="Other CH4 fugitives" value={num(c.fugitiveOther.co2eTonnes)} />
        <Line label="Reported / direct" value={num(c.reported.co2eTonnes)} />
        <Line label="Gross Scope 1 total" value={num(result.scope1.grossScope1CO2eTonnes)} unit="tCO2e" bold />

        <Text style={rs.section}>By gas</Text>
        <Line label="CO2" value={num(g.co2Tonnes)} unit="tCO2" />
        <Line label={`CH4 — ${num(g.ch4Tonnes)} tCH4 (as CO2e)`} value={num(g.ch4CO2eTonnes)} unit="tCO2e" />
        <Line label={`N2O — ${num(g.n2oTonnes)} tN2O (as CO2e)`} value={num(g.n2oCO2eTonnes)} unit="tCO2e" />
        <Line label="Refrigerant HFCs (as CO2e)" value={num(g.hfcCO2eTonnes)} unit="tCO2e" />
        <Line label="SF6 (as CO2e)" value={num(g.sf6CO2eTonnes)} unit="tCO2e" />

        <Text style={rs.section}>Separated buckets (NEVER merged into Scope 1)</Text>
        <Line label="Biogenic CO2 (memo — bio-coke / biomass)" value={num(result.memoItems.biogenicCO2Tonnes)} unit="tCO2" />
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

        <Text style={rs.section}>Production &amp; intensity</Text>
        {payload.activityData.production.crudeSteelTonnes != null && <Line label="Crude steel produced" value={num(payload.activityData.production.crudeSteelTonnes)} unit="t" />}
        {payload.activityData.production.hotRolledTonnes != null && <Line label="Hot-rolled produced" value={num(payload.activityData.production.hotRolledTonnes)} unit="t" />}
        {payload.activityData.production.hotMetalTonnes != null && <Line label="Hot metal produced" value={num(payload.activityData.production.hotMetalTonnes)} unit="t" />}
        {im.co2ePerTonneCrudeSteel != null && <Line label="→ Intensity per t crude steel" value={num(im.co2ePerTonneCrudeSteel)} unit="kgCO2e/t" />}
        {im.co2ePerTonneHotRolled != null && <Line label="→ Intensity per t hot-rolled" value={num(im.co2ePerTonneHotRolled)} unit="kgCO2e/t" />}
        {im.co2ePerTonneHotMetal != null && <Line label="→ Intensity per t hot metal" value={num(im.co2ePerTonneHotMetal)} unit="kgCO2e/t" />}
        {im.fossilCo2PerTonneCrudeSteel != null && <Line label="→ Fossil CO2 per t crude steel" value={num(im.fossilCo2PerTonneCrudeSteel)} unit="kgCO2/t" />}
        {im.co2ePerTonneCrudeSteel == null && <Text style={rs.note}>No production volumes entered; intensity metrics unavailable.</Text>}

        <Text style={rs.foot} fixed>
          Generated by Sustally Scope 1 Calculator · GHG Protocol + ISO 14064-1 + ISO 14404 + worldsteel CO2 v11 + IPCC 2006/2019 methodology · Factor
          snapshots and full calculation trace on the following pages and in the Excel export.
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <MethodologySection m={ironSteelMethodology(payload, result)} />
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
          Sustally Scope 1 Calculator · Iron &amp; Steel · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>

      <Page size="A4" style={rs.page}>
        <FactorSnapshotsSection snapshots={result.factorSnapshots} />
        <ValidationSection errors={result.errors} warnings={result.warnings} />
        <TraceSection trace={result.calculationTrace} />
        <Text style={rs.foot} fixed>
          Sustally Scope 1 Calculator · Iron &amp; Steel · assurance pack · {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  )
}

export async function buildIronSteelPdf(payload: IronSteelInputPayload, result: IronSteelCalculationResult): Promise<Buffer> {
  return renderToBuffer(<ReportDoc payload={payload} result={result} />)
}
