/**
 * Fugitive emissions — refrigerant leakage and SF6 from switchgear. These are
 * genuine Scope 1 direct emissions of high-GWP gases (HFCs, SF6), reported as
 * CO2e via the selected IPCC GWP set. Gas mass leaked x GWP / 1000 = tCO2e.
 */

import { GAS_DEFAULTS } from './constants'
import type { EngineContext } from './context'
import type { FugitiveEntry } from './types'
import { isMissing, isPresent, round } from './util'

export function calculateFugitive(ctx: EngineContext, entries: FugitiveEntry[]): number {
  let totalCO2e = 0

  for (const entry of entries) {
    if (isMissing(entry.leakedKg)) {
      ctx.error(
        'missing_fuel_quantity',
        `Fugitive entry "${entry.label}" has no leaked quantity.`,
        `fugitive.${entry.id}.leakedKg`,
      )
      continue
    }

    const gas = GAS_DEFAULTS[entry.gasCode]
    const overridden = isPresent(entry.gwpOverride)
    let gwp: number
    if (overridden) {
      gwp = entry.gwpOverride as number
    } else if (gas) {
      gwp = ctx.gwpSet === 'AR6' ? gas.gwpAR6 : gas.gwpAR5
    } else {
      ctx.error(
        'missing_fuel_emission_factor',
        `Fugitive entry "${entry.label}" uses unknown gas "${entry.gasCode}" and no GWP override.`,
        `fugitive.${entry.id}.gasCode`,
      )
      continue
    }

    const co2e = (entry.leakedKg * gwp) / 1000
    totalCO2e += co2e

    ctx.resolver.record({
      factorCode: `GWP_${entry.gasCode}`,
      factorName: `${gas?.name ?? entry.gasCode} GWP (${ctx.gwpSet})`,
      value: gwp,
      unit: 'kgCO2e/kg',
      source: overridden ? 'User override' : gas?.source ?? 'Gas library',
      sourceVersion: overridden ? 'user' : gas?.sourceVersion ?? ctx.gwpSet,
      factorYear: null,
      priorityRank: overridden ? 6 : 5,
      isDefault: !overridden,
      overridden,
    })
    ctx.addTrace({
      step: `Fugitive - ${entry.label}`,
      category: 'FUGITIVE',
      method: 'GAS_MASS_X_GWP',
      formula: 'leakedKg x GWP / 1000',
      inputs: { leakedKg: entry.leakedKg, gwp, gwpSet: ctx.gwpSet, gas: entry.gasCode },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }

  return totalCO2e
}
