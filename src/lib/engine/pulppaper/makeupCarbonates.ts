/**
 * Make-up carbonates and FGD sorbents — Section 7.4 of Research Brief.
 *
 *   E_CO2 = quantity_t × stoichiometric factor
 *     CaCO3:    0.440 tCO2 / t (= 44/100)
 *     Na2CO3:   0.415 tCO2 / t (= 44/106)
 *     Dolomite: 0.477 tCO2 / t (combined molar ratio)
 *
 * Fossil-origin (mined limestone, Solvay soda ash) → Scope 1.
 * If biogenic origin (rare; site-specific), the CO2 goes to the biogenic memo.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { MAKEUP_CARBONATE_FACTORS } from './constants'
import { emptyGas } from './helpers'
import type { GasAmounts, MakeupCarbonateEntry } from './types'

function defaultFactor(code: 'CACO3' | 'NA2CO3' | 'DOLOMITE'): number {
  return MAKEUP_CARBONATE_FACTORS[code]
}

export function calculateMakeupCarbonates(ctx: EngineContext, entries: MakeupCarbonateEntry[]): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.quantityTonnes)) {
      ctx.error('missing_carbonate_quantity', `Makeup "${e.label}" has no quantityTonnes.`, `makeupCarbonates.${e.id}.quantityTonnes`)
      continue
    }
    if ((e.quantityTonnes as number) < 0) {
      ctx.error('negative_input_value', `Makeup "${e.label}" quantityTonnes cannot be negative.`)
      continue
    }
    const qty = e.quantityTonnes as number
    const ef = isPresent(e.co2EfTonnesPerTonne) ? (e.co2EfTonnesPerTonne as number) : defaultFactor(e.chemicalCode)
    if (ef < 0) {
      ctx.error('negative_input_value', `Makeup "${e.label}" co2EfTonnesPerTonne cannot be negative.`)
      continue
    }
    const co2T = qty * ef
    const isFossil = e.fossilOrigin !== false // default true

    if (isFossil) {
      total.co2Tonnes += co2T
      total.co2eTonnes += co2T
    } else {
      total.biogenicCO2Tonnes += co2T
      // No contribution to Scope 1
    }

    ctx.addTrace({
      step: `Makeup carbonate - ${e.label}`,
      category: 'MAKEUP_CARBONATE',
      method: `${e.chemicalCode} ${isFossil ? '(fossil → Scope 1)' : '(biogenic → memo)'}`,
      formula: 'CO2 = quantity × stoichiometric factor (CaCO3 0.440 · Na2CO3 0.415 · Dolomite 0.477)',
      inputs: { quantityTonnes: qty, factor: ef, fossilOrigin: isFossil ? 'fossil' : 'biogenic' },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }
  return total
}
