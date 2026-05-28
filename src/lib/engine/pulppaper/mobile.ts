/**
 * Mobile / on-site combustion — Section 7.5 of Research Brief.
 *
 *   CO2 = volume × NCV × EF_CO2 / 1000
 *   CH4/N2O = volume × NCV × EF_vehicle / 1000
 *
 * Vehicle types (Section 9.4): diesel off-road (CH4 0.004, N2O 0.030 kg/GJ — N2O is the
 * dominant non-CO2 GHG for diesel off-road), forestry diesel, gasoline 4-stroke / 2-stroke,
 * LPG mobile, NG mobile.
 *
 * Ownership: OWNED_CONTROLLED → gross Scope 1. THIRD_PARTY → excluded (Scope 3).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { PULPPAPER_FUEL_DEFAULTS, PULPPAPER_MOBILE_DEFAULTS } from './constants'
import { ch4ToCO2e, n2oToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, MobileEntry } from './types'

export interface MobileBreakdown {
  owned: GasAmounts
  thirdParty: GasAmounts
}

export function calculateMobile(
  ctx: EngineContext,
  entries: MobileEntry[],
  gwp: PulpPaperGwp,
): MobileBreakdown {
  const owned = emptyGas()
  const thirdParty = emptyGas()
  if (entries.length === 0) return { owned, thirdParty }

  for (const e of entries) {
    if (isMissing(e.quantity)) {
      ctx.error('missing_mobile_quantity', `Mobile "${e.label}" has no quantity.`, `mobile.${e.id}.quantity`)
      continue
    }
    if ((e.quantity as number) < 0) {
      ctx.error('negative_input_value', `Mobile "${e.label}" quantity cannot be negative.`)
      continue
    }
    const qty = e.quantity as number
    const vd = PULPPAPER_MOBILE_DEFAULTS[e.vehicleCode]
    if (!vd) {
      ctx.error('unknown_vehicle_code', `Mobile "${e.label}" unknown vehicleCode ${e.vehicleCode}.`, `mobile.${e.id}.vehicleCode`)
      continue
    }
    const fdef = PULPPAPER_FUEL_DEFAULTS[vd.fuelCode]
    const ncv = isPresent(e.ncvGjPerUnit) ? (e.ncvGjPerUnit as number) : fdef?.ncvGjPerUnit ?? null
    if (isMissing(ncv)) {
      ctx.error('missing_ncv', `Mobile "${e.label}" no NCV for fuel ${vd.fuelCode}.`)
      continue
    }
    const energyGj = qty * (ncv as number)
    const co2Ef = isPresent(e.co2EfKgPerGj) ? (e.co2EfKgPerGj as number) : vd.co2EfKgPerGj
    const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : vd.ch4EfKgPerGj
    const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : vd.n2oEfKgPerGj

    const co2T = (energyGj * co2Ef) / 1000
    const ch4T = (energyGj * ch4Ef) / 1000
    const n2oT = (energyGj * n2oEf) / 1000
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)

    const bucket = e.ownership === 'OWNED_CONTROLLED' ? owned : thirdParty
    bucket.co2Tonnes += co2T
    bucket.ch4Tonnes += ch4T
    bucket.n2oTonnes += n2oT
    bucket.co2eTonnes += co2eT

    ctx.addTrace({
      step: e.ownership === 'OWNED_CONTROLLED'
        ? `Mobile (owned) - ${e.label}`
        : `Mobile (third-party, supporting Scope 3, EXCLUDED) - ${e.label}`,
      category: e.ownership === 'OWNED_CONTROLLED' ? 'MOBILE_OWNED' : 'SUPPORTING_SCOPE3_MOBILE',
      method: `${vd.label}`,
      formula: 'E = qty × NCV × EF / 1000 (CO2/CH4/N2O)',
      inputs: { quantity: qty, unit: e.quantityUnit, energyGj: round(energyGj, 3), ownership: e.ownership },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return { owned, thirdParty }
}
