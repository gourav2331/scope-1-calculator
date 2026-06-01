/**
 * Process emissions at power plants (small but real):
 *   - Wet FGD scrubber CO2 from limestone (CaCO3 → CaSO4 + CO2)
 *   - SCR/SNCR urea oxidation (CO(NH2)2 → CO2 + 2 N2)
 *
 * Both are stoichiometric: mass × purity × 44/MW_reagent.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { PROCESS_PURITY_DEFAULTS, PROCESS_STOICH } from './constants'
import { n2oToCO2e, type PowerGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FgdEntry, GasAmounts, ScrSncrEntry } from './types'

export function calculateFgd(ctx: EngineContext, entries: FgdEntry[]): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    if (isMissing(e.limestoneTonnes)) {
      ctx.error('missing_limestone', `FGD "${e.label}" needs limestoneTonnes.`)
      continue
    }
    if ((e.limestoneTonnes as number) < 0) {
      ctx.error('negative_input_value', `FGD "${e.label}" limestoneTonnes cannot be negative.`)
      continue
    }
    const purity = orDefault(e.purity, PROCESS_PURITY_DEFAULTS.CACO3_PURITY)
    if (purity < 0 || purity > 1) {
      ctx.error('purity_out_of_range', `FGD "${e.label}" purity ${purity} must be in [0, 1].`)
      continue
    }
    if (isMissing(e.purity)) {
      ctx.defaultsUsed.add('fgd_purity_default_used')
      ctx.warn('fgd_purity_default_used',
        `FGD "${e.label}" used default purity 0.92 (no plant assay).`)
    }
    const co2T = (e.limestoneTonnes as number) * purity * PROCESS_STOICH.CACO3_TO_CO2
    total.co2Tonnes += co2T
    total.co2eTonnes += co2T

    ctx.addTrace({
      step: `FGD limestone - ${e.label}`,
      category: 'PROCESS_FGD',
      method: 'STOICHIOMETRIC',
      formula: 'limestone × purity × 44/100.09',
      inputs: {
        limestoneTonnes: e.limestoneTonnes,
        purity,
        co2Tonnes: round(co2T, 4),
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }
  return total
}

export function calculateScrSncr(
  ctx: EngineContext,
  entries: ScrSncrEntry[],
  gwp: PowerGwp,
): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    if (isMissing(e.ureaTonnes)) {
      ctx.error('missing_urea', `SCR/SNCR "${e.label}" needs ureaTonnes.`)
      continue
    }
    if ((e.ureaTonnes as number) < 0) {
      ctx.error('negative_input_value', `SCR/SNCR "${e.label}" ureaTonnes cannot be negative.`)
      continue
    }
    const purity = orDefault(e.purity, PROCESS_PURITY_DEFAULTS.UREA_PURITY)
    if (purity < 0 || purity > 1) {
      ctx.error('purity_out_of_range', `SCR/SNCR "${e.label}" purity ${purity} must be in [0, 1].`)
      continue
    }
    const co2T = (e.ureaTonnes as number) * purity * PROCESS_STOICH.UREA_TO_CO2
    total.co2Tonnes += co2T

    // Optional N2O slip from SCR (kg/yr → t)
    let n2oT = 0
    if (isPresent(e.scrN2oSlipKg)) {
      if ((e.scrN2oSlipKg as number) < 0) {
        ctx.error('negative_input_value', `SCR/SNCR "${e.label}" N2O slip cannot be negative.`)
      } else {
        n2oT = (e.scrN2oSlipKg as number) / 1000
        total.n2oTonnes += n2oT
      }
    }

    const co2e = co2T + n2oToCO2e(n2oT, gwp)
    total.co2eTonnes += co2e

    ctx.addTrace({
      step: `SCR/SNCR urea - ${e.label}`,
      category: 'PROCESS_SCR',
      method: 'UREA_STOICHIOMETRIC',
      formula: 'urea × purity × 44/60.06 + N2O slip × GWP',
      inputs: {
        ureaTonnes: e.ureaTonnes,
        purity,
        co2Tonnes: round(co2T, 4),
        n2oTonnes: round(n2oT, 5),
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }
  return total
}
