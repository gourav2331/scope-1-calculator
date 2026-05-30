/**
 * Iron & Steel audit workbook — summary, by-category gas breakdown, biogenic
 * memo, reconciliation, assumptions, methodology, factor snapshots, full
 * calculation trace, and validation. Shares the methodology / snapshot /
 * trace / issues sheets with cement, O&G, and P&P via ./shared.
 */

import ExcelJS from 'exceljs'

import type { IronSteelCalculationResult, IronSteelInputPayload } from '@/lib/engine/ironsteel'
import {
  addFactorSnapshotsSheet,
  addIssuesSheet,
  addMethodologySheet,
  addTraceSheet,
  type MethodologyContent,
} from './shared'

const CATEGORY_LABELS: Record<string, string> = {
  stationaryCombustion: 'Stationary combustion',
  mobile: 'Mobile (owned / controlled)',
  cokeOven: 'Onsite coke production',
  flaring: 'Process-gas flaring (COG / BFG / BOFG)',
  sinter: 'Sinter plant',
  dri: 'Direct Reduced Iron (DRI)',
  bfBof: 'Blast furnace + BOF',
  eaf: 'Electric arc furnace (EAF)',
  limeKiln: 'Onsite lime kiln',
  fugitiveHFC: 'Refrigerant HFC fugitives',
  fugitiveSF6: 'SF6 from switchgear',
  fugitiveOther: 'Other CH4 fugitives (coal / coke / NG)',
  reported: 'Reported / direct',
}

export function ironSteelBoundaryText(payload: IronSteelInputPayload): string {
  const b = payload.organizationBoundary
  if (b.boundaryMethod === 'EQUITY_SHARE') {
    return `Equity share — ${b.consolidationPercent ?? b.ownershipSharePercent ?? 100}% of each source consolidated`
  }
  if (b.boundaryMethod === 'FINANCIAL_CONTROL') return 'Financial control — 100% of financially controlled assets'
  return 'Operational control — 100% of operated assets (GHG Protocol recommended; ISO 14404 default)'
}

