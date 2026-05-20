/**
 * Stationary combustion (kiln + non-kiln) with the spec's three method
 * options and automatic fallback from missing LHV/EF to the seed fuel
 * library. Fossil CO2 goes to gross Scope 1; biogenic CO2 is split out as a
 * memo item (never merged). CH4/N2O are computed as a clearly separated
 * non-CSI addendum (the CSI protocol itself is CO2-only).
 */

import { FUEL_DEFAULTS, GWP } from './constants'
import type { EngineContext } from './context'
import type { FuelCombustionMethod, FuelEntry } from './types'
import { isMissing, isPresent, orDefault, round } from './util'

export interface FuelOutcome {
  fossilCO2Tonnes: number
  biomassCO2Tonnes: number
  ch4N2oCO2eTonnes: number
  /** Resolved category after defaults applied. */
  category: FuelEntry['category']
}

export interface CombustionTotals {
  conventionalKilnFossilCO2Tonnes: number
  alternativeFossilKilnCO2Tonnes: number
  nonKilnFossilCO2Tonnes: number
  biomassCO2Tonnes: number
  ch4N2oCO2eTonnes: number
}

function recordFuelFactorSnapshot(
  ctx: EngineContext,
  fuelCode: string,
  efKgPerGj: number,
  overridden: boolean,
  overrideReason?: string,
): void {
  const def = FUEL_DEFAULTS[fuelCode]
  ctx.resolver.record({
    factorCode: `FUEL_EF_${fuelCode}`,
    factorName: `${def?.name ?? fuelCode} CO2 emission factor`,
    value: efKgPerGj,
    unit: 'kgCO2/GJ',
    source: overridden ? 'User override' : def?.source ?? 'Seed fuel library',
    sourceVersion: overridden ? 'user' : def?.sourceVersion ?? 'v2025.1',
    factorYear: overridden ? null : def?.factorYear ?? null,
    priorityRank: overridden ? 6 : 5,
    isDefault: !overridden,
    overridden,
    overrideReason: overridden ? overrideReason : undefined,
  })
}

/** True if the entry has any LHV/EF/biomass/direct/carbon override vs library. */
function hasAnyOverride(entry: FuelEntry): boolean {
  return (
    isPresent(entry.lhvGjPerUnit) ||
    isPresent(entry.co2EfKgPerGj) ||
    isPresent(entry.ch4EfKgPerGj) ||
    isPresent(entry.n2oEfKgPerGj) ||
    isPresent(entry.biomassFraction) ||
    isPresent(entry.carbonContentFraction) ||
    isPresent(entry.directCo2Tonnes)
  )
}

