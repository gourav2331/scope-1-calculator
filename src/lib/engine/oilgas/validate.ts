/**
 * Structural validation for the Oil & Gas pack, run before calculation, plus
 * the scope-separation invariants asserted after. Mirrors the cement pack's
 * philosophy: required inputs, the null-vs-zero rule, gas-composition closure
 * (V2 rule V1), the scope decision-tree guardrails (V1 §3.5), and exclusion
 * reasons. Per-source numeric errors are raised by the category modules.
 */

import type { EngineContext } from '../context'
import { isPresent } from '../util'
import type {
  GasComposition,
  OilGasCalculationResult,
  OilGasInputPayload,
  OilGasSourceApplicability,
} from './types'

const ELECTRICITY_FUEL_HINTS = ['electric', 'grid power', 'purchased power', 'grid electricity']

function compositionSum(c: GasComposition): number {
  const parts = [c.ch4Percent, c.co2Percent, c.c2h6Percent, c.c3h8Percent, c.c4PlusPercent, c.n2Percent, c.h2sPercent]
  return parts.reduce<number>((a, p) => a + (isPresent(p) ? (p as number) : 0), 0)
}

function validateComposition(ctx: EngineContext, c: GasComposition, label: string, fieldBase: string): void {
  const components: Array<[number | null | undefined, string]> = [
    [c.ch4Percent, 'CH4'],
    [c.co2Percent, 'CO2'],
    [c.c2h6Percent, 'C2H6'],
    [c.c3h8Percent, 'C3H8'],
    [c.c4PlusPercent, 'C4+'],
    [c.n2Percent, 'N2'],
    [c.h2sPercent, 'H2S'],
  ]
  for (const [v, g] of components) {
    if (typeof v === 'number' && v < 0) {
      ctx.error('negative_input_value', `"${label}" ${g} mol% cannot be negative (${v}).`, `${fieldBase}.composition`)
    }
  }
  const sum = compositionSum(c)
  if (sum === 0) {
    ctx.error('gas_composition_required', `"${label}" needs a gas composition (at least CH4 and CO2 mol%).`, `${fieldBase}.composition`)
    return
  }
  if (Math.abs(sum - 100) > 0.5) {
    ctx.error(
      'gas_composition_sum_invalid',
      `"${label}" gas composition sums to ${sum.toFixed(2)} mol% — it must be 100% ± 0.5% (include N2/balance).`,
      `${fieldBase}.composition`,
    )
  }
}