export function ironSteelMethodology(
  payload: IronSteelInputPayload,
  result: IronSteelCalculationResult,
): MethodologyContent {
  return {
    standards: [
      'GHG Protocol Corporate Standard (WRI/WBCSD)',
      'ISO 14064-1:2018 (organisational GHG inventory, verifiable)',
      'ISO 14404-1/-2/-3/-4:2024 (steel site-level intensity)',
      'worldsteel CO2 Data Collection User Guide v11 (2024)',
      'IPCC 2006 Vol 3 Ch 4 (Metal Industry) + 2019 Refinement',
      'EU ETS MRR (Reg 2018/2066, amended 2023–2024)',
      'EU CBAM (Reg 2023/956 + Implementing Reg 2025/2547)',
      'US EPA GHGRP Subpart Q (40 CFR 98.170–178)',
      'ResponsibleSteel V2.1.1 (Oct 2024) Principle 10',
      'GSCC Steel Climate Standard (Jul 2024)',
      'SBTi Steel Sector Guidance (Apr 2023, Jun 2024)',
      'GRI 305 / ESRS E1 (CSRD) / IFRS S2 (ISSB)',
      'India CCTS + Green Steel Notification (MoS 2024)',
      `IPCC ${result.gwpSet.replace('_', ' · ')} Global Warming Potentials`,
    ],
    boundary: ironSteelBoundaryText(payload),
    gwpBasis: `${result.gwpSet.replace('_', ' · ')} — fossil & biogenic CH4 weighted accordingly; HFC + SF6 GWPs on the 100-year AR6 basis (industry convention). ESRS E1 mandates AR6.`,
    covered: [
      'Stationary fossil-fuel + process-gas combustion (boilers, hot-blast stoves, reheat / annealing furnaces, RTOs, turbines). COG / BFG / BOFG modelled as first-class fuels.',
      'Mobile / on-site equipment (locomotives, slag pots, ladle cars, forklifts, haul trucks). Owned only — third-party transport routed to supporting Scope 3.',
      'Onsite coke production — Tier 1 default (0.56 tCO2/t coke) or Tier 2 carbon balance (coal C − coke C − COG C − tar C).',
      'Process-gas flaring (COG / BFG / BOFG / mixed) — IPCC 2019 Refinement Tier 1 with combustion efficiency + optional CH4 slip.',
      'Sinter plant — Tier 1 (0.20 tCO2/t) or Tier 2 (coke breeze + fluxes + NG). Tier-1 N2O + CH4 from 2019 Refinement.',
      'Direct Reduced Iron — Natural-gas / Coal / Green-H2 / Syngas routes, Tier 1 or Tier 2 carbon balance.',
      'Blast furnace + BOF — Tier 1 integrated (1.46 tCO2/t crude steel) or Tier 2 (BF + BOF carbon balances with process-gas export credit).',
      'Electric Arc Furnace — Tier 1 electrodes-only (0.08 tCO2/t) or Tier 2 (electrodes + charge C + DRI C + scrap C − CS C; + flux calcination + oxy-fuel NG).',
      'Onsite lime kiln — combustion + calcination of charged limestone / dolomite.',
      'Refrigerant HFC fugitives — mass balance (preferred) or screening (charge × leak rate).',
      'SF6 from high-voltage switchgear (nameplate × leak rate or direct mass) — material at large mills (GWP 25,200).',
      'Other CH4 fugitives — coal stockpile, coke-oven seals, NG pipelines (activity × EF or direct mass).',
      'Reported / direct entries for corporate-aggregate disclosure (P&P-style fallback).',
    ],
    exclusions: [
      'Purchased electricity is Scope 2 — reported as a supporting line only, never in gross Scope 1.',
      'Third-party logistics / outsourced transport — Scope 3, excluded from gross.',
      'Upstream embedded emissions (pellets, sinter, pig iron, DRI, scrap, alloys) — Scope 3 Category 1, not Scope 1. CBAM treats them under "relevant precursors".',
      'CCS permanence accounting (transport / storage / leakage) — not modelled; capture only reduces the vented quantity for the period.',
      'Process-gas allocation per Section 8 — currently configured at the inventory level (POINT_OF_EMISSION / CARBON_ALLOCATION_UPSTREAM / ENERGY_BASED_CHP). Cross-validate with the downstream consumer (e.g., adjacent IPP).',
      'Uncertainty propagation (Monte Carlo / IPCC Tier 2) — qualitative only.',
    ],
    notes: [
      'Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + HFCs + SF6).',
      'Biogenic CO2 is reported as a SEPARATE memo line and excluded from gross Scope 1 per GHG Protocol convention. Biogenic CH4 + N2O DO count in gross.',
      'India NATCOM CEFs (coking coal 93.61, non-coking 95.81, lignite 106.51 t CO2/TJ) override IPCC defaults when the row sets useIndiaNatcom = true.',
      'EF / NCV overrides require a written overrideReason — undocumented overrides are blocked at validation (assurance gate).',
      'Process-gas allocation choice for COG / BFG / BOFG is the single biggest source of cross-mill comparison error. Disclose your chosen method.',
    ],
  }
}

