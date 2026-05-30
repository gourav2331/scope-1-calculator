/**
 * Stationary + mobile combustion for Iron & Steel.
 *
 * Stationary uses IPCC 2006 Vol 2 Ch 2 with:
 *   ENERGY_BASED:        E_CO2 = activity × NCV × EF_CO2 / 1000
 *   CARBON_CONTENT_BASED: E_CO2 = activity_t × C_frac × oxidation × 44/12
 *   DIRECT_MEASUREMENT:  E_CO2 = directCo2Tonnes (CEMS Tier 4)
 *
 * Process gases (COG / BFG / BOFG) are treated as first-class fuels in the
 * defaults table with their own NCV + EF. India NATCOM CEFs override IPCC
 * defaults when `useIndiaNatcom = true` on the row.
 *
 * Biomass routes CO2 to memo (carbon-neutral convention); CH4 and N2O from
 * biomass remain in Scope 1.
 *
 * Mobile follows the same energy-based pattern with vehicle-class defaults.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import {
  INDIA_NATCOM_OVERRIDES,
  IRONSTEEL_BIOMASS_DEFAULTS,
  IRONSTEEL_FUEL_DEFAULTS,
  IRONSTEEL_MOBILE_DEFAULTS,
  IS_STATIONARY_TECH_DEFAULTS,
  type IsFuelDefault,
  type IsTechFactor,
} from './constants'
import { ch4ToCO2e, n2oToCO2e, type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FuelEntry, GasAmounts, IsStationaryMethod, MobileEntry } from './types'

const C_TO_CO2 = 44 / 12

function fuelDefault(code: string): IsFuelDefault | null {
  return IRONSTEEL_FUEL_DEFAULTS[code] ?? IRONSTEEL_BIOMASS_DEFAULTS[code] ?? null
}

function techFactor(fuelCode: string, tech?: string): IsTechFactor | null {
  const map = IS_STATIONARY_TECH_DEFAULTS[fuelCode]
  if (!map) return null
  if (tech && map[tech]) return map[tech]
  return Object.values(map)[0] ?? null
}

export function calculateStationaryCombustion(
  ctx: EngineContext,
  method: IsStationaryMethod,
  entries: FuelEntry[],
  gwp: IronSteelGwp,
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
    const isBiomass = (e.origin ?? fdef?.origin) === 'BIOMASS'

    let co2T = 0
    let ch4T = 0
    let n2oT = 0
    let biogenicCO2T = 0
    let energyGj = 0
    let methodNote = method as string

    const ncv = isPresent(e.ncvGjPerUnit) ? (e.ncvGjPerUnit as number) : fdef?.ncvGjPerUnit ?? null
    if (method !== 'DIRECT_MEASUREMENT' && isMissing(ncv)) {
      ctx.error('missing_ncv', `Stationary "${e.label}" no NCV for fuel ${e.fuelCode}.`, `stationaryCombustion.${e.id}.ncvGjPerUnit`)
      continue
    }
    if (method !== 'DIRECT_MEASUREMENT') energyGj = qty * (ncv as number)

    if (method === 'DIRECT_MEASUREMENT') {
      if (isMissing(e.directCo2Tonnes)) {
        ctx.error('missing_direct_co2', `Stationary "${e.label}" direct method needs directCo2Tonnes.`)
        continue
      }
      if ((e.directCo2Tonnes as number) < 0) {
        ctx.error('negative_input_value', `Stationary "${e.label}" directCo2Tonnes cannot be negative.`)
        continue
      }
      const co2 = e.directCo2Tonnes as number
      if (isBiomass) biogenicCO2T = co2
      else co2T = co2
      methodNote = 'DIRECT_MEASUREMENT (CEMS)'
      ctx.warn('direct_measurement_no_non_co2', `Stationary "${e.label}" direct CO2 mode: CH4/N2O not computed (no fuel energy basis).`)
    } else if (method === 'CARBON_CONTENT_BASED') {
      if (isMissing(e.carbonContentFraction)) {
        ctx.error('missing_carbon_content', `Stationary "${e.label}" needs carbonContentFraction.`)
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
      const co2 = qty * cFrac * ox * C_TO_CO2
      if (isBiomass) biogenicCO2T = co2
      else co2T = co2
      methodNote = 'CARBON_CONTENT (Tier 3/4 fuel carbon)'
      const tf = techFactor(e.fuelCode, e.technology)
      if (tf) {
        ch4T = (energyGj * (isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tf.ch4EfKgPerGj)) / 1000
        n2oT = (energyGj * (isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tf.n2oEfKgPerGj)) / 1000
      }
    } else {
      // ENERGY_BASED — default
      let co2Ef: number | null = isPresent(e.co2EfKgPerGj) ? (e.co2EfKgPerGj as number) : fdef?.co2EfKgPerGj ?? null
      if (e.useIndiaNatcom && INDIA_NATCOM_OVERRIDES[e.fuelCode]) {
        co2Ef = INDIA_NATCOM_OVERRIDES[e.fuelCode].co2EfKgPerGj
        ctx.warn('india_natcom_ef_used', `Stationary "${e.label}" used India NATCOM CEF for ${e.fuelCode} (${co2Ef} kg/GJ).`)
      }
      if (isMissing(co2Ef)) {
        ctx.error('missing_co2_ef', `Stationary "${e.label}" no CO2 EF for fuel ${e.fuelCode}.`)
        continue
      }
      const co2 = (energyGj * (co2Ef as number)) / 1000
      if (isBiomass) biogenicCO2T = co2
      else co2T = co2

      const tf = techFactor(e.fuelCode, e.technology)
      const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tf?.ch4EfKgPerGj ?? 0
      const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tf?.n2oEfKgPerGj ?? 0
      ch4T = (energyGj * ch4Ef) / 1000
      n2oT = (energyGj * n2oEf) / 1000
      if (!tf && (isMissing(e.ch4EfKgPerGj) || isMissing(e.n2oEfKgPerGj))) {
        ctx.warn('default_non_co2_factors_missing', `Stationary "${e.label}" no CH4/N2O tech factors for ${e.fuelCode}/${e.technology ?? '(none)'}; CH4=N2O=0.`)
      }
    }

    // Biogenic CO2 (memo) is excluded from gross; CH4/N2O ARE counted (incl. biogenic)
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp, isBiomass) + n2oToCO2e(n2oT, gwp)
    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT
    total.biogenicCO2Tonnes += biogenicCO2T

    ctx.addTrace({
      step: `Stationary - ${e.label}`,
      category: isBiomass ? 'STATIONARY_BIOMASS' : 'STATIONARY_FOSSIL',
      method: methodNote,
      formula: method === 'CARBON_CONTENT_BASED'
        ? 'CO2 = qty × C_frac × ox × 44/12; CH4/N2O = energy × EF_tech / 1000'
        : method === 'DIRECT_MEASUREMENT'
          ? 'CO2 = directCo2Tonnes (CEMS)'
          : 'CO2 = qty × NCV × EF_CO2 / 1000; CH4/N2O = energy × EF_tech / 1000',
      inputs: { quantity: qty, unit: e.quantityUnit, energyGj: round(energyGj, 3), fuelCode: e.fuelCode, technology: e.technology ?? null, biogenicCO2Tonnes: round(biogenicCO2T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}

/* -------------------------------- mobile --------------------------------- */

