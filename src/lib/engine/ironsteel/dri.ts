/**
 * Direct Reduction (DRI) — Natural-gas, Coal-based, Green-H2, or Syngas.
 *
 *   TIER1_DEFAULT (by route):
 *     NATURAL_GAS:     E_CO2 = DRI_t × 0.70 tCO2/t (IPCC 2006)
 *     COAL_BASED:      E_CO2 = DRI_t × 2.50 tCO2/t (rotary kiln, India typical)
 *     GREEN_HYDROGEN:  E_CO2 ≈ 0.05–0.30 tCO2/t (auxiliary NG only)
 *     SYNGAS:          treat as NG analog unless overridden
 *
 *   TIER2_CARBON_BALANCE:
 *     C_in  = reductant × C_frac
 *     C_out = DRI × C_frac
 *     E_CO2 = (C_in − C_out) × 44/12
 *
 * For coal-based rotary kilns the rejected ash retains some carbon; the Tier
 * 2 balance can model this via `driCarbonFraction`.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { MATERIAL_CARBON_FRAC, PROCESS_TIER1_EF } from './constants'
import { type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { DriEntry, GasAmounts } from './types'

const C_TO_CO2 = 44 / 12

export function calculateDri(
  ctx: EngineContext,
  entries: DriEntry[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    let co2T = 0
    let methodNote = ''

    if (e.method === 'TIER1_DEFAULT') {
      if (isMissing(e.driProducedTonnes)) {
        ctx.error('missing_dri_produced', `DRI "${e.label}" Tier 1 needs driProducedTonnes.`)
        continue
      }
      if ((e.driProducedTonnes as number) < 0) {
        ctx.error('negative_input_value', `DRI "${e.label}" driProducedTonnes cannot be negative.`)
        continue
      }
      let defaultEf: number
      switch (e.driType) {
        case 'COAL_BASED': defaultEf = PROCESS_TIER1_EF.DRI_COAL; break
        case 'GREEN_HYDROGEN': defaultEf = 0.15; break // near-zero auxiliary
        case 'SYNGAS':
        case 'NATURAL_GAS':
        default: defaultEf = PROCESS_TIER1_EF.DRI_NATURAL_GAS; break
      }
      const ef = isPresent(e.ef) ? (e.ef as number) : defaultEf
      if (ef < 0) {
        ctx.error('negative_input_value', `DRI "${e.label}" EF cannot be negative.`)
        continue
      }
      co2T = (e.driProducedTonnes as number) * ef
      methodNote = `Tier 1 default ${ef} tCO2/t DRI (${e.driType})`
      if (isMissing(e.ef)) ctx.defaultsUsed.add(`default_dri_${e.driType.toLowerCase()}_tier1_ef`)
    } else {
      // TIER2_CARBON_BALANCE
      const reductant = isPresent(e.reductantConsumed) ? (e.reductantConsumed as number) : 0
      const reductantC = isPresent(e.reductantCarbonFraction) ? (e.reductantCarbonFraction as number) : (e.driType === 'NATURAL_GAS' ? MATERIAL_CARBON_FRAC.natural_gas : MATERIAL_CARBON_FRAC.coking_coal)
      const dri = isPresent(e.driProducedTonnes) ? (e.driProducedTonnes as number) : 0
      const driCDefault = e.driType === 'GREEN_HYDROGEN' ? MATERIAL_CARBON_FRAC.dri_h2 : (e.driType === 'COAL_BASED' ? MATERIAL_CARBON_FRAC.dri_coal : MATERIAL_CARBON_FRAC.dri_gas)
      const driC = isPresent(e.driCarbonFraction) ? (e.driCarbonFraction as number) : driCDefault

      for (const [k, v] of [['reductantConsumed', reductant], ['driProducedTonnes', dri]] as Array<[string, number]>) {
        if (v < 0) ctx.error('negative_input_value', `DRI "${e.label}" ${k} cannot be negative.`, `dri.${e.id}.${k}`)
      }
      if (reductantC < 0 || reductantC > 1 || driC < 0 || driC > 1) {
        ctx.error('negative_input_value', `DRI "${e.label}" carbon fractions must be in [0,1].`)
        continue
      }

      const cIn = reductant * reductantC
      const cOut = dri * driC
      const cNet = Math.max(0, cIn - cOut)
      co2T = cNet * C_TO_CO2
      methodNote = `Tier 2 carbon balance (${e.driType})`
    }

    total.co2Tonnes += co2T
    total.co2eTonnes += co2T

    ctx.addTrace({
      step: `DRI - ${e.label}`,
      category: 'DRI',
      method: methodNote,
      formula: e.method === 'TIER1_DEFAULT' ? 'CO2 = DRI × EF_route' : 'CO2 = (reductant × C − DRI × C) × 44/12',
      inputs: { driType: e.driType, co2Tonnes: round(co2T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }

  return total
}
