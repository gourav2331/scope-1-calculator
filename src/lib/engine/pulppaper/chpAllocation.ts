/**
 * CHP allocation — Section 7.9 of Research Brief (Simplified Efficiency Method).
 *
 *   Reff = eH / eP (default 0.80 / 0.35 ≈ 2.286, sometimes rounded to 2.3)
 *   EH = ( H / (H + P × Reff) ) × ET
 *   EP = ET − EH
 *
 * Outputs:
 *   EF_heat  = EH × 1000 / H (kg CO2e/GJ heat)
 *   EF_power = EP × 1000 / P (kg CO2e/GJ power)
 *
 * NB: this module does NOT change gross Scope 1; it apportions an already-counted
 * total between heat and power outputs for reporting (e.g., to derive EF for sold
 * energy). The total ET should already be reflected in stationary combustion totals
 * elsewhere — this is an additional analytical breakdown.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { CHP_DEFAULTS } from './constants'
import type { ChpAllocationEntry, ChpAllocationResult } from './types'

export function calculateChpAllocation(
  ctx: EngineContext,
  entries: ChpAllocationEntry[],
): ChpAllocationResult[] {
  const out: ChpAllocationResult[] = []
  if (entries.length === 0) return out

  for (const e of entries) {
    if (isMissing(e.totalEmissionsCo2eTonnes) || isMissing(e.heatOutputGj) || isMissing(e.powerOutputGj)) {
      ctx.error('missing_chp_inputs', `CHP "${e.label}" needs totalEmissionsCo2eTonnes, heatOutputGj, powerOutputGj.`)
      continue
    }
    const ET = e.totalEmissionsCo2eTonnes as number
    const H = e.heatOutputGj as number
    const P = e.powerOutputGj as number
    if (ET < 0 || H < 0 || P <= 0) {
      ctx.error('negative_input_value', `CHP "${e.label}" needs ET ≥ 0, H ≥ 0, P > 0.`)
      continue
    }
    const eH = isPresent(e.heatEfficiency) ? (e.heatEfficiency as number) : CHP_DEFAULTS.heatEfficiency
    const eP = isPresent(e.powerEfficiency) ? (e.powerEfficiency as number) : CHP_DEFAULTS.powerEfficiency
    if (eH <= 0 || eP <= 0) {
      ctx.error('negative_input_value', `CHP "${e.label}" efficiencies must be > 0.`)
      continue
    }
    const Reff = eH / eP
    const EH = (H / (H + P * Reff)) * ET
    const EP = ET - EH

    const result: ChpAllocationResult = {
      label: e.label,
      heatEmissionsTonnes: round(EH, 4),
      powerEmissionsTonnes: round(EP, 4),
      heatEfKgPerGj: H > 0 ? round((EH * 1000) / H, 3) : 0,
      powerEfKgPerGj: P > 0 ? round((EP * 1000) / P, 3) : 0,
    }
    out.push(result)

    ctx.addTrace({
      step: `CHP allocation - ${e.label}`,
      category: 'CHP_ALLOCATION',
      method: 'Simplified Efficiency Method',
      formula: 'Reff = eH/eP; EH = H/(H + P·Reff) × ET; EP = ET − EH',
      inputs: { ET, H, P, eH, eP, Reff: round(Reff, 4), EH: result.heatEmissionsTonnes, EP: result.powerEmissionsTonnes },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(ET, 4),
    })
  }

  return out
}
