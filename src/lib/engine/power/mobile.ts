/**
 * Mobile combustion for power plants — on-site haul fleet, locomotives,
 * captive mine vehicles, forklifts. Splits owned vs third-party so the
 * boundary is correct (third-party goes to supporting Scope 3).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { POWER_FUEL_DEFAULTS, POWER_MOBILE_DEFAULTS } from './constants'
import { ch4ToCO2e, n2oToCO2e, type PowerGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, MobileEntry } from './types'

export interface MobileTotals {
  ownedScope1: GasAmounts
  thirdPartyScope3CO2eTonnes: number
}

export function calculateMobile(
  ctx: EngineContext,
  entries: MobileEntry[],
  gwp: PowerGwp,
): MobileTotals {
  const owned = emptyGas()
  let thirdPartyCO2e = 0

  for (const e of entries) {
    if (isMissing(e.quantity)) {
      ctx.error('missing_mobile_quantity', `Mobile "${e.label}" has no quantity.`)
      continue
    }
    if ((e.quantity as number) < 0) {
      ctx.error('negative_input_value', `Mobile "${e.label}" quantity cannot be negative.`)
      continue
    }

    const def = POWER_MOBILE_DEFAULTS[e.vehicleCode]
    const fuelDef = def ? POWER_FUEL_DEFAULTS[def.fuelCode] : undefined
    const ncv = isPresent(e.ncvGjPerUnit)
      ? (e.ncvGjPerUnit as number)
      : fuelDef?.ncvGjPerUnit ?? null
    if (isMissing(ncv)) {
      ctx.error('missing_ncv', `Mobile "${e.label}" no NCV — unknown vehicle code "${e.vehicleCode}".`)
      continue
    }

    const energyGj = (e.quantity as number) * (ncv as number)
    const co2Ef = isPresent(e.co2EfKgPerGj)
      ? (e.co2EfKgPerGj as number)
      : def?.co2EfKgPerGj ?? fuelDef?.co2EfKgPerGj ?? 0
    const ch4Ef = def?.ch4EfKgPerGj ?? 0
    const n2oEf = def?.n2oEfKgPerGj ?? 0

    const co2T = (energyGj * co2Ef) / 1000
    const ch4T = (energyGj * ch4Ef) / 1000
    const n2oT = (energyGj * n2oEf) / 1000
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp, false) + n2oToCO2e(n2oT, gwp)

    if (e.ownership === 'THIRD_PARTY') {
      thirdPartyCO2e += co2eT
      ctx.addTrace({
        step: `Mobile (3rd-party) - ${e.label}`,
        category: 'MOBILE',
        method: 'FUEL_BASED',
        formula: 'qty × NCV × EF / 1000; routed to supporting Scope 3',
        inputs: { qty: e.quantity, unit: e.quantityUnit, energyGj: round(energyGj, 3) },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(co2eT, 4),
      })
      continue
    }

    owned.co2Tonnes += co2T
    owned.ch4Tonnes += ch4T
    owned.n2oTonnes += n2oT
    owned.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Mobile (owned) - ${e.label}`,
      category: 'MOBILE',
      method: 'FUEL_BASED',
      formula: 'qty × NCV × CO2_EF / 1000 + CH4·GWP + N2O·GWP',
      inputs: {
        qty: e.quantity, unit: e.quantityUnit, energyGj: round(energyGj, 3),
        co2Tonnes: round(co2T, 4), ch4Tonnes: round(ch4T, 5), n2oTonnes: round(n2oT, 5),
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return { ownedScope1: owned, thirdPartyScope3CO2eTonnes: thirdPartyCO2e }
}
