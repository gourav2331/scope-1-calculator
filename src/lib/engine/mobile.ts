/**
 * Mobile combustion. Owned/controlled equipment is Scope 1; third-party
 * equipment is excluded from gross Scope 1 (supporting Scope 3) per the spec.
 * Three method options derive a fuel quantity, then reuse the stationary
 * fuel maths so the fallback behaviour is identical.
 */

import { calculateFuel } from './combustion'
import type { EngineContext } from './context'
import type { FuelEntry, MethodSelections, MobileEntry } from './types'
import { isMissing, round } from './util'

export interface MobileTotals {
  ownedControlledCO2Tonnes: number
  thirdPartyCO2Tonnes: number
  ch4N2oCO2eTonnes: number
}

function deriveFuelQuantity(
  ctx: EngineContext,
  method: MethodSelections['mobileCombustionMethod'],
  entry: MobileEntry,
): number | null {
  if (method === 'EQUIPMENT_HOURS_BASED') {
    if (isMissing(entry.operatingHours) || isMissing(entry.consumptionRatePerHour)) {
      ctx.error(
        'missing_fuel_quantity',
        `Mobile "${entry.label}" uses hours-based method but operating hours or consumption rate is missing.`,
        `mobile.${entry.id}`,
      )
      return null
    }
    return entry.operatingHours * entry.consumptionRatePerHour
  }
  if (method === 'DISTANCE_BASED') {
    if (isMissing(entry.distanceKm) || isMissing(entry.fuelPerKm)) {
      ctx.error(
        'missing_fuel_quantity',
        `Mobile "${entry.label}" uses distance-based method but distance or fuel/km is missing.`,
        `mobile.${entry.id}`,
      )
      return null
    }
    return entry.distanceKm * entry.fuelPerKm
  }
  // FUEL_BASED
  if (isMissing(entry.quantity)) {
    ctx.error('missing_fuel_quantity', `Mobile "${entry.label}" has no fuel quantity.`, `mobile.${entry.id}.quantity`)
    return null
  }
  return entry.quantity
}

export function calculateMobile(
  ctx: EngineContext,
  methods: MethodSelections,
  entries: MobileEntry[],
): MobileTotals {
  const totals: MobileTotals = {
    ownedControlledCO2Tonnes: 0,
    thirdPartyCO2Tonnes: 0,
    ch4N2oCO2eTonnes: 0,
  }

  for (const entry of entries) {
    const qty = deriveFuelQuantity(ctx, methods.mobileCombustionMethod, entry)
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
    }

    const o = calculateFuel(ctx, 'ENERGY_BASED', fuelEntry, 'MOBILE')
    if (entry.ownership === 'OWNED_CONTROLLED') {
      totals.ownedControlledCO2Tonnes += o.fossilCO2Tonnes
      totals.ch4N2oCO2eTonnes += o.ch4N2oCO2eTonnes
    } else {
      totals.thirdPartyCO2Tonnes += o.fossilCO2Tonnes
      ctx.warn(
        'internal_external_clinker_split_missing',
        `Mobile "${entry.label}" is third-party; excluded from gross Scope 1 (supporting Scope 3).`,
        `mobile.${entry.id}.ownership`,
      )
      ctx.addTrace({
        step: `Third-party mobile (excluded from Scope 1) - ${entry.label}`,
        category: 'SUPPORTING_SCOPE3',
        method: methods.mobileCombustionMethod,
        formula: 'third-party transport excluded from gross Scope 1',
        inputs: { derivedFuelQuantity: round(qty, 4) },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(o.fossilCO2Tonnes, 4),
      })
    }
  }

  return totals
}
