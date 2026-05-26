/**
 * Oil & Gas stationary and mobile combustion. Reuses the shared, fully-tested
 * `calculateFuel` (fuel -> energy -> CO2, biomass split, override handling)
 * against the O&G fuel library, then applies the O&G horizon-aware GWP set to
 * the raw CH4/N2O masses (in O&G these are primary Scope 1 gases, not a memo).
 *
 * Owned/controlled mobile equipment is Scope 1; third-party (contracted) is
 * excluded from gross Scope 1 and reported as supporting Scope 3.
 */

import { calculateFuel } from '../combustion'
import type { EngineContext } from '../context'
import type { FuelEntry, MobileEntry } from '../types'
import { isMissing, round } from '../util'
import { OILGAS_FUEL_DEFAULTS } from './constants'
import { ch4ToCO2e, n2oToCO2e, type OilGasGwp } from './gwp'
import { addGas, emptyGas } from './helpers'
import type { GasAmounts, OilGasMethodSelections } from './types'

/** Fold one fuel outcome (fossil CO2 + biomass memo + CH4/N2O masses) into a
 * gas breakdown, applying the chosen GWP set. */
function addFuelOutcome(
  target: GasAmounts,
  outcome: { fossilCO2Tonnes: number; biomassCO2Tonnes: number; ch4Kg: number; n2oKg: number; category: FuelEntry['category'] },
  gwp: OilGasGwp,
): void {
  const ch4T = outcome.ch4Kg / 1000
  const n2oT = outcome.n2oKg / 1000
  const biogenicCh4 = outcome.category === 'BIOMASS'
  target.co2Tonnes += outcome.fossilCO2Tonnes
  target.ch4Tonnes += ch4T
  target.n2oTonnes += n2oT
  target.biogenicCO2Tonnes += outcome.biomassCO2Tonnes
  target.co2eTonnes +=
    outcome.fossilCO2Tonnes + ch4ToCO2e(ch4T, gwp, biogenicCh4) + n2oToCO2e(n2oT, gwp)
}

export function calculateStationaryCombustion(
  ctx: EngineContext,
  method: OilGasMethodSelections['stationaryCombustionMethod'],
  fuels: FuelEntry[],
  gwp: OilGasGwp,
): GasAmounts {
  const g = emptyGas()
  for (const entry of fuels) {
    const o = calculateFuel(ctx, method, entry, 'STATIONARY_COMBUSTION', OILGAS_FUEL_DEFAULTS)
    addFuelOutcome(g, o, gwp)
  }
  return g
}

function deriveMobileFuelQuantity(
  ctx: EngineContext,
  method: OilGasMethodSelections['mobileCombustionMethod'],
  entry: MobileEntry,
): number | null {
  const negChecks: Array<[number | null | undefined, string, string]> = [
    [entry.quantity, 'quantity', 'fuel quantity'],
    [entry.operatingHours, 'operatingHours', 'operating hours'],
    [entry.consumptionRatePerHour, 'consumptionRatePerHour', 'consumption rate'],
    [entry.distanceKm, 'distanceKm', 'distance'],
    [entry.fuelPerKm, 'fuelPerKm', 'fuel per km'],
  ]
  for (const [v, field, label] of negChecks) {
    if (typeof v === 'number' && v < 0) {
      ctx.error('negative_input_value', `Mobile ${label} cannot be negative (${v}).`, `mobileCombustion.${entry.id}.${field}`)
      return null
    }
  }
  if (method === 'EQUIPMENT_HOURS_BASED') {
    if (isMissing(entry.operatingHours) || isMissing(entry.consumptionRatePerHour)) {
      ctx.error('missing_fuel_quantity', `Mobile "${entry.label}" hours-based method needs operating hours and consumption rate.`, `mobileCombustion.${entry.id}`)
      return null
    }
    return entry.operatingHours * entry.consumptionRatePerHour
  }
  if (method === 'DISTANCE_BASED') {
    if (isMissing(entry.distanceKm) || isMissing(entry.fuelPerKm)) {
      ctx.error('missing_fuel_quantity', `Mobile "${entry.label}" distance-based method needs distance and fuel/km.`, `mobileCombustion.${entry.id}`)
      return null
    }
    return entry.distanceKm * entry.fuelPerKm
  }
  if (isMissing(entry.quantity)) {
    ctx.error('missing_fuel_quantity', `Mobile "${entry.label}" has no fuel quantity.`, `mobileCombustion.${entry.id}.quantity`)
    return null
  }
  return entry.quantity
}

export interface MobileBreakdown {
  owned: GasAmounts
  thirdParty: GasAmounts
}

export function calculateMobileCombustion(
  ctx: EngineContext,
  methods: OilGasMethodSelections,
  entries: MobileEntry[],
  gwp: OilGasGwp,
): MobileBreakdown {
  const owned = emptyGas()
  const thirdParty = emptyGas()

  for (const entry of entries) {
    const qty = deriveMobileFuelQuantity(ctx, methods.mobileCombustionMethod, entry)
    if (qty === null) continue

    const fuelEntry: FuelEntry = {
      id: `mobile_${entry.id}`,
      label: `Mobile: ${entry.label}`,
      fuelCode: entry.fuelCode,
      category: 'CONVENTIONAL_FOSSIL',
      quantity: qty,
      quantityUnit: entry.quantityUnit,
      lhvGjPerUnit: entry.lhvGjPerUnit,
      co2EfKgPerGj: entry.co2EfKgPerGj,
      ch4EfKgPerGj: entry.ch4EfKgPerGj,
      n2oEfKgPerGj: entry.n2oEfKgPerGj,
      evidenceReference: entry.evidenceReference,
      overrideReason: entry.overrideReason,
    }
    const o = calculateFuel(ctx, 'ENERGY_BASED', fuelEntry, 'MOBILE_COMBUSTION', OILGAS_FUEL_DEFAULTS)
    const bucket = emptyGas()
    addFuelOutcome(bucket, o, gwp)

    if (entry.ownership === 'OWNED_CONTROLLED') {
      addGas(owned, bucket)
    } else {
      addGas(thirdParty, bucket)
      ctx.warn(
        'third_party_mobile_excluded',
        `Mobile "${entry.label}" is third-party; excluded from gross Scope 1 and bucketed into supporting Scope 3.`,
        `mobileCombustion.${entry.id}.ownership`,
      )
      ctx.addTrace({
        step: `Third-party mobile (excluded from Scope 1) - ${entry.label}`,
        category: 'SUPPORTING_SCOPE3',
        method: methods.mobileCombustionMethod,
        formula: 'third-party transport excluded from gross Scope 1',
        inputs: { derivedFuelQuantity: round(qty, 4) },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(bucket.co2eTonnes, 4),
      })
    }
  }

  return { owned, thirdParty }
}
