/**
 * Stationary combustion for the Power Scope 1 engine.
 *
 *   Energy-based (Tier 1/2):  CO2 = qty × NCV × CO2_EF × OF / 1000
 *   Carbon-content (Tier 3):  CO2 = qty × %C × 44/12 × OF
 *   CEMS (Tier 5):            CO2 = directly supplied
 *
 * Handles fossil + biomass + waste-mixed origins. Biogenic CO2 goes to the
 * MEMO line, never gross. CH4/N2O from biomass combustion ARE in gross.
 * India NATCOM CEFs override the IPCC default per coal row when toggled.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import {
  INDIA_NATCOM_OVERRIDES,
  POWER_FUEL_DEFAULTS,
  POWER_STATIONARY_TECH_DEFAULTS,
  type PowerFuelDefault,
} from './constants'
import { ch4ToCO2e, n2oToCO2e, type PowerGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FuelEntry, GasAmounts, StationaryCombustionMethod } from './types'

const PROCESS_GAS_CARBON_FRACTION_DEFAULT = 0.75 // for plant-supplied carbon-content fuels

function resolveCo2Ef(
  ctx: EngineContext,
  entry: FuelEntry,
  def: PowerFuelDefault | undefined,
): { value: number; source: string; rank: number } {
  if (isPresent(entry.co2EfKgPerGj)) {
    return { value: entry.co2EfKgPerGj as number, source: 'user override', rank: 6 }
  }
  if (entry.useIndiaNatcom && INDIA_NATCOM_OVERRIDES[entry.fuelCode]) {
    const o = INDIA_NATCOM_OVERRIDES[entry.fuelCode]
    ctx.defaultsUsed.add('india_natcom_ef_used')
    ctx.warn(
      'india_natcom_ef_used',
      `Stationary "${entry.label}" used India NATCOM CEF for ${entry.fuelCode} (${o.co2EfKgPerGj} kg/GJ).`,
    )
    return { value: o.co2EfKgPerGj, source: o.source, rank: 3 }
  }
  if (def) {
    return { value: def.co2EfKgPerGj, source: def.source, rank: 5 }
  }
  ctx.error(
    'missing_co2_ef',
    `Stationary "${entry.label}" — no CO2 EF for fuel "${entry.fuelCode}" and no override.`,
  )
  return { value: 0, source: 'missing', rank: 6 }
}

function resolveTechFactors(
  fuelCode: string,
  technology: string,
): { ch4: number; n2o: number; source: string } {
  const techs = POWER_STATIONARY_TECH_DEFAULTS[fuelCode]
  if (techs && techs[technology]) {
    return {
      ch4: techs[technology].ch4EfKgPerGj,
      n2o: techs[technology].n2oEfKgPerGj,
      source: techs[technology].source,
    }
  }
  // Fallback: pick first available tech for the fuel
  if (techs) {
    const first = Object.values(techs)[0]
    return { ch4: first.ch4EfKgPerGj, n2o: first.n2oEfKgPerGj, source: first.source }
  }
  return { ch4: 0, n2o: 0, source: 'no tech default' }
}

/**
 * Compute CO2 + CH4 + N2O + biogenic memo for one fuel row.
 */
