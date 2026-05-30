/**
 * Onsite lime kiln — fuel combustion CO2/CH4/N2O + calcination process CO2.
 *
 *   Combustion: energy × EF (like stationary combustion)
 *   Calcination: limestone_t × 0.440 + dolomite_t × 0.477 × calcination_fraction
 *
 * IPCC 2006 Vol 3 Ch 2 (Mineral Industry) gives 0.785 tCO2/t lime produced
 * as the all-in default (assumes pure CaCO3 feed + full calcination), but for
 * the corporate inventory we model the carbonate input directly so make-up
 * and partial calcination are handled correctly.
 *
 * Calcination CO2 is FOSSIL (mined limestone) unless explicitly biogenic.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { CARBONATE_CALCINATION_FACTORS, IRONSTEEL_FUEL_DEFAULTS, IS_STATIONARY_TECH_DEFAULTS } from './constants'
import { ch4ToCO2e, n2oToCO2e, type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, LimeKilnEntry } from './types'

export function calculateLimeKiln(
  ctx: EngineContext,
  entries: LimeKilnEntry[],
  gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    // --- combustion side
    if (isMissing(e.fuelQuantity)) {
      ctx.error('missing_kiln_fuel_quantity', `Lime kiln "${e.label}" has no fuelQuantity.`)
      continue
    }
    if ((e.fuelQuantity as number) < 0) {
      ctx.error('negative_input_value', `Lime kiln "${e.label}" fuelQuantity cannot be negative.`)
      continue
    }
    const qty = e.fuelQuantity as number
    const fdef = IRONSTEEL_FUEL_DEFAULTS[e.fuelCode]
    const ncv = isPresent(e.ncvGjPerUnit) ? (e.ncvGjPerUnit as number) : fdef?.ncvGjPerUnit ?? null
    if (isMissing(ncv)) {
      ctx.error('missing_ncv', `Lime kiln "${e.label}" no NCV for fuel ${e.fuelCode}.`)
      continue
    }
    const energyGj = qty * (ncv as number)
    const co2Ef = isPresent(e.co2EfKgPerGj) ? (e.co2EfKgPerGj as number) : fdef?.co2EfKgPerGj ?? null
    if (isMissing(co2Ef)) {
      ctx.error('missing_co2_ef', `Lime kiln "${e.label}" no CO2 EF for fuel ${e.fuelCode}.`)
      continue
    }
    const techMap = IS_STATIONARY_TECH_DEFAULTS[e.fuelCode]
    const tech = techMap ? Object.values(techMap)[0] : null
    const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tech?.ch4EfKgPerGj ?? 0
    const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tech?.n2oEfKgPerGj ?? 0

    const combCo2T = (energyGj * (co2Ef as number)) / 1000
    const ch4T = (energyGj * ch4Ef) / 1000
    const n2oT = (energyGj * n2oEf) / 1000

    // --- calcination side (process CO2 from carbonate decomposition)
    const calcFrac = isPresent(e.calcinationFraction) ? (e.calcinationFraction as number) : 1.0
    if (calcFrac < 0 || calcFrac > 1) {
      ctx.error('fraction_out_of_range', `Lime kiln "${e.label}" calcinationFraction must be in [0,1].`)
      continue
    }
    const limestone = isPresent(e.limestoneChargedTonnes) ? (e.limestoneChargedTonnes as number) : 0
    const dolomite = isPresent(e.dolomiteChargedTonnes) ? (e.dolomiteChargedTonnes as number) : 0
    if (limestone < 0 || dolomite < 0) {
      ctx.error('negative_input_value', `Lime kiln "${e.label}" carbonate inputs cannot be negative.`)
      continue
    }
    const calcCo2T = (limestone * CARBONATE_CALCINATION_FACTORS.CACO3 + dolomite * CARBONATE_CALCINATION_FACTORS.DOLOMITE) * calcFrac

    const co2T = combCo2T + calcCo2T
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)
    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Lime kiln - ${e.label}`,
      category: 'LIME_KILN',
      method: `${e.kilnType} firing ${e.fuelCode}; calcination_fraction=${calcFrac}`,
      formula: 'CO2_combustion = E × EFco2 / 1000; CO2_calcination = (CaCO3 × 0.440 + Dolomite × 0.477) × calcFrac; CH4/N2O = E × EF_tech / 1000',
      inputs: { fuelQuantity: qty, unit: e.fuelQuantityUnit, energyGj: round(energyGj, 3), combCo2T: round(combCo2T, 4), calcCo2T: round(calcCo2T, 4), limestone, dolomite, calcFrac },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
