/**
 * Fugitive emissions — three sub-categories:
 *
 *   1. HFC refrigerants: chillers / HVAC / cold-rolling oil chillers (mass
 *      balance preferred; screening fallback).
 *   2. SF6: from high-voltage switchgear at owned substations. Leak rates
 *      per IPCC 2006 Vol 3 Ch 8 / EPA.
 *   3. Other (CH4): coal stockpile, coke-oven seals, NG pipeline leaks
 *      onsite. Activity × EF, or direct mass.
 *
 * Returns three GasAmounts buckets. All use the chosen GWP set for non-CO2
 * conversion; HFC GWPs always use the 100-yr AR6 basis (industry convention),
 * SF6 GWP horizon-aware.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { FUGITIVE_CH4_PLACEHOLDER, HFC_GWP_AR6 } from './constants'
import { ch4ToCO2e, sf6ToCO2e, type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, OtherFugitiveEntry, RefrigerantEntry, Sf6Entry } from './types'

/* ---------------------------- HFC refrigerants --------------------------- */

function hfcGwpFor(ctx: EngineContext, entry: RefrigerantEntry): number {
  if (isPresent(entry.gwpOverride)) return entry.gwpOverride as number
  const gwp = HFC_GWP_AR6[entry.gasCode]
  if (gwp == null) {
    ctx.warn('refrigerant_unknown_gwp', `Refrigerant "${entry.label}" gas ${entry.gasCode} not in HFC GWP table; using 0.`, `fugitiveHFC.${entry.id}.gasCode`)
    return 0
  }
  return gwp
}

export function calculateFugitiveHFC(ctx: EngineContext, entries: RefrigerantEntry[]): GasAmounts {
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
      for (const [k, v] of [
        ['inventoryStartKg', start], ['inventoryEndKg', end], ['purchasedKg', purchased],
        ['soldKg', sold], ['recoveredForRecycleKg', recovered],
      ] as Array<[string, number]>) {
        if (v < 0) {
          ctx.error('negative_input_value', `Refrigerant "${e.label}" ${k} cannot be negative.`, `fugitiveHFC.${e.id}.${k}`)
        }
      }
      leakedKg = start + purchased - sold - end - recovered
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

    const gwp = hfcGwpFor(ctx, e)
    const co2eT = (leakedKg * gwp) / 1000
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Refrigerant HFC - ${e.label}`,
      category: 'FUGITIVE_HFC',
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

/* ---------------------------- SF6 switchgear ---------------------------- */

export function calculateFugitiveSF6(ctx: EngineContext, entries: Sf6Entry[], gwp: IronSteelGwp): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.nameplateInventoryKg)) {
      ctx.error('missing_sf6_inventory', `SF6 "${e.label}" needs nameplateInventoryKg.`, `fugitiveSF6.${e.id}.nameplateInventoryKg`)
      continue
    }
    if ((e.nameplateInventoryKg as number) < 0) {
      ctx.error('negative_input_value', `SF6 "${e.label}" nameplate inventory cannot be negative.`)
      continue
    }

    let leakedKg = 0
    if (isPresent(e.leakedMassKg)) {
      if ((e.leakedMassKg as number) < 0) {
        ctx.error('negative_input_value', `SF6 "${e.label}" leakedMassKg cannot be negative.`)
        continue
      }
      leakedKg = e.leakedMassKg as number
    } else {
      const rate = isPresent(e.annualLeakRate) ? (e.annualLeakRate as number) : 0.005 // default sealed-pressure ≤0.5%
      if (rate < 0 || rate > 1) {
        ctx.error('fraction_out_of_range', `SF6 "${e.label}" annualLeakRate must be in [0,1].`)
        continue
      }
      leakedKg = (e.nameplateInventoryKg as number) * rate
      if (isMissing(e.annualLeakRate)) ctx.warn('sf6_default_leak_rate_used', `SF6 "${e.label}" used default leak rate 0.5%/yr (sealed-pressure switchgear).`)
    }

    const gwpVal = isPresent(e.gwpOverride) ? (e.gwpOverride as number) : gwp.SF6
    const co2eT = sf6ToCO2e(leakedKg / 1000, { ...gwp, SF6: gwpVal })
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `SF6 - ${e.label}`,
      category: 'FUGITIVE_SF6',
      method: isPresent(e.leakedMassKg) ? 'DIRECT_MASS' : 'NAMEPLATE_X_RATE',
      formula: 'CO2e = leakedKg × GWP_SF6 / 1000',
      inputs: { nameplateInventoryKg: e.nameplateInventoryKg as number, leakedKg: round(leakedKg, 4), gwp: gwpVal },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}

/* --------------------- Other CH4 fugitives (coal, coke, NG) -------------- */

export function calculateFugitiveOther(
  ctx: EngineContext,
  entries: OtherFugitiveEntry[],
  gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    let ch4Kg = 0
    if (isPresent(e.ch4MassKg)) {
      if ((e.ch4MassKg as number) < 0) {
        ctx.error('negative_input_value', `Other fugitive "${e.label}" ch4MassKg cannot be negative.`)
        continue
      }
      ch4Kg = e.ch4MassKg as number
    } else if (isPresent(e.activityTonnes)) {
      if ((e.activityTonnes as number) < 0) {
        ctx.error('negative_input_value', `Other fugitive "${e.label}" activityTonnes cannot be negative.`)
        continue
      }
      const def = e.source === 'COKE_OVEN_SEAL'
        ? FUGITIVE_CH4_PLACEHOLDER.COKE_OVEN_SEAL_KG_CH4_PER_TONNE_COKE
        : FUGITIVE_CH4_PLACEHOLDER.COAL_STOCKPILE_KG_CH4_PER_TONNE_COAL
      const ef = isPresent(e.efKgCh4PerTonne) ? (e.efKgCh4PerTonne as number) : def
      if (ef < 0) {
        ctx.error('negative_input_value', `Other fugitive "${e.label}" efKgCh4PerTonne cannot be negative.`)
        continue
      }
      ch4Kg = (e.activityTonnes as number) * ef
      if (isMissing(e.efKgCh4PerTonne)) ctx.warn('fugitive_default_ef_used', `Other fugitive "${e.label}" used default CH4 EF ${ef} kg/t for source ${e.source}.`)
    } else {
      ctx.error('missing_fugitive_inputs', `Other fugitive "${e.label}" needs ch4MassKg OR activityTonnes (+ efKgCh4PerTonne).`)
      continue
    }

    const ch4T = ch4Kg / 1000
    const co2eT = ch4ToCO2e(ch4T, gwp) // fossil CH4 (coal, coke, NG pipelines are all fossil)
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Other fugitive - ${e.label}`,
      category: 'FUGITIVE_OTHER',
      method: isPresent(e.ch4MassKg) ? 'DIRECT_MASS' : 'ACTIVITY_X_EF',
      formula: 'CH4 t = (ch4MassKg | activityTonnes × EF) / 1000; CO2e = CH4 × GWP_CH4',
      inputs: { source: e.source, ch4Tonnes: round(ch4T, 6) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
