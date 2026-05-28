/**
 * Kraft mill lime kilns & calciners — Section 7.3 of Research Brief.
 *
 *   Fossil CO2 (Scope 1) = fuel_GJ × EF_CO2,fuel / 1000          (Eq 7.3)
 *   CH4 = fuel_GJ × 0.0027 kg/GJ / 1000   (NCASI; same for all fuels)
 *   N2O = 0 for rotary lime kilns (T > 980°C); 0.1–0.3 kg/GJ for fluidized calciners.
 *   Biogenic CO2 from CaCO3 calcination = MEMO only (recovery-cycle carbon, not fossil).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { LIME_KILN_FACTORS, PULPPAPER_FUEL_DEFAULTS } from './constants'
import { ch4ToCO2e, n2oToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, LimeKilnEntry } from './types'

/** Pick CH4/N2O EF for the kiln/calciner from fuel hint. */
function defaultKilnFactors(kilnType: 'LIME_KILN' | 'CALCINER', fuelCode: string) {
  if (kilnType === 'CALCINER') {
    if (fuelCode === 'natural_gas') return LIME_KILN_FACTORS.CALCINER_NG
    if (fuelCode === 'residual_oil' || fuelCode === 'diesel') return LIME_KILN_FACTORS.CALCINER_OIL
    if (fuelCode === 'biogas') return LIME_KILN_FACTORS.CALCINER_BIOGAS
    return LIME_KILN_FACTORS.CALCINER_NG
  }
  if (fuelCode === 'biogas') return LIME_KILN_FACTORS.LIME_KILN_BIOGAS
  if (fuelCode === 'residual_oil' || fuelCode === 'diesel') return LIME_KILN_FACTORS.LIME_KILN_OIL
  return LIME_KILN_FACTORS.LIME_KILN_NG
}

export function calculateLimeKilns(
  ctx: EngineContext,
  entries: LimeKilnEntry[],
  gwp: PulpPaperGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.fuelQuantity)) {
      ctx.error('missing_kiln_fuel_quantity', `Lime kiln "${e.label}" has no fuelQuantity.`, `limeKilns.${e.id}.fuelQuantity`)
      continue
    }
    if ((e.fuelQuantity as number) < 0) {
      ctx.error('negative_input_value', `Lime kiln "${e.label}" fuelQuantity cannot be negative.`)
      continue
    }
    const qty = e.fuelQuantity as number
    const fdef = PULPPAPER_FUEL_DEFAULTS[e.fuelCode]
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

    const kf = defaultKilnFactors(e.kilnType, e.fuelCode)
    const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : kf.ch4EfKgPerGj
    const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : kf.n2oEfKgPerGj

    const co2T = (energyGj * (co2Ef as number)) / 1000
    const ch4T = (energyGj * ch4Ef) / 1000
    const n2oT = (energyGj * n2oEf) / 1000
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)

    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT

    // Biogenic CO2 from CaCO3 calcination — MEMO only
    if (isPresent(e.biogenicCo2FromCalcinationTonnes)) {
      const bio = e.biogenicCo2FromCalcinationTonnes as number
      if (bio < 0) {
        ctx.error('negative_input_value', `Lime kiln "${e.label}" biogenicCo2FromCalcinationTonnes cannot be negative.`)
      } else {
        total.biogenicCO2Tonnes += bio
      }
    }

    ctx.addTrace({
      step: `Lime kiln - ${e.label}`,
      category: 'LIME_KILN',
      method: `${e.kilnType} firing ${e.fuelCode}`,
      formula: 'fossil CO2 = E×EFco2/1000; CH4 = E×0.0027/1000; N2O kiln=0 / calciner=0.1–0.3',
      inputs: { fuelQuantity: qty, unit: e.fuelQuantityUnit, energyGj: round(energyGj, 3), biogenicCalcinationCO2Tonnes: e.biogenicCo2FromCalcinationTonnes ?? null },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