export function validateOilGasInput(ctx: EngineContext, payload: OilGasInputPayload): void {
  const { sector, calculationContext, facility, organizationBoundary, sourceApplicability, activityData } = payload

  if (!sector?.sectorCode) {
    ctx.error('missing_sector_code', 'Sector code is required before any calculation.')
  } else if (sector.sectorCode !== 'OIL_GAS') {
    ctx.error('unsupported_sector', `This engine handles OIL_GAS; received "${sector.sectorCode}".`)
  }

  const rp = calculationContext?.reportingPeriod
  if (!rp || !rp.year || !rp.startDate || !rp.endDate) {
    ctx.error('missing_reporting_period', 'A reporting period (year, start, end) is required.')
  }
  if (!facility?.name) ctx.error('missing_facility', 'A facility must be provided.')
  if (!facility?.segment) ctx.error('missing_segment', 'A value-chain segment (upstream/midstream/downstream) is required.')
  if (!organizationBoundary?.boundaryMethod) ctx.error('missing_boundary_method', 'An organisational boundary method is required.')

  // --- production negative checks -----------------------------------------
  const prod = activityData.production
  const prodChecks: Array<[number | null | undefined, string, string]> = [
    [prod.boeProduced, 'boeProduced', 'BOE produced'],
    [prod.oilProductionBbl, 'oilProductionBbl', 'oil production'],
    [prod.gasProductionMMscf, 'gasProductionMMscf', 'gas production'],
    [prod.crudeProcessedBbl, 'crudeProcessedBbl', 'crude processed'],
    [prod.lngProducedTonnes, 'lngProducedTonnes', 'LNG produced'],
    [prod.throughputMMscf, 'throughputMMscf', 'throughput'],
  ]
  for (const [v, field, label] of prodChecks) {
    if (typeof v === 'number' && v < 0) {
      ctx.error('negative_production_value', `${label} cannot be negative.`, `activityData.production.${field}`)
    }
  }

  // --- scope decision-tree guardrail (V1 §3.5) ----------------------------
  // Purchased grid electricity is Scope 2, never Scope 1. Block if a combustion
  // fuel line is actually electricity.
  for (const f of activityData.stationaryCombustion ?? []) {
    const hay = `${f.fuelCode} ${f.label}`.toLowerCase()
    if (ELECTRICITY_FUEL_HINTS.some((h) => hay.includes(h))) {
      ctx.error(
        'scope2_electricity_entered_as_scope1',
        `"${f.label}" appears to be purchased electricity (Scope 2), not direct combustion. Move it to the purchased-electricity (supporting Scope 2) input.`,
        `activityData.stationaryCombustion`,
      )
    }
  }

  // --- gas composition closure for flaring & venting ----------------------
  for (const fl of activityData.flaring ?? []) {
    if (fl.operatingStatus !== 'unlit') validateComposition(ctx, fl.composition, `Flare "${fl.label}"`, `flaring.${fl.id}`)
    else validateComposition(ctx, fl.composition, `Flare "${fl.label}"`, `flaring.${fl.id}`)
  }
  for (const v of activityData.venting ?? []) {
    validateComposition(ctx, v.composition, `Vent "${v.label}"`, `venting.${v.id}`)
    if (typeof v.captureFraction === 'number' && (v.captureFraction < 0 || v.captureFraction > 1)) {
      ctx.error('value_out_of_range', `Vent "${v.label}" VRU capture fraction must be between 0 and 1 (${v.captureFraction}).`, `venting.${v.id}.captureFraction`)
    }
  }

  // --- negative / out-of-range numeric guards -----------------------------
  // No route may accept a negative emission-driving input. The negative ×
  // negative generic-process case is caught here (its product is positive, so a
  // result-only check would miss it).
  const nonNeg = (val: number | null | undefined, field: string, label: string) => {
    if (typeof val === 'number' && val < 0) ctx.error('negative_input_value', `${label} cannot be negative (${val}).`, field)
  }
  const inUnit = (val: number | null | undefined, field: string, label: string) => {
    if (typeof val === 'number' && (val < 0 || val > 1)) ctx.error('value_out_of_range', `${label} must be between 0 and 1 (${val}).`, field)
  }
  for (const r of activityData.refrigerants ?? []) {
    nonNeg(r.purchasesKg, `refrigerants.${r.id}.purchasesKg`, `Refrigerant "${r.label}" purchases`)
    nonNeg(r.disposalsKg, `refrigerants.${r.id}.disposalsKg`, `Refrigerant "${r.label}" disposals`)
    // chargeCapacityKg / leakRatePercentYr are validated in the refrigerant module;
    // inventoryChangeKg (closing − opening) may legitimately be negative.
  }
  for (const e of activityData.process ?? []) {
    const b = `process.${e.id}`
    nonNeg(e.smrEfTco2PerTonneH2, `${b}.smrEfTco2PerTonneH2`, 'SMR EF')
    nonNeg(e.feedstockGasSm3, `${b}.feedstockGasSm3`, 'Feedstock gas volume')
    inUnit(e.feedstockCh4Fraction, `${b}.feedstockCh4Fraction`, 'Feedstock CH4 fraction')
    nonNeg(e.fuelGasSm3, `${b}.fuelGasSm3`, 'Fuel gas volume')
    nonNeg(e.fuelGasLhvGjPerSm3, `${b}.fuelGasLhvGjPerSm3`, 'Fuel gas LHV')
    nonNeg(e.fuelGasCo2EfKgPerGj, `${b}.fuelGasCo2EfKgPerGj`, 'Fuel gas CO2 EF')
    inUnit(e.cokeCarbonFraction, `${b}.cokeCarbonFraction`, 'Coke carbon fraction')
    nonNeg(e.acidGasVolumeSm3, `${b}.acidGasVolumeSm3`, 'Acid gas volume')
    inUnit(e.acidGasCo2Fraction, `${b}.acidGasCo2Fraction`, 'Acid gas CO2 fraction')
    inUnit(e.co2CaptureFraction, `${b}.co2CaptureFraction`, 'CO2 capture fraction')
    nonNeg(e.throughput, `${b}.throughput`, 'Throughput')
    nonNeg(e.efTco2PerUnit, `${b}.efTco2PerUnit`, 'Process EF')
    nonNeg(e.directCo2Tonnes, `${b}.directCo2Tonnes`, 'Direct CO2')
    nonNeg(e.ch4Tonnes, `${b}.ch4Tonnes`, 'Process CH4')
    nonNeg(e.n2oTonnes, `${b}.n2oTonnes`, 'Process N2O')
    // hydrogenProducedTonnes / cokeBurnedTonnes are validated in the process module.
  }
  for (const e of activityData.reported ?? []) {
    const b = `reported.${e.id}`
    nonNeg(e.co2eTonnes, `${b}.co2eTonnes`, 'Reported CO2e')
    nonNeg(e.co2Tonnes, `${b}.co2Tonnes`, 'Reported CO2')
    nonNeg(e.ch4Tonnes, `${b}.ch4Tonnes`, 'Reported CH4')
    nonNeg(e.n2oTonnes, `${b}.n2oTonnes`, 'Reported N2O')
  }
  nonNeg(activityData.disclosedGrossScope1CO2eTonnes, 'activityData.disclosedGrossScope1CO2eTonnes', 'Disclosed gross Scope 1')
  nonNeg(activityData.disclosedScope1CO2Tonnes, 'activityData.disclosedScope1CO2Tonnes', 'Disclosed Scope 1 CO2')
  nonNeg(activityData.disclosedScope1CH4Tonnes, 'activityData.disclosedScope1CH4Tonnes', 'Disclosed Scope 1 CH4')
  nonNeg(activityData.disclosedScope1N2OTonnes, 'activityData.disclosedScope1N2OTonnes', 'Disclosed Scope 1 N2O')
  nonNeg(activityData.disclosedScope2CO2eTonnes, 'activityData.disclosedScope2CO2eTonnes', 'Disclosed Scope 2')

  // --- supporting electricity negative check ------------------------------
  const mwh = activityData.purchasedElectricity?.mwh
  if (typeof mwh === 'number' && mwh < 0) {
    ctx.error('negative_input_value', 'Purchased electricity (MWh) cannot be negative.', 'activityData.purchasedElectricity.mwh')
  }

  // --- source exclusion must carry a reason -------------------------------
  const flags: Array<[keyof OilGasSourceApplicability, string]> = [
    ['stationaryCombustion', 'Stationary combustion'],
    ['mobileCombustion', 'Mobile combustion'],
    ['flaring', 'Flaring'],
    ['venting', 'Venting'],
    ['fugitiveComponents', 'Fugitive components'],
    ['refrigerants', 'Refrigerants'],
    ['process', 'Process emissions'],
    ['reported', 'Reported / direct emissions'],
    ['purchasedElectricity', 'Purchased electricity'],
  ]
  for (const [key, label] of flags) {
    if (sourceApplicability[key] === false) {
      const reason = sourceApplicability.exclusionReasons?.[key as string]
      if (!reason || !reason.trim()) {
        ctx.error('source_exclusion_without_reason', `Source "${label}" is excluded but no reason was recorded.`, `sourceApplicability.exclusionReasons.${String(key)}`)
      }
    }
  }

  // --- factor override sanity ---------------------------------------------
  for (const [code, ov] of Object.entries(payload.factorOverrides ?? {})) {
    if (typeof ov.value === 'number' && ov.value < 0) {
      ctx.error('factor_override_invalid', `Factor override for "${code}" must be >= 0 (got ${ov.value}).`, `factorOverrides.${code}.value`)
    }
    if (!(ov.reason ?? '').trim()) {
      ctx.warn('override_missing_reason', `Factor override for "${code}" has no reason recorded — the audit trail will be weaker.`, `factorOverrides.${code}.reason`)
    }
  }
}