/** Compute CO2 (and CH4/N2O CO2e) for one fuel entry, applying fallbacks. */
export function calculateFuel(
  ctx: EngineContext,
  method: FuelCombustionMethod,
  entry: FuelEntry,
  scopeLabel: string,
): FuelOutcome {
  const def = FUEL_DEFAULTS[entry.fuelCode]
  const category = entry.category ?? def?.category ?? 'CONVENTIONAL_FOSSIL'
  const fieldBase = `fuel.${entry.id}`
  const zero: FuelOutcome = { fossilCO2Tonnes: 0, biomassCO2Tonnes: 0, ch4N2oCO2eTonnes: 0, category }

  // --- structural negative-value guards ----------------------------------
  const numericFields: { val: unknown; field: string; min?: number; max?: number; label: string }[] = [
    { val: entry.quantity, field: 'quantity', min: 0, label: 'quantity' },
    { val: entry.lhvGjPerUnit, field: 'lhvGjPerUnit', min: 0, label: 'LHV override' },
    { val: entry.co2EfKgPerGj, field: 'co2EfKgPerGj', min: 0, label: 'CO2 EF override' },
    { val: entry.ch4EfKgPerGj, field: 'ch4EfKgPerGj', min: 0, label: 'CH4 EF override' },
    { val: entry.n2oEfKgPerGj, field: 'n2oEfKgPerGj', min: 0, label: 'N2O EF override' },
    { val: entry.carbonContentFraction, field: 'carbonContentFraction', min: 0, max: 1, label: 'carbon content fraction' },
    { val: entry.directCo2Tonnes, field: 'directCo2Tonnes', min: 0, label: 'direct CO2' },
  ]
  for (const n of numericFields) {
    if (typeof n.val === 'number') {
      if (n.min !== undefined && n.val < n.min) {
        ctx.error(
          'negative_input_value',
          `Fuel "${entry.label}" ${n.label} cannot be negative (${n.val}).`,
          `${fieldBase}.${n.field}`,
        )
        return zero
      }
      if (n.max !== undefined && n.val > n.max) {
        ctx.error(
          'input_out_of_range',
          `Fuel "${entry.label}" ${n.label} must be ≤ ${n.max} (got ${n.val}).`,
          `${fieldBase}.${n.field}`,
        )
        return zero
      }
    }
  }

  // --- unit mismatch: blocking when no LHV override is supplied -----------
  if (
    def &&
    entry.quantityUnit &&
    entry.quantityUnit !== def.defaultUnit &&
    isMissing(entry.lhvGjPerUnit) &&
    method === 'ENERGY_BASED'
  ) {
    ctx.error(
      'unit_mismatch_no_lhv_override',
      `Fuel "${entry.label}" uses unit ${entry.quantityUnit} but the library LHV for ${entry.fuelCode} is per ${def.defaultUnit}. Supply an LHV override in GJ/${entry.quantityUnit} or change the unit.`,
      `${fieldBase}.quantityUnit`,
    )
    return zero
  }

  // --- category mismatch: block the dangerous fossil -> biomass case ------
  const fossilCategories = new Set<FuelEntry['category']>(['CONVENTIONAL_FOSSIL', 'ALTERNATIVE_FOSSIL'])
  if (def && fossilCategories.has(def.category) && entry.category === 'BIOMASS') {
    ctx.error(
      'fossil_fuel_marked_as_biomass',
      `Fuel "${entry.label}" library default is ${def.category} but it is marked BIOMASS. That would move all fossil CO2 to the biomass memo. Use a biomass fuel code (e.g. solid_biomass) or change the category.`,
      `${fieldBase}.category`,
    )
    return zero
  }
  if (def && entry.category && entry.category !== def.category) {
    ctx.warn(
      'fuel_category_mismatch',
      `Fuel "${entry.label}" is marked ${entry.category} but the library default for ${entry.fuelCode} is ${def.category}. Confirm this is intentional.`,
      `${fieldBase}.category`,
    )
  }

  // --- override reason: warn if any override is supplied with no reason --
  if (hasAnyOverride(entry) && !((entry.overrideReason ?? '').trim())) {
    ctx.warn(
      'override_missing_reason',
      `Fuel "${entry.label}" overrides a library default but no reason was recorded.`,
      `${fieldBase}.overrideReason`,
    )
  }

  if (isMissing(entry.quantity) && method !== 'DIRECT_MEASUREMENT') {
    ctx.error('missing_fuel_quantity', `Fuel "${entry.label}" has no quantity.`, `${fieldBase}.quantity`)
    return zero
  }

  let totalCO2 = 0
  let energyTJ = 0
  let traceFormula = ''
  const traceInputs: Record<string, number | string | null> = { fuelCode: entry.fuelCode }

  if (method === 'DIRECT_MEASUREMENT') {
    if (isMissing(entry.directCo2Tonnes)) {
      ctx.error(
        'missing_fuel_emission_factor',
        `Fuel "${entry.label}" uses direct measurement but no metered CO2 was provided.`,
        `${fieldBase}.directCo2Tonnes`,
      )
      return zero
    }
    totalCO2 = entry.directCo2Tonnes
    traceFormula = 'directly metered CO2'
    traceInputs.directCo2Tonnes = totalCO2
  } else if (method === 'CARBON_CONTENT_BASED') {
    if (isMissing(entry.carbonContentFraction)) {
      ctx.error(
        'missing_fuel_emission_factor',
        `Fuel "${entry.label}" uses carbon-content method but carbon content is missing.`,
        `${fieldBase}.carbonContentFraction`,
      )
      return zero
    }
    const co2PerC = ctx.resolver.constant('CO2_PER_C')
    totalCO2 = (entry.quantity as number) * entry.carbonContentFraction * co2PerC
    traceFormula = 'quantity (t) x carbonContentFraction x (44/12)'
    traceInputs.quantity = entry.quantity as number
    traceInputs.carbonContentFraction = entry.carbonContentFraction
    traceInputs.co2PerC = round(co2PerC)
  } else {
    // ENERGY_BASED
    let lhv = entry.lhvGjPerUnit
    if (isMissing(lhv)) {
      if (def) {
        lhv = def.lhvGjPerUnit
        ctx.defaultsUsed.add('default_lhv_used')
        ctx.warn('default_lhv_used', `Default LHV ${lhv} GJ/${def.defaultUnit} used for "${entry.label}".`)
      } else {
        ctx.error(
          'missing_lhv_for_energy_based_fuel',
          `Fuel "${entry.label}" uses energy-based method but LHV is missing and no library default exists.`,
          `${fieldBase}.lhvGjPerUnit`,
        )
        return zero
      }
    }
    let ef = entry.co2EfKgPerGj
    let efOverridden = isPresent(entry.co2EfKgPerGj)
    if (isMissing(ef)) {
      if (def) {
        ef = def.co2EfKgPerGj
        efOverridden = false
        ctx.defaultsUsed.add('default_fuel_ef_used')
        ctx.warn('default_fuel_ef_used', `Default CO2 EF ${ef} kgCO2/GJ used for "${entry.label}".`)
      } else {
        ctx.error(
          'missing_fuel_emission_factor',
          `Fuel "${entry.label}" has no CO2 emission factor and no library default.`,
          `${fieldBase}.co2EfKgPerGj`,
        )
        return zero
      }
    }
    if (
      efOverridden &&
      (ef as number) === 0 &&
      fossilCategories.has(category) &&
      !((entry.overrideReason ?? '').trim())
    ) {
      ctx.error(
        'zero_fossil_co2_ef_without_reason',
        `Fuel "${entry.label}" CO2 EF was overridden to 0 on a fossil fuel without a recorded reason. Add a reason (e.g. CCS at fuel level / metered zero) or use the direct-measurement method.`,
        `${fieldBase}.co2EfKgPerGj`,
      )
      return zero
    }
    recordFuelFactorSnapshot(ctx, entry.fuelCode, ef as number, efOverridden, entry.overrideReason)
    energyTJ = ((entry.quantity as number) * (lhv as number)) / 1000
    totalCO2 = energyTJ * (ef as number)
    traceFormula = 'energyTJ = qty x LHV / 1000 ; CO2 t = energyTJ x EF(kgCO2/GJ)'
    traceInputs.quantity = entry.quantity as number
    traceInputs.lhvGjPerUnit = lhv as number
    traceInputs.co2EfKgPerGj = ef as number
    traceInputs.energyTJ = round(energyTJ, 6)
  }

  // --- fossil / biomass split ---------------------------------------------
  let biomassFraction: number
  const rawBiomassFraction = entry.biomassFraction
  if (isPresent(rawBiomassFraction) && (rawBiomassFraction < 0 || rawBiomassFraction > 1)) {
    ctx.warn(
      'biomass_fraction_outside_0_1',
      `Fuel "${entry.label}" biomass fraction ${rawBiomassFraction} is outside [0, 1]; clamped.`,
      `${fieldBase}.biomassFraction`,
    )
  }
  if (category === 'BIOMASS') {
    biomassFraction = orDefault(rawBiomassFraction, def?.biomassFraction ?? 1)
  } else if (category === 'MIXED') {
    if (isPresent(rawBiomassFraction)) {
      biomassFraction = rawBiomassFraction
    } else if (def) {
      biomassFraction = def.biomassFraction
      ctx.warn(
        'alternative_fuel_split_unknown',
        `Fuel "${entry.label}" is mixed; biomass split not provided. Library default ${biomassFraction} used.`,
        `${fieldBase}.biomassFraction`,
      )
    } else {
      biomassFraction = 0
      ctx.warn(
        'alternative_fuel_split_unknown',
        `Fuel "${entry.label}" is mixed with unknown split and no default; treated as 100% fossil (conservative).`,
        `${fieldBase}.biomassFraction`,
      )
    }
  } else {
    biomassFraction = orDefault(rawBiomassFraction, def?.biomassFraction ?? 0)
  }
  biomassFraction = Math.min(Math.max(biomassFraction, 0), 1)

  const biomassCO2 = totalCO2 * biomassFraction
  const fossilCO2 = totalCO2 * (1 - biomassFraction)

  // --- non-CSI CH4 / N2O addendum (energy-based only) ---------------------
  let ch4N2oCO2e = 0
  if (energyTJ > 0) {
    const energyGJ = energyTJ * 1000
    const ch4Ef = orDefault(entry.ch4EfKgPerGj, def?.ch4EfKgPerGj ?? 0)
    const n2oEf = orDefault(entry.n2oEfKgPerGj, def?.n2oEfKgPerGj ?? 0)
    const ch4Kg = energyGJ * ch4Ef
    const n2oKg = energyGJ * n2oEf
    const gwp = GWP[ctx.gwpSet]
    ch4N2oCO2e = (ch4Kg * gwp.CH4 + n2oKg * gwp.N2O) / 1000
  }

  const auditInputs: Record<string, number | string | null> = { ...traceInputs, biomassFraction }
  if (entry.evidenceReference) auditInputs.evidenceReference = entry.evidenceReference
  if (entry.overrideReason) auditInputs.overrideReason = entry.overrideReason

  ctx.addTrace({
    step: `Combustion CO2 - ${entry.label}`,
    category: scopeLabel,
    method,
    formula: traceFormula,
    inputs: auditInputs,
    factorSnapshots: ctx.resolver.list(),
    outputTonnesCO2: round(fossilCO2, 4),
  })
  if (biomassCO2 > 0) {
    ctx.addTrace({
      step: `Biomass CO2 memo - ${entry.label}`,
      category: 'MEMO',
      method,
      formula: 'totalCO2 x biomassFraction (excluded from gross Scope 1)',
      inputs: { totalCO2Tonnes: round(totalCO2, 4), biomassFraction },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(biomassCO2, 4),
    })
  }

  return { fossilCO2Tonnes: fossilCO2, biomassCO2Tonnes: biomassCO2, ch4N2oCO2eTonnes: ch4N2oCO2e, category }
}

