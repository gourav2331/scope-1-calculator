/**
 * Refrigerant emissions (V1 §8.6). HFCs/HCFCs in LNG cold-boxes, process
 * chillers and HVAC leak slowly from owned equipment — genuine Scope 1, but not
 * combustion. Two MVP tiers:
 *   Tier 1  charge capacity × default annual leak rate
 *   Tier 2  mass balance: purchases − disposals − Δinventory
 *
 * HFC GWPs are taken from the shared gas library on the 100-year horizon
 * regardless of the inventory's CH4 horizon choice (standard practice).
 */

import { GAS_DEFAULTS } from '../constants'
import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { sharedGwpSetFor, type OilGasGwpSet } from './constants'
import { emptyGas } from './helpers'
import type { GasAmounts, RefrigerantEntry } from './types'

export function calculateRefrigerants(
  ctx: EngineContext,
  entries: RefrigerantEntry[],
  gwpSet: OilGasGwpSet,
): GasAmounts {
  const total = emptyGas()
  const sharedSet = sharedGwpSetFor(gwpSet)

  for (const entry of entries) {
    // --- leaked mass by tier ---------------------------------------------
    let leakedKg: number
    if (entry.tier === 'TIER1_CAPACITY') {
      if (isMissing(entry.chargeCapacityKg) || isMissing(entry.leakRatePercentYr)) {
        ctx.error('missing_refrigerant_tier1_inputs', `Refrigerant "${entry.label}" (Tier 1) needs charge capacity and annual leak rate.`, `refrigerants.${entry.id}`)
        continue
      }
      if ((entry.chargeCapacityKg as number) < 0 || (entry.leakRatePercentYr as number) < 0) {
        ctx.error('negative_input_value', `Refrigerant "${entry.label}" capacity/leak rate cannot be negative.`, `refrigerants.${entry.id}`)
        continue
      }
      leakedKg = (entry.chargeCapacityKg as number) * ((entry.leakRatePercentYr as number) / 100)
    } else {
      // TIER2_MASS_BALANCE: purchases − disposals − Δinventory
      if (isMissing(entry.purchasesKg)) {
        ctx.error('missing_refrigerant_tier2_inputs', `Refrigerant "${entry.label}" (Tier 2) needs purchases (kg).`, `refrigerants.${entry.id}.purchasesKg`)
        continue
      }
      leakedKg = (entry.purchasesKg as number) - orDefault(entry.disposalsKg, 0) - orDefault(entry.inventoryChangeKg, 0)
      if (leakedKg < 0) {
        ctx.warn('refrigerant_mass_balance_negative', `Refrigerant "${entry.label}" mass balance is negative (${round(leakedKg, 2)} kg). Confirm disposals/inventory entries; treated as 0.`, `refrigerants.${entry.id}`)
        leakedKg = 0
      }
    }

    // --- GWP --------------------------------------------------------------
    const gas = GAS_DEFAULTS[entry.gasCode]
    const overridden = isPresent(entry.gwpOverride)
    let gwp: number
    if (overridden) {
      if ((entry.gwpOverride as number) <= 0) {
        ctx.error('gwp_override_invalid', `Refrigerant "${entry.label}" GWP override must be > 0.`, `refrigerants.${entry.id}.gwpOverride`)
        continue
      }
      gwp = entry.gwpOverride as number
    } else if (gas) {
      gwp = sharedSet === 'AR6' ? gas.gwpAR6 : gas.gwpAR5
    } else {
      ctx.error('unknown_refrigerant_gas', `Refrigerant "${entry.label}" uses unknown gas "${entry.gasCode}" and no GWP override.`, `refrigerants.${entry.id}.gasCode`)
      continue
    }
    if (overridden && !((entry.overrideReason ?? '').trim())) {
      ctx.warn('override_missing_reason', `Refrigerant "${entry.label}" has a GWP override but no reason recorded.`, `refrigerants.${entry.id}.overrideReason`)
    }

    const co2eT = (leakedKg * gwp) / 1000
    total.co2eTonnes += co2eT

    ctx.resolver.record({
      factorCode: `GWP_${entry.gasCode}`,
      factorName: `${gas?.name ?? entry.gasCode} GWP (100-yr)`,
      value: gwp,
      unit: 'kgCO2e/kg',
      source: overridden ? 'User override' : gas?.source ?? 'Gas library',
      sourceVersion: overridden ? 'user' : gas?.sourceVersion ?? sharedSet,
      factorYear: null,
      priorityRank: overridden ? 6 : 5,
      isDefault: !overridden,
      overridden,
      overrideReason: overridden ? entry.overrideReason : undefined,
    })
    ctx.addTrace({
      step: `Refrigerant - ${entry.label}`,
      category: 'REFRIGERANTS',
      method: entry.tier,
      formula: entry.tier === 'TIER1_CAPACITY' ? 'capacity × leakRate% × GWP / 1000' : '(purchases − disposals − Δinventory) × GWP / 1000',
      inputs: { gas: entry.gasCode, leakedKg: round(leakedKg, 4), gwp },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
