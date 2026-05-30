/**
 * Onsite coke production — Tier 1 default or Tier 2 carbon balance.
 *
 *   TIER1_DEFAULT:       E_CO2 = coke_t × 0.56 tCO2/t (IPCC 2006 recovery oven)
 *   TIER2_CARBON_BALANCE:
 *      C_in  = coking_coal × C_frac
 *      C_out = coke × C_frac + COG_exported × C_kg/Nm3 + tar/BTX × C_frac
 *      E_CO2 = (C_in − C_out) × 44/12
 *
 * Note: combustion of COG in the underfiring is separately counted under
 * stationary combustion. This module is the PROCESS side of coke production.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { MATERIAL_CARBON_FRAC, PROCESS_GAS_CARBON, PROCESS_TIER1_EF } from './constants'
import { type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { CokeOvenEntry, GasAmounts } from './types'

const C_TO_CO2 = 44 / 12

export function calculateCokeOven(
  ctx: EngineContext,
  entries: CokeOvenEntry[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    let co2T = 0
    let methodNote = ''

    if (e.method === 'TIER1_DEFAULT') {
      if (isMissing(e.cokeProducedTonnes)) {
        ctx.error('missing_coke_produced', `Coke oven "${e.label}" Tier 1 needs cokeProducedTonnes.`)
        continue
      }
      if ((e.cokeProducedTonnes as number) < 0) {
        ctx.error('negative_input_value', `Coke oven "${e.label}" cokeProducedTonnes cannot be negative.`)
        continue
      }
      const ef = isPresent(e.ef) ? (e.ef as number) : PROCESS_TIER1_EF.COKE
      if (ef < 0) {
        ctx.error('negative_input_value', `Coke oven "${e.label}" EF cannot be negative.`)
        continue
      }
      co2T = (e.cokeProducedTonnes as number) * ef
      methodNote = `Tier 1 default ${ef} tCO2/t coke (IPCC 2006 recovery oven)`
      if (isMissing(e.ef)) ctx.defaultsUsed.add('default_coke_tier1_ef')
    } else {
      // TIER2_CARBON_BALANCE
      const coal = isPresent(e.cokingCoalChargedTonnes) ? (e.cokingCoalChargedTonnes as number) : 0
      const coalC = isPresent(e.cokingCoalCarbonFraction) ? (e.cokingCoalCarbonFraction as number) : MATERIAL_CARBON_FRAC.coking_coal
      const coke = isPresent(e.cokeOutTonnes) ? (e.cokeOutTonnes as number) : 0
      const cokeC = isPresent(e.cokeCarbonFraction) ? (e.cokeCarbonFraction as number) : MATERIAL_CARBON_FRAC.coke_oven_coke
      const cog = isPresent(e.cogProducedNm3) ? (e.cogProducedNm3 as number) : 0
      const cogC = isPresent(e.cogCarbonKgPerNm3) ? (e.cogCarbonKgPerNm3 as number) : PROCESS_GAS_CARBON.COG.co2EfKgPerNm3 / C_TO_CO2 // back-out C from CO2 EF
      const tar = isPresent(e.tarBtxProducedTonnes) ? (e.tarBtxProducedTonnes as number) : 0
      const tarC = isPresent(e.tarCarbonFraction) ? (e.tarCarbonFraction as number) : 0.85

      for (const [k, v] of [['cokingCoalChargedTonnes', coal], ['cokeOutTonnes', coke], ['cogProducedNm3', cog], ['tarBtxProducedTonnes', tar]] as Array<[string, number]>) {
        if (v < 0) ctx.error('negative_input_value', `Coke oven "${e.label}" ${k} cannot be negative.`, `cokeOven.${e.id}.${k}`)
      }
      if (coalC < 0 || coalC > 1 || cokeC < 0 || cokeC > 1 || tarC < 0 || tarC > 1) {
        ctx.error('negative_input_value', `Coke oven "${e.label}" carbon fractions must be in [0,1].`)
        continue
      }

      // Carbon mass balance
      const cIn = coal * coalC
      const cOut = coke * cokeC + (cog * cogC) / 1000 + tar * tarC
      const cNet = Math.max(0, cIn - cOut)
      co2T = cNet * C_TO_CO2
      methodNote = 'Tier 2 carbon balance (coal C − coke C − COG C − tar C) × 44/12'
    }

    total.co2Tonnes += co2T
    total.co2eTonnes += co2T

    ctx.addTrace({
      step: `Coke oven - ${e.label}`,
      category: 'COKE_OVEN',
      method: methodNote,
      formula: e.method === 'TIER1_DEFAULT'
        ? 'CO2 = coke × EF'
        : 'CO2 = (coal × C − coke × C − COG × C/1000 − tar × C) × 44/12',
      inputs: { co2Tonnes: round(co2T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }

  return total
}
