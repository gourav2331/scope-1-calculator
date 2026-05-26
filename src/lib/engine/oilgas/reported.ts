/**
 * Reported / direct emissions. For public-disclosure or client head-office data
 * where bottom-up activity inputs aren't available, the consultant enters the
 * disclosed figure directly — either a total CO2e, or by-gas masses (CO2/CH4/
 * N2O) which the engine converts with the chosen GWP set. Each row carries a
 * basis tag (measured/estimated/inferred/reported/residual) and a source, and
 * lives in its own 'reported' bucket so it's never confused with modelled
 * bottom-up sources.
 */

import type { EngineContext } from '../context'
import { isPresent, orDefault, round } from '../util'
import { ch4ToCO2e, n2oToCO2e, type OilGasGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, ReportedEntry } from './types'

export function calculateReported(ctx: EngineContext, entries: ReportedEntry[], gwp: OilGasGwp): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    const co2 = orDefault(e.co2Tonnes, 0)
    const ch4 = orDefault(e.ch4Tonnes, 0)
    const n2o = orDefault(e.n2oTonnes, 0)
    const directCO2e = isPresent(e.co2eTonnes)
    const co2e = directCO2e ? (e.co2eTonnes as number) : co2 + ch4ToCO2e(ch4, gwp) + n2oToCO2e(n2o, gwp)

    total.co2Tonnes += co2
    total.ch4Tonnes += ch4
    total.n2oTonnes += n2o
    total.co2eTonnes += co2e

    const inputs: Record<string, number | string | null> = {
      basis: e.basis,
      co2eTonnes: round(co2e, 4),
    }
    if (e.categoryTag) inputs.categoryTag = e.categoryTag
    if (isPresent(e.co2Tonnes)) inputs.co2Tonnes = round(co2, 4)
    if (isPresent(e.ch4Tonnes)) inputs.ch4Tonnes = round(ch4, 4)
    if (isPresent(e.n2oTonnes)) inputs.n2oTonnes = round(n2o, 4)
    if (e.source) inputs.source = e.source
    ctx.addTrace({
      step: `Reported / direct - ${e.label}`,
      category: 'REPORTED',
      method: e.basis,
      formula: directCO2e ? 'directly reported CO2e' : 'CO2 + CH4·GWP + N2O·GWP (reported gas masses)',
      inputs,
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2e, 4),
    })
  }

  return total
}
