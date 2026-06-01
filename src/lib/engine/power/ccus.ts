/**
 * CCUS treatment for power-plant Scope 1 (MVP scope):
 *
 *   - capturedAndStored: deducted from gross Scope 1 per EU ETS Article 49,
 *     EPA 40 CFR Part 98 Subpart RR conventions. PERMANENCE NOT MODELLED —
 *     storage / reversal risk deferred to a later release; warning emitted.
 *   - capturedAndUtilised: NOT deducted (the carbon re-releases short-cycle).
 *   - processVent: CO2 vented from the capture process itself (start-up,
 *     regenerative venting) — flagged but reported as a memo item.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import type { CcusEntry } from './types'

export interface CcusResult {
  capturedAndStoredTonnes: number   // deducted from gross
  processVentTonnes: number         // memo
}

export function calculateCcus(ctx: EngineContext, entries: CcusEntry[]): CcusResult {
  let captured = 0
  let processVent = 0

  for (const e of entries) {
    if (isMissing(e.capturedAndStoredTonnes)) {
      ctx.error('missing_ccs_captured', `CCUS "${e.label}" needs capturedAndStoredTonnes.`)
      continue
    }
    if ((e.capturedAndStoredTonnes as number) < 0) {
      ctx.error('negative_input_value', `CCUS "${e.label}" capturedAndStoredTonnes cannot be negative.`)
      continue
    }
    captured += e.capturedAndStoredTonnes as number

    if (isPresent(e.capturedAndUtilisedTonnes) && (e.capturedAndUtilisedTonnes as number) > 0) {
      ctx.warn(
        'ccs_utilised_not_deducted',
        `CCUS "${e.label}" reports ${e.capturedAndUtilisedTonnes} t captured & utilised — NOT deducted from gross (short-cycle re-release).`,
      )
    }
    if (isPresent(e.processVentTonnes) && (e.processVentTonnes as number) > 0) {
      processVent += e.processVentTonnes as number
      ctx.warn(
        'ccs_process_vent_logged',
        `CCUS "${e.label}" reports ${e.processVentTonnes} t process vent (start-up / regen) — kept in gross Scope 1 via stationary stack; memo line shows the carve-out.`,
      )
    }
    ctx.warn(
      'ccs_permanence_not_modelled',
      `CCUS "${e.label}" applies ${e.capturedAndStoredTonnes} t storage credit; reversal / permanence not modelled (deferred). MRV protocol: ${e.mrvProtocol}.`,
      'activityData.ccus',
    )
    ctx.addTrace({
      step: `CCUS - ${e.label}`,
      category: 'CCUS',
      method: 'CAPTURED_AND_STORED',
      formula: 'gross -= capturedAndStoredTonnes ; utilised + processVent are memo',
      inputs: {
        capturedAndStoredTonnes: round(e.capturedAndStoredTonnes as number, 4),
        utilisedTonnes: round(e.capturedAndUtilisedTonnes ?? 0, 4),
        processVentTonnes: round(e.processVentTonnes ?? 0, 4),
        mrvProtocol: e.mrvProtocol,
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: -round(e.capturedAndStoredTonnes as number, 4),
    })
  }

  return { capturedAndStoredTonnes: captured, processVentTonnes: processVent }
}
