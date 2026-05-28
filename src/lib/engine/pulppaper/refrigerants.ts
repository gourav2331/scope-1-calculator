/**
 * Fugitive HFC refrigerant emissions — Section 7.8 of Research Brief.
 *
 *   MASS_BALANCE: E = inv_start + purchased − sold − inv_end − recovered_for_recycle  (kg)
 *   SCREENING:    E = charge × annual_leak_rate                                       (kg)
 *   CO2e        = E × GWP / 1000                                                       (t)
 *
 * Refrigerant Δinventory may legitimately be negative; but `purchased`, `sold`,
 * `inventory*`, `recovered`, and `charge` must each be ≥ 0.
 * GWPs always use AR6 100-yr (industry convention regardless of CH4 horizon).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { HFC_GWP_AR6 } from './constants'
import { emptyGas } from './helpers'
import type { GasAmounts, RefrigerantEntry } from './types'

function gwpFor(ctx: EngineContext, entry: RefrigerantEntry): number {
  if (isPresent(entry.gwpOverride)) return entry.gwpOverride as number
  const gwp = HFC_GWP_AR6[entry.gasCode]
  if (gwp == null) {
    ctx.warn('refrigerant_unknown_gwp', `Refrigerant "${entry.label}" gas ${entry.gasCode} not in HFC GWP table; using 0.`, `refrigerants.${entry.id}.gasCode`)
    return 0
  }
  return gwp
}

export function calculateRefrigerants(
  ctx: EngineContext,
  entries: RefrigerantEntry[],
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    let leakedKg = 0
    if (e.method === 'MASS_BALANCE') {
      const start = isPresent(e.inventoryStartKg) ? (e.inventoryStartKg as number) : 0
      const end = isPresent(e.inventoryEndKg) ? (e.inventoryEndKg as number) : 0
      const purchased = isPresent(e.purchasedKg) ? (e.purchasedKg as number) : 0
      const sold = isPresent(e.soldKg) ? (e.soldKg as number) : 0
      const recovered = isPresent(e.recoveredForRecycleKg) ? (e.recoveredForRecycleKg as number) : 0
      // Δinventory may be negative; the other inputs must be ≥ 0
      for (const [k, v] of [
        ['inventoryStartKg', start], ['inventoryEndKg', end], ['purchasedKg', purchased],
        ['soldKg', sold], ['recoveredForRecycleKg', recovered],
      ] as Array<[string, number]>) {
        if (v < 0) {
          ctx.error('negative_input_value', `Refrigerant "${e.label}" ${k} cannot be negative.`, `refrigerants.${e.id}.${k}`)
        }
      }
      leakedKg = start + purchased - sold - end - recovered
      // Negative result is physically OK only if reported as such (recycled in > used).
      // We don't error, but warn for visibility:
      if (leakedKg < 0) {
        ctx.warn('refrigerant_mass_balance_negative', `Refrigerant "${e.label}" mass balance is negative (${round(leakedKg, 3)} kg); treated as 0.`)
        leakedKg = 0
      }
    } else {
      if (isMissing(e.chargeKg) || isMissing(e.annualLeakRate)) {
        ctx.error('missing_refrigerant_screening_inputs', `Refrigerant "${e.label}" screening method needs chargeKg and annualLeakRate.`)
        continue
      }
      if ((e.chargeKg as number) < 0 || (e.annualLeakRate as number) < 0 || (e.annualLeakRate as number) > 1) {
        ctx.error('negative_input_value', `Refrigerant "${e.label}" chargeKg ≥ 0 and annualLeakRate in [0,1].`)
        continue
      }
      leakedKg = (e.chargeKg as number) * (e.annualLeakRate as number)
    }

    const gwp = gwpFor(ctx, e)
    const co2eT = (leakedKg * gwp) / 1000
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Refrigerant - ${e.label}`,
      category: 'REFRIGERANTS',
      method: e.method,
      formula: e.method === 'MASS_BALANCE'
        ? 'E = inv_start + purchased − sold − inv_end − recovered; CO2e = E × GWP / 1000'
        : 'E = charge × annual_leak_rate; CO2e = E × GWP / 1000',
      inputs: { gasCode: e.gasCode, leakedKg: round(leakedKg, 4), gwp },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
