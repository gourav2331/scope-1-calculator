/**
 * Stationary fossil-fuel combustion — Section 7.1 of Research Brief.
 *
 *   ENERGY_BASED:        E_CO2 = activity × NCV × EF_CO2 / 1000   (Eq 7.1)
 *                         CH4/N2O = activity × NCV × EF_CH4|N2O,fuel,tech / 1000   (Eq 7.2)
 *   CARBON_CONTENT_BASED: E_CO2 = activity_t × C_frac × oxidation × (44/12)
 *   DIRECT_MEASUREMENT:  E_CO2 = directCo2Tonnes (CEMS Tier 4)
 *
 * IPCC 2006 default oxidation = 1.0 (kept overridable for site-demonstrated cases).
 * Biomass CO2 is NEVER routed here — see biomass.ts (CO2 goes to memo).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { PP_STATIONARY_TECH_DEFAULTS, PULPPAPER_FUEL_DEFAULTS, type PpFuelDefault, type PpTechFactor } from './constants'
import { ch4ToCO2e, n2oToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FuelEntry, GasAmounts, PpStationaryMethod } from './types'

const C_PER_C_TO_CO2 = 44 / 12

function fuelDefault(code: string): PpFuelDefault | null {
  return PULPPAPER_FUEL_DEFAULTS[code] ?? null
}

function techFactor(fuelCode: string, tech?: string): PpTechFactor | null {
  const map = PP_STATIONARY_TECH_DEFAULTS[fuelCode]
  if (!map) return null
  if (tech && map[tech]) return map[tech]
  // Fall back to first available tech
  const first = Object.values(map)[0]
  return first ?? null
}

export function calculateStationaryCombustion(
  ctx: EngineContext,
  method: PpStationaryMethod,
  entries: FuelEntry[],
  gwp: PulpPaperGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.quantity)) {
      ctx.error('missing_fuel_quantity', `Stationary "${e.label}" has no quantity.`, `stationaryCombustion.${e.id}.quantity`)
      continue
    }
    if ((e.quantity as number) < 0) {
      ctx.error('negative_input_value', `Stationary "${e.label}" quantity cannot be negative.`, `stationaryCombustion.${e.id}.quantity`)
      continue
    }
    const qty = e.quantity as number
    const fdef = fuelDefault(e.fuelCode)

    let co2T = 0
    let ch4T = 0
    let n2oT = 0
    let energyGj = 0
    let methodNote = method as string

    // Resolve NCV (override > library default)
    const ncv = isPresent(e.ncvGjPerUnit) ? (e.ncvGjPerUnit as number) : fdef?.ncvGjPerUnit ?? null
    if (method !== 'DIRECT_MEASUREMENT' && isMissing(ncv)) {
      ctx.error('missing_ncv', `Stationary "${e.label}": no NCV for fuel ${e.fuelCode}.`, `stationaryCombustion.${e.id}.ncvGjPerUnit`)
      continue
    }
    if (method !== 'DIRECT_MEASUREMENT') energyGj = qty * (ncv as number)

    if (method === 'DIRECT_MEASUREMENT') {
      if (isMissing(e.directCo2Tonnes)) {
        ctx.error('missing_direct_co2', `Stationary "${e.label}" direct method needs directCo2Tonnes.`, `stationaryCombustion.${e.id}.directCo2Tonnes`)
        continue
      }
      if ((e.directCo2Tonnes as number) < 0) {
        ctx.error('negative_input_value', `Stationary "${e.label}" directCo2Tonnes cannot be negative.`)
        continue
      }
      co2T = e.directCo2Tonnes as number
      methodNote = 'DIRECT_MEASUREMENT (CEMS)'
      // CH4/N2O can't be derived without energy basis; warn.
      ctx.warn('direct_measurement_no_non_co2', `Stationary "${e.label}" direct CO2 mode: CH4/N2O not computed (no fuel energy basis).`)
    } else if (method === 'CARBON_CONTENT_BASED') {
      if (isMissing(e.carbonContentFraction)) {
        ctx.error('missing_carbon_content', `Stationary "${e.label}" carbon-content method needs carbonContentFraction.`, `stationaryCombustion.${e.id}.carbonContentFraction`)
        continue
      }
      const cFrac = e.carbonContentFraction as number
      if (cFrac < 0 || cFrac > 1) {
        ctx.error('negative_input_value', `Stationary "${e.label}" carbon content ${cFrac} must be in [0,1].`)
        continue
      }
      const ox = isPresent(e.oxidationFactor) ? (e.oxidationFactor as number) : 1.0
      if (ox < 0 || ox > 1) {
        ctx.error('negative_input_value', `Stationary "${e.label}" oxidation ${ox} must be in [0,1].`)
        continue
      }
      co2T = qty * cFrac * ox * C_PER_C_TO_CO2
      methodNote = 'CARBON_CONTENT (Tier 3/4 fuel carbon)'
      // CH4/N2O from tech table if available
      const tf = techFactor(e.fuelCode, e.technology)
      if (tf) {
        ch4T = (energyGj * (isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tf.ch4EfKgPerGj)) / 1000
        n2oT = (energyGj * (isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tf.n2oEfKgPerGj)) / 1000
      }
    } else {
      // ENERGY_BASED (Eq 7.1 / 7.2)
      const co2Ef = isPresent(e.co2EfKgPerGj) ? (e.co2EfKgPerGj as number) : fdef?.co2EfKgPerGj ?? null
      if (isMissing(co2Ef)) {
        ctx.error('missing_co2_ef', `Stationary "${e.label}": no CO2 EF for fuel ${e.fuelCode}.`)
        continue
      }
      co2T = (energyGj * (co2Ef as number)) / 1000
      const tf = techFactor(e.fuelCode, e.technology)
      const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tf?.ch4EfKgPerGj ?? 0
      const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tf?.n2oEfKgPerGj ?? 0
      ch4T = (energyGj * ch4Ef) / 1000
      n2oT = (energyGj * n2oEf) / 1000
      if (!tf && (isMissing(e.ch4EfKgPerGj) || isMissing(e.n2oEfKgPerGj))) {
        ctx.warn('default_non_co2_factors_missing', `Stationary "${e.label}": no CH4/N2O tech factors for ${e.fuelCode}/${e.technology ?? '(none)'}; CH4=N2O=0.`)
      }
    }

    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)
    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Stationary - ${e.label}`,
      category: 'STATIONARY_FOSSIL',
      method: methodNote,
      formula: method === 'CARBON_CONTENT_BASED'
        ? 'CO2 = qty × C_frac × oxidation × 44/12; CH4/N2O = energy × EF_tech / 1000'
        : method === 'DIRECT_MEASUREMENT'
        ? 'CO2 = directCo2Tonnes (CEMS)'
        : 'CO2 = qty × NCV × EF_CO2 / 1000; CH4/N2O = energy × EF_tech / 1000',
      inputs: { quantity: qty, unit: e.quantityUnit, energyGj: round(energyGj, 3), fuelCode: e.fuelCode, technology: e.technology ?? null },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
