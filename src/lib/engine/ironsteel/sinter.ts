/**
 * Sinter plant — Tier 1 default or Tier 2 carbon balance.
 *
 *   TIER1_DEFAULT:       E_CO2 = sinter_t × 0.20 tCO2/t (IPCC 2006 default)
 *   TIER2_CARBON_BALANCE:
 *      E_CO2 = (coke_breeze × C_frac + flux_CaCO3 × 0.440 + flux_dolomite × 0.477 + NG_energy × EF_NG / 1000)
 *
 * 2019 IPCC Refinement added Tier 1 CH4 / N2O for sintering — applied via
 * per-row factors (`sinterCh4EfKgPerTonne`, `sinterN2oEfKgPerTonne`).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { CARBONATE_CALCINATION_FACTORS, IRONSTEEL_FUEL_DEFAULTS, MATERIAL_CARBON_FRAC, PROCESS_TIER1_EF } from './constants'
import { ch4ToCO2e, n2oToCO2e, type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, SinterEntry } from './types'

const C_TO_CO2 = 44 / 12

export function calculateSinter(
  ctx: EngineContext,
  entries: SinterEntry[],
  gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.sinterProducedTonnes)) {
      ctx.error('missing_sinter_produced', `Sinter "${e.label}" needs sinterProducedTonnes.`)
      continue
    }
    if ((e.sinterProducedTonnes as number) < 0) {
      ctx.error('negative_input_value', `Sinter "${e.label}" sinterProducedTonnes cannot be negative.`)
      continue
    }
    const sinterT = e.sinterProducedTonnes as number

    let co2T = 0
    let methodNote = ''

    if (e.method === 'TIER1_DEFAULT') {
      const ef = isPresent(e.ef) ? (e.ef as number) : PROCESS_TIER1_EF.SINTER
      if (ef < 0) {
        ctx.error('negative_input_value', `Sinter "${e.label}" EF cannot be negative.`)
        continue
      }
      co2T = sinterT * ef
      methodNote = `Tier 1 default ${ef} tCO2/t sinter (IPCC 2006)`
      if (isMissing(e.ef)) ctx.defaultsUsed.add('default_sinter_tier1_ef')
    } else {
      // TIER2_CARBON_BALANCE
      const cokeBreeze = isPresent(e.cokeBreezeConsumedTonnes) ? (e.cokeBreezeConsumedTonnes as number) : 0
      const cokeBreezeC = isPresent(e.cokeBreezeCarbonFraction) ? (e.cokeBreezeCarbonFraction as number) : MATERIAL_CARBON_FRAC.coke_oven_coke
      const limestone = isPresent(e.fluxLimestoneTonnes) ? (e.fluxLimestoneTonnes as number) : 0
      const dolomite = isPresent(e.fluxDolomiteTonnes) ? (e.fluxDolomiteTonnes as number) : 0
      const ngEnergy = isPresent(e.naturalGasConsumedGj) ? (e.naturalGasConsumedGj as number) : 0
      for (const [k, v] of [['cokeBreezeConsumedTonnes', cokeBreeze], ['fluxLimestoneTonnes', limestone], ['fluxDolomiteTonnes', dolomite], ['naturalGasConsumedGj', ngEnergy]] as Array<[string, number]>) {
        if (v < 0) {
          ctx.error('negative_input_value', `Sinter "${e.label}" ${k} cannot be negative.`, `sinter.${e.id}.${k}`)
        }
      }
      if (cokeBreezeC < 0 || cokeBreezeC > 1) {
        ctx.error('negative_input_value', `Sinter "${e.label}" cokeBreezeCarbonFraction must be in [0,1].`)
        continue
      }
      const cokeCO2 = cokeBreeze * cokeBreezeC * C_TO_CO2
      const limestoneCO2 = limestone * CARBONATE_CALCINATION_FACTORS.CACO3
      const dolomiteCO2 = dolomite * CARBONATE_CALCINATION_FACTORS.DOLOMITE
      const ngCO2 = (ngEnergy * (IRONSTEEL_FUEL_DEFAULTS.natural_gas?.co2EfKgPerGj ?? 56.1)) / 1000
      co2T = cokeCO2 + limestoneCO2 + dolomiteCO2 + ngCO2
      methodNote = 'Tier 2 carbon balance (coke breeze + fluxes + NG)'
    }

    // 2019 Refinement non-CO2 (CH4 / N2O)
    const ch4Ef = isPresent(e.sinterCh4EfKgPerTonne) ? (e.sinterCh4EfKgPerTonne as number) : 0.07 // kg CH4 / t sinter (2019 Refinement Tier 1)
    const n2oEf = isPresent(e.sinterN2oEfKgPerTonne) ? (e.sinterN2oEfKgPerTonne as number) : 0.025
    const ch4T = (sinterT * ch4Ef) / 1000
    const n2oT = (sinterT * n2oEf) / 1000

    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)
    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Sinter - ${e.label}`,
      category: 'SINTER',
      method: methodNote,
      formula: e.method === 'TIER1_DEFAULT'
        ? 'CO2 = sinter × EF; CH4/N2O = sinter × per-t EF / 1000'
        : 'CO2 = (coke × C × 44/12) + (CaCO3 × 0.440) + (Dolomite × 0.477) + (NG × EFng/1000); CH4/N2O Tier 1',
      inputs: { sinterTonnes: sinterT, ch4Tonnes: round(ch4T, 6), n2oTonnes: round(n2oT, 6) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