export interface MobileBreakdown {
  owned: GasAmounts
  thirdParty: GasAmounts
}

export function calculateMobile(
  ctx: EngineContext,
  entries: MobileEntry[],
  gwp: IronSteelGwp,
): MobileBreakdown {
  const owned = emptyGas()
  const thirdParty = emptyGas()
  if (entries.length === 0) return { owned, thirdParty }

  for (const e of entries) {
    if (isMissing(e.quantity)) {
      ctx.error('missing_mobile_quantity', `Mobile "${e.label}" has no quantity.`)
      continue
    }
    if ((e.quantity as number) < 0) {
      ctx.error('negative_input_value', `Mobile "${e.label}" quantity cannot be negative.`)
      continue
    }
    const qty = e.quantity as number
    const vd = IRONSTEEL_MOBILE_DEFAULTS[e.vehicleCode]
    if (!vd) {
      ctx.error('unknown_vehicle_code', `Mobile "${e.label}" unknown vehicleCode ${e.vehicleCode}.`)
      continue
    }
    const fdef = IRONSTEEL_FUEL_DEFAULTS[vd.fuelCode]
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
      method: vd.label,
      formula: 'E = qty × NCV × EF / 1000',
      inputs: { quantity: qty, unit: e.quantityUnit, energyGj: round(energyGj, 3), ownership: e.ownership },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return { owned, thirdParty }
}