/**
 * Post-calculation invariants. The architecture keeps buckets separate; these
 * assertions fail loudly if that ever regresses.
 */
export function assertOilGasScopeSeparation(ctx: EngineContext, result: OilGasCalculationResult): void {
  const gross = result.scope1.grossScope1CO2eTonnes
  const sumCategories = Object.values(result.scope1.byCategory).reduce((a, g) => a + g.co2eTonnes, 0)
  if (Math.abs(gross - sumCategories) > 1e-4) {
    ctx.error('gross_scope1_total_mismatch', `Gross Scope 1 (${gross}) does not equal the sum of category CO2e (${sumCategories}).`)
  }
  if (result.scope1.excludedFromGrossScope1.biogenicCO2MemoTonnes !== result.memoItems.biogenicCO2Tonnes) {
    ctx.error('biogenic_co2_included_in_gross_scope1', 'Biogenic CO2 memo must match the excluded biogenic bucket (never inside gross Scope 1).')
  }
  if (result.scope1.excludedFromGrossScope1.purchasedElectricityCO2eTonnes !== result.supportingScope2.purchasedElectricityCO2eTonnes) {
    ctx.error('purchased_electricity_included_in_scope1', 'Purchased electricity must stay in supporting Scope 2.')
  }
  if (result.scope1.excludedFromGrossScope1.thirdPartyMobileCO2eTonnes !== result.supportingScope3.thirdPartyMobileCO2eTonnes) {
    ctx.error('third_party_mobile_included_in_scope1', 'Third-party mobile combustion must stay in supporting Scope 3.')
  }
}
