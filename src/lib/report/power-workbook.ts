/**
 * Power Sector audit workbook — summary, by-category gas breakdown,
 * biogenic + CCS memo, reconciliation, assumptions, methodology, factor
 * snapshots, full calculation trace, and validation.
 */

import ExcelJS from 'exceljs'

import type {
  ByCategory,
  PowerCalculationResult,
  PowerInputPayload,
} from '@/lib/engine/power'
import {
  addFactorSnapshotsSheet,
  addIssuesSheet,
  addMethodologySheet,
  addTraceSheet,
  type MethodologyContent,
} from './shared'

const CATEGORY_LABELS: Record<keyof ByCategory, string> = {
  stationaryMain: 'Stationary combustion (main)',
  stationaryAuxiliary: 'Stationary combustion (auxiliary)',
  biomassCofiring: 'Biomass cofiring (CH4/N2O only in gross)',
  mobile: 'Mobile (owned / controlled)',
  fgdLimestone: 'Process — wet FGD limestone',
  scrUrea: 'Process — SCR/SNCR urea',
  fugitiveSF6: 'SF6 from gas-insulated switchgear',
  fugitiveHFC: 'Refrigerant HFC fugitives',
  fugitiveOtherCH4: 'Other CH4 fugitives (coal / NG pipework)',
  ccusVenting: 'CCUS — start-up / regen vent (memo)',
  reported: 'Reported / direct',
}

export function powerBoundaryText(payload: PowerInputPayload): string {
  const b = payload.organizationBoundary
  if (b.boundaryMethod === 'EQUITY_SHARE') {
    return `Equity share — ${b.consolidationPercent ?? b.ownershipSharePercent ?? 100}% of each source consolidated`
  }
  if (b.boundaryMethod === 'FINANCIAL_CONTROL') {
    return 'Financial control — 100% of financially controlled assets'
  }
  return 'Operational control — 100% of operated assets (GHG Protocol recommended; EU ETS / EPA / CEA default)'
}