export function calculateCombustion(
  ctx: EngineContext,
  method: FuelCombustionMethod,
  kilnFuels: FuelEntry[],
  nonKilnFuels: FuelEntry[],
): CombustionTotals {
  const totals: CombustionTotals = {
    conventionalKilnFossilCO2Tonnes: 0,
    alternativeFossilKilnCO2Tonnes: 0,
    nonKilnFossilCO2Tonnes: 0,
    biomassCO2Tonnes: 0,
    ch4N2oCO2eTonnes: 0,
  }

  for (const entry of kilnFuels) {
    const o = calculateFuel(ctx, method, entry, 'KILN_FUEL')
    if (o.category === 'CONVENTIONAL_FOSSIL') {
      totals.conventionalKilnFossilCO2Tonnes += o.fossilCO2Tonnes
    } else {
      totals.alternativeFossilKilnCO2Tonnes += o.fossilCO2Tonnes
    }
    totals.biomassCO2Tonnes += o.biomassCO2Tonnes
    totals.ch4N2oCO2eTonnes += o.ch4N2oCO2eTonnes
  }

  for (const entry of nonKilnFuels) {
    const o = calculateFuel(ctx, method, entry, 'NON_KILN_FUEL')
    totals.nonKilnFossilCO2Tonnes += o.fossilCO2Tonnes
    totals.biomassCO2Tonnes += o.biomassCO2Tonnes
    totals.ch4N2oCO2eTonnes += o.ch4N2oCO2eTonnes
  }

  return totals
}
