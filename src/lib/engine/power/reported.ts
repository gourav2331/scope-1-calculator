/**
 * Reported / direct-entry rows for the Power engine. For corporate-aggregate
 * disclosures (CDP, BRSR, sustainability reports) where line-item activity
 * isn't available. Each row either supplies a total CO2e or a per-gas split.
 */

import type { EngineContext } from '../context'
import { isPresent, round } from '../util'
import { ch4ToCO2e, n2oToCO2e, type PowerGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, ReportedEntry } from './types'

export function calculateReported(
  ctx: EngineContext,
  entries: ReportedEntry[],
  gwp: PowerGwp,
): GasAmounts {
  const total = emptyGas()
  for (const e of entries) {
    let co2e = 0
    if (isPresent(e.totalCO2eTonnes)) {
      const t = e.totalCO2eTonnes as number
      if (t < 0) {
        ctx.error('negative_input_value', `Reported "${e.label}" totalCO2eTonnes cannot be negative.`)
        continue
      }
      co2e = t
    } else {
      const co2 = isPresent(e.co2Tonnes) ? (e.co2Tonnes as number) : 0
      const ch4 = isPresent(e.ch4Tonnes) ? (e.ch4Tonnes as number) : 0
      const n2o = isPresent(e.n2oTonnes) ? (e.n2oTonnes as number) : 0
      if (co2 < 0 || ch4 < 0 || n2o < 0) {
        ctx.error('negative_input_value', `Reported "${e.label}" gas mass cannot be negative.`)
        continue
      }
      total.co2Tonnes += co2
      total.ch4Tonnes += ch4
      total.n2oTonnes += n2o
      co2e = co2 + ch4ToCO2e(ch4, gwp, false) + n2oToCO2e(n2o, gwp)
    }
    total.co2eTonnes += co2e

    ctx.addTrace({
      step: `Reported - ${e.label}`,
      category: 'REPORTED',
      method: e.basis.toUpperCase(),
      formula: isPresent(e.totalCO2eTonnes)
        ? 'reported total CO2e'
        : 'CO2 + CH4·GWP + N2O·GWP',
      inputs: {
        basis: e.basis,
        co2eTonnes: round(co2e, 4),
        source: e.source ?? null,
        evidenceReference: e.evidenceReference ?? null,
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }
  return total
}