export function powerMethodology(
  payload: PowerInputPayload,
  result: PowerCalculationResult,
): MethodologyContent {
  return {
    standards: [
      'GHG Protocol Corporate Standard (WRI/WBCSD)',
      'ISO 14064-1:2018 (organisational GHG inventory, verifiable)',
      'IPCC 2006 Vol 2 Ch 2 (Stationary Combustion) + 2019 Refinement',
      'IPCC 2006 Vol 2 Ch 3 (Mobile Combustion)',
      'IPCC 2006 Vol 3 Ch 7 (HFC refrigerants)',
      'EU ETS MRR (Reg 2018/2066 consolidated) + AVR (Reg 2018/2067)',
      'US EPA GHGRP 40 CFR Part 98 Subparts A, C, D, DD (+ Part 75 Acid Rain)',
      'India CEA CO2 Baseline Database for the Indian Power Sector v21 (Nov–Dec 2025)',
      'India NATCOM CEFs (MoEFCC, ~120 coal samples)',
      'UK DEFRA-DESNZ Conversion Factors (annual)',
      'GRI 305 / SASB IF-EU / IFRS S2 / ESRS E1 (CSRD)',
      'CDP Climate Change Questionnaire (Module 7)',
      'India BRSR (SEBI, Principle 6 Environment) + BRSR Core',
      'SBTi Power Sector Net-Zero Standard (draft 2025–26)',
      `IPCC ${result.gwpSet.replace('_', ' · ')} Global Warming Potentials`,
    ],
    boundary: powerBoundaryText(payload),
    gwpBasis: `${result.gwpSet.replace('_', ' · ')} — fossil & biogenic CH4 treated separately; HFC + SF6 GWPs on the 100-year AR6 basis (industry convention). CSRD / ESRS E1 mandates AR6.`,
    covered: [
      'Stationary combustion — main boilers, gas turbines (OCGT / CCGT HRSG), reciprocating engines, IGCC syngas. Tier 1 (IPCC defaults) / Tier 2 (NATCOM / CEA / national overrides) / Tier 3 (plant-specific %C × 44/12) / Tier 5 (CEMS direct entry per row).',
      'Auxiliary combustion — start-up oil burners, emergency diesel gensets, fire-water pumps, black-start units, plant heating.',
      'Biomass cofiring — wood/bark/hog fuel, agri residue, biogas, mixed industrial waste, MSW/RDF. Biogenic CO2 → MEMO line (excluded from gross); CH4/N2O remain in Scope 1 with biogenic GWPs.',
      'Mobile combustion — captive coal haul fleet, locomotives, light vehicles, LPG forklifts. Owned/controlled only; third-party fleet routed to supporting Scope 3.',
      'Process emissions — wet FGD limestone CO2 (CaCO3 × purity × 44/100.09) and SCR/SNCR urea CO2 (urea × purity × 44/60.06). Optional N2O slip from SCR captured.',
      'Fugitive SF6 — mass-balance (EPA Subpart DD / EU ETS Annex IV preferred) or default leak rate by switchgear class (sealed-pressure new 0.5%/yr → closed-pressure older 8%/yr).',
      'Fugitive HFC refrigerants — mass-balance (preferred) or equipment-based (charge × annual leak rate). AR6 100-yr GWPs.',
      'Other CH4 fugitives — coal stockpile, coal handling, on-plant natural gas pipework (activity × EF or direct mass).',
      'CCS storage credit — captured-and-stored tonnes are DEDUCTED from gross Scope 1 per EU ETS Article 49 / EPA Subpart RR. Captured-and-utilised CO2 is NOT deducted (short-cycle re-release). CCS process vent kept in stationary stack with memo carve-out.',
      'Reported / direct entries for corporate-aggregate disclosure (CDP, BRSR, sustainability reports).',
    ],
    exclusions: [
      'Purchased electricity is Scope 2 — reported as a supporting line only, never in gross Scope 1.',
      'Third-party logistics / contracted fleet — Scope 3 Category 4, excluded from gross.',
      'Upstream coal mining methane (Scope 3 Category 3, fuel & energy related activities, NOT covered by this Scope 1 calculator).',
      'Construction emissions of plant assets — Scope 3 Category 2, not Scope 1.',
      'T&D losses on electricity sold (Scope 3 Cat 3 if reported by the generator) — not modelled.',
      'CCS permanence / reversal accounting — storage longevity, transport losses, and leak risk are deferred; capture only reduces gross for the reporting period.',
      'Hydrogen leakage from H2-cooled generators — emerging IPCC AR6 topic, not currently a Kyoto GHG.',
      'Uncertainty propagation (Monte Carlo / IPCC Tier 2 error propagation) — qualitative only.',
    ],
    notes: [
      'Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + HFCs + SF6) MINUS captured-and-stored CO2 (CCS credit per EU ETS Article 49).',
      'Biogenic CO2 from biomass cofiring is reported as a SEPARATE memo line and excluded from gross Scope 1 per GHG Protocol convention. Biogenic CH4 + N2O DO count in gross.',
      'India NATCOM CEFs (bituminous 95.81, sub-bituminous 95.81, lignite 106.51 t CO2/TJ) override IPCC defaults when the row sets useIndiaNatcom = true.',
      'CFB boilers have N2O ~10× higher than pulverised — pick the right boiler technology code.',
      'EF / NCV / NATCOM / CEMS / oxidation overrides require an Evidence note — undocumented overrides are blocked at validation (assurance gate).',
      'The canonical KPI is kgCO2e per MWh net generation. Global thermal average ~0.7 tCO2e/MWh; SBTi 1.5°C power pathway targets ~0.08 by 2050.',
    ],
  }
}