export function calculateFuelRow(
  ctx: EngineContext,
  method: StationaryCombustionMethod,
  entry: FuelEntry,
  gwp: PowerGwp,
  scope1Label: string,
): GasAmounts {
  const out = emptyGas()
  const def = POWER_FUEL_DEFAULTS[entry.fuelCode]

  // Negative guards
  for (const [field, val] of Object.entries({
    quantity: entry.quantity,
    ncvGjPerUnit: entry.ncvGjPerUnit,
    co2EfKgPerGj: entry.co2EfKgPerGj,
    biomassFraction: entry.biomassFraction,
    oxidationFactor: entry.oxidationFactor,
    cemsCo2Tonnes: entry.cemsCo2Tonnes,
  })) {
    if (typeof val === 'number' && val < 0) {
      ctx.error('negative_input_value', `Stationary "${entry.label}" ${field} cannot be negative (${val}).`)
      return out
    }
  }
  if (isPresent(entry.biomassFraction) && (entry.biomassFraction as number) > 1) {
    ctx.error('biomass_fraction_out_of_range',
      `Stationary "${entry.label}" biomass fraction ${entry.biomassFraction} > 1.`)
    return out
  }
  if (isPresent(entry.oxidationFactor) && (entry.oxidationFactor as number) > 1) {
    ctx.error('oxidation_factor_out_of_range',
      `Stationary "${entry.label}" oxidation factor ${entry.oxidationFactor} > 1.`)
    return out
  }

  if (isMissing(entry.quantity)) {
    ctx.error('missing_fuel_quantity', `Stationary "${entry.label}" has no quantity.`)
    return out
  }

  // CEMS path (Tier 5) — direct entry overrides everything
  if (method === 'DIRECT_MEASUREMENT' && isPresent(entry.cemsCo2Tonnes)) {
    const co2 = entry.cemsCo2Tonnes as number
    out.co2Tonnes = co2
    out.co2eTonnes = co2
    ctx.addTrace({
      step: `Stationary CEMS - ${entry.label}`,
      category: scope1Label,
      method: 'TIER_5_CEMS',
      formula: 'directly measured CO2 (mass) from CEMS stack',
      inputs: { cemsCo2Tonnes: round(co2, 4), fuelCode: entry.fuelCode },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2, 4),
    })
    return out
  }

  const qty = entry.quantity as number
  const ncv = isPresent(entry.ncvGjPerUnit) ? (entry.ncvGjPerUnit as number) : def?.ncvGjPerUnit ?? null
  if (isMissing(ncv)) {
    ctx.error('missing_ncv', `Stationary "${entry.label}" no NCV for fuel "${entry.fuelCode}".`)
    return out
  }
  const energyGj = qty * (ncv as number)
  const of = orDefault(entry.oxidationFactor, 1)

  let co2T: number
  if (method === 'CARBON_CONTENT_BASED') {
    // Tier 3: mass × %C × 44/12 × OF
    const carbonFrac = orDefault(entry.carbonContentFraction, PROCESS_GAS_CARBON_FRACTION_DEFAULT)
    if (isMissing(entry.carbonContentFraction)) {
      ctx.warn(
        'default_carbon_fraction_used',
        `Stationary "${entry.label}" used default carbon fraction ${carbonFrac} (Tier 3 — supply plant ultimate analysis).`,
      )
      ctx.defaultsUsed.add('default_carbon_fraction_used')
    }
    co2T = qty * carbonFrac * (44 / 12) * of
  } else {
    const efR = resolveCo2Ef(ctx, entry, def)
    ctx.resolver.record({
      factorCode: `POWER_FUEL_EF_${entry.fuelCode}`,
      factorName: `${def?.label ?? entry.fuelCode} CO2 EF`,
      value: efR.value,
      unit: 'kgCO2/GJ',
      source: efR.source,
      sourceVersion: 'consolidated',
      factorYear: null,
      priorityRank: efR.rank,
      isDefault: efR.rank !== 6,
      overridden: efR.rank === 6,
      overrideReason: efR.rank === 6 ? entry.overrideReason : undefined,
    })
    co2T = (energyGj * efR.value * of) / 1000
  }

  // CH4 / N2O via tech factors
  const tech = resolveTechFactors(entry.fuelCode, entry.technology)
  const ch4Ef = isPresent(entry.ch4EfKgPerGj) ? (entry.ch4EfKgPerGj as number) : tech.ch4
  const n2oEf = isPresent(entry.n2oEfKgPerGj) ? (entry.n2oEfKgPerGj as number) : tech.n2o
  const ch4T = (energyGj * ch4Ef) / 1000
  const n2oT = (energyGj * n2oEf) / 1000

  // Biomass split — biogenic CO2 to memo, fossil CO2 to gross
  const biomassFrac = isPresent(entry.biomassFraction)
    ? (entry.biomassFraction as number)
    : def?.biomassFraction ?? 0
  const fossilCo2 = co2T * (1 - biomassFrac)
  const biogenicCo2 = co2T * biomassFrac
  out.co2Tonnes = fossilCo2
  out.biogenicCO2Tonnes = biogenicCo2

  // CH4 / N2O — split fossil vs biogenic for GWP picking
  const biogenicCh4 = ch4T * biomassFrac
  const fossilCh4 = ch4T * (1 - biomassFrac)
  out.ch4Tonnes = ch4T
  out.n2oTonnes = n2oT
  const ch4CO2e = ch4ToCO2e(fossilCh4, gwp, false) + ch4ToCO2e(biogenicCh4, gwp, true)
  const n2oCO2e = n2oToCO2e(n2oT, gwp)
  out.co2eTonnes = fossilCo2 + ch4CO2e + n2oCO2e

  ctx.addTrace({
    step: `Stationary - ${entry.label}`,
    category: scope1Label,
    method,
    formula:
      method === 'CARBON_CONTENT_BASED'
        ? 'CO2 = qty × %C × 44/12 × OF'
        : 'CO2 = qty × NCV × CO2_EF × OF / 1000  ;  CH4/N2O = E × EF × GWP / 1000  ;  biomass→memo',
    inputs: {
      quantity: qty,
      unit: entry.quantityUnit,
      energyGj: round(energyGj, 3),
      fossilCo2Tonnes: round(fossilCo2, 4),
      biogenicCo2Memo: round(biogenicCo2, 4),
      ch4Tonnes: round(ch4T, 5),
      n2oTonnes: round(n2oT, 5),
      biomassFraction: biomassFrac,
      oxidationFactor: of,
    },
    factorSnapshots: ctx.resolver.list(),
    outputTonnesCO2: round(out.co2eTonnes, 4),
  })

  return out
}

export function calculateStationary(
  ctx: EngineContext,
  method: StationaryCombustionMethod,
  entries: FuelEntry[],
  gwp: PowerGwp,
  scopeLabel: 'STATIONARY_MAIN' | 'STATIONARY_AUXILIARY' | 'BIOMASS_COFIRING',
): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    const g = calculateFuelRow(ctx, method, e, gwp, scopeLabel)
    total.co2Tonnes += g.co2Tonnes
    total.ch4Tonnes += g.ch4Tonnes
    total.n2oTonnes += g.n2oTonnes
    total.biogenicCO2Tonnes += g.biogenicCO2Tonnes
    total.co2eTonnes += g.co2eTonnes
  }
  return total
}