export async function buildIronSteelWorkbook(
  payload: IronSteelInputPayload,
  result: IronSteelCalculationResult,
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
    ['Plant', payload.facility.name, ''],
    ['Process route', payload.facility.processRoute, ''],
    ['Reporting year', result.reportingPeriod.year, ''],
    ['Methodology pack', result.methodologyPack, ''],
    ['GWP set', result.gwpSet, ''],
    ['Status', result.status, ''],
    ['Data quality', result.dataQuality.overall, ''],
    ['— Gross Scope 1 (CO2 + CH4 + N2O + HFCs + SF6)', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
    ['  Stationary combustion', cat.stationaryCombustion.co2eTonnes, 'tCO2e'],
    ['  Mobile (owned)', cat.mobile.co2eTonnes, 'tCO2e'],
    ['  Coke oven', cat.cokeOven.co2eTonnes, 'tCO2e'],
    ['  Flaring (process gas)', cat.flaring.co2eTonnes, 'tCO2e'],
    ['  Sinter plant', cat.sinter.co2eTonnes, 'tCO2e'],
    ['  DRI', cat.dri.co2eTonnes, 'tCO2e'],
    ['  BF / BOF', cat.bfBof.co2eTonnes, 'tCO2e'],
    ['  EAF', cat.eaf.co2eTonnes, 'tCO2e'],
    ['  Lime kiln', cat.limeKiln.co2eTonnes, 'tCO2e'],
    ['  Fugitive HFC', cat.fugitiveHFC.co2eTonnes, 'tCO2e'],
    ['  Fugitive SF6', cat.fugitiveSF6.co2eTonnes, 'tCO2e'],
    ['  Fugitive other (CH4)', cat.fugitiveOther.co2eTonnes, 'tCO2e'],
    ['  Reported / direct', cat.reported.co2eTonnes, 'tCO2e'],
    ['— By gas: CO2', g.co2Tonnes, 'tCO2'],
    ['  CH4 (mass)', g.ch4Tonnes, 'tCH4'],
    ['  CH4 (as CO2e)', g.ch4CO2eTonnes, 'tCO2e'],
    ['  N2O (mass)', g.n2oTonnes, 'tN2O'],
    ['  N2O (as CO2e)', g.n2oCO2eTonnes, 'tCO2e'],
    ['  HFCs (as CO2e)', g.hfcCO2eTonnes, 'tCO2e'],
    ['  SF6 (as CO2e)', g.sf6CO2eTonnes, 'tCO2e'],
    ['Biogenic CO2 (memo, EXCLUDED from gross)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
    ['Supporting Scope 2 (electricity)', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
    ['Supporting Scope 3 (third-party mobile)', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
    ['— Production volumes (intensity denominators)', '', ''],
    ['Crude steel produced', payload.activityData.production.crudeSteelTonnes ?? 'n/a', 't'],
    ['Hot-rolled produced', payload.activityData.production.hotRolledTonnes ?? 'n/a', 't'],
    ['Hot metal produced', payload.activityData.production.hotMetalTonnes ?? 'n/a', 't'],
    ['Intensity — per t crude steel', im.co2ePerTonneCrudeSteel ?? 'n/a', 'kgCO2e/t'],
    ['Intensity — per t hot-rolled', im.co2ePerTonneHotRolled ?? 'n/a', 'kgCO2e/t'],
    ['Intensity — per t hot metal', im.co2ePerTonneHotMetal ?? 'n/a', 'kgCO2e/t'],
    ['Fossil CO2 intensity — per t crude steel', im.fossilCo2PerTonneCrudeSteel ?? 'n/a', 'kgCO2/t'],
    ['Reconciliation — disclosed gross', result.reconciliation.checked ? (result.reconciliation.disclosedGrossCO2eTonnes ?? 'n/a') : 'n/a', 'tCO2e'],
    ['Reconciliation — modelled gross', result.reconciliation.checked ? result.reconciliation.modelledGrossCO2eTonnes : 'n/a', 'tCO2e'],
    ['Reconciliation — variance', result.reconciliation.checked ? (result.reconciliation.variancePercent ?? 0) : 'n/a', '%'],
    ['Assumptions & limitations', result.assumptions.length, '(see Assumptions sheet)'],
  ]
  rows.forEach(([k, v, u]) => summary.addRow({ k, v, u }))
  summary.getRow(1).font = { bold: true }
  summary.getRow(10).font = { bold: true } // gross Scope 1

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
  addMethodologySheet(wb, ironSteelMethodology(payload, result))
  addFactorSnapshotsSheet(wb, result.factorSnapshots)
  addTraceSheet(wb, result.calculationTrace)
  addIssuesSheet(wb, result.errors, result.warnings)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