export async function buildPowerWorkbook(
  payload: PowerInputPayload,
  result: PowerCalculationResult,
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
    ['Plant technology', payload.facility.technology, ''],
    ['Reporting year', result.reportingPeriod.year, ''],
    ['Methodology pack', result.methodologyPack, ''],
    ['GWP set', result.gwpSet, ''],
    ['Status', result.status, ''],
    ['Data quality', result.dataQuality.overall, ''],
    ['— Gross Scope 1 (after CCS deduction)', result.scope1.grossScope1CO2eTonnes, 'tCO2e'],
    ['  CCS captured & stored (deducted)', result.ccsCapturedAndStoredTonnes, 'tCO2'],
    ['  Stationary main', cat.stationaryMain.co2eTonnes, 'tCO2e'],
    ['  Stationary auxiliary', cat.stationaryAuxiliary.co2eTonnes, 'tCO2e'],
    ['  Biomass cofiring (CH4/N2O only)', cat.biomassCofiring.co2eTonnes, 'tCO2e'],
    ['  Mobile (owned)', cat.mobile.co2eTonnes, 'tCO2e'],
    ['  Process — FGD limestone', cat.fgdLimestone.co2eTonnes, 'tCO2e'],
    ['  Process — SCR/SNCR urea', cat.scrUrea.co2eTonnes, 'tCO2e'],
    ['  Fugitive SF6', cat.fugitiveSF6.co2eTonnes, 'tCO2e'],
    ['  Fugitive HFC', cat.fugitiveHFC.co2eTonnes, 'tCO2e'],
    ['  Fugitive other (CH4)', cat.fugitiveOtherCH4.co2eTonnes, 'tCO2e'],
    ['  Reported / direct', cat.reported.co2eTonnes, 'tCO2e'],
    ['— By gas: CO2', g.co2Tonnes, 'tCO2'],
    ['  CH4 (mass)', g.ch4Tonnes, 'tCH4'],
    ['  N2O (mass)', g.n2oTonnes, 'tN2O'],
    ['  SF6 (mass)', g.sf6Tonnes, 'tSF6'],
    ['  HFCs (as CO2e)', g.hfcCO2eTonnes, 'tCO2e'],
    ['Biogenic CO2 (memo, EXCLUDED from gross)', result.memoItems.biogenicCO2Tonnes, 'tCO2'],
    ['CCS process vent (memo)', result.memoItems.ccsProcessVentTonnes, 'tCO2'],
    ['Supporting Scope 2 (electricity)', result.supportingScope2.purchasedElectricityCO2eTonnes, 'tCO2e'],
    ['Supporting Scope 3 (third-party mobile)', result.supportingScope3.thirdPartyMobileCO2eTonnes, 'tCO2e'],
    ['— Generation (intensity denominators)', '', ''],
    ['Gross generation', payload.activityData.production.grossGenerationMwh ?? 'n/a', 'MWh'],
    ['Net generation (sent out)', payload.activityData.production.netGenerationMwh ?? 'n/a', 'MWh'],
    ['Intensity — per MWh net (canonical KPI)', im.co2ePerMwhNet ?? 'n/a', 'kgCO2e/MWh'],
    ['Intensity — per MWh gross', im.co2ePerMwhGross ?? 'n/a', 'kgCO2e/MWh'],
    ['Fossil CO2 intensity — per MWh net', im.fossilCo2PerMwhNet ?? 'n/a', 'kgCO2/MWh'],
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
    { header: 'SF6 (t)', key: 'sf6', width: 16 },
    { header: 'HFC (tCO2e)', key: 'hfc', width: 16 },
    { header: 'Biogenic CO2 (t)', key: 'bio', width: 18 },
    { header: 'CO2e (t)', key: 'co2e', width: 16 },
  ]
  byCat.getRow(1).font = { bold: true }
  for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
    const a = cat[key as keyof typeof cat]
    byCat.addRow({
      cat: label, co2: a.co2Tonnes, ch4: a.ch4Tonnes, n2o: a.n2oTonnes,
      sf6: a.sf6Tonnes, hfc: a.hfcCO2eTonnes, bio: a.biogenicCO2Tonnes, co2e: a.co2eTonnes,
    })
  }
  byCat.addRow({
    cat: 'GROSS SCOPE 1',
    co2: g.co2Tonnes, ch4: g.ch4Tonnes, n2o: g.n2oTonnes,
    sf6: g.sf6Tonnes, hfc: g.hfcCO2eTonnes, bio: result.memoItems.biogenicCO2Tonnes,
    co2e: result.scope1.grossScope1CO2eTonnes,
  })
  byCat.lastRow!.font = { bold: true }

  // --- Reconciliation --------------------------------------------------
  const recon = wb.addWorksheet('Reconciliation')
  recon.columns = [
    { header: 'Disclosed metric', key: 'metric', width: 26 },
    { header: 'Disclosed', key: 'disclosed', width: 18 },
    { header: 'Modelled', key: 'modelled', width: 18 },
    { header: 'Unit', key: 'unit', width: 12 },
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
  const KIND_LABELS: Record<string, string> = { DEFAULT: 'Default', FALLBACK: 'Fallback', OVERRIDE: 'Override', ESTIMATED: 'Estimate' }
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
  addMethodologySheet(wb, powerMethodology(payload, result))
  addFactorSnapshotsSheet(wb, result.factorSnapshots)
  addTraceSheet(wb, result.calculationTrace)
  addIssuesSheet(wb, result.errors, result.warnings)

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}
