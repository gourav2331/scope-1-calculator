/**
 * Fossil CO2 imports/exports — Section 7.10 of Research Brief.
 *
 *   Net_E_CO2 = E_CO2,combustion − Exported_to_PCC,fossil + Imported,fossil
 *
 * Typical use: kraft mill supplies fossil CO2 from lime kiln stack gas to an
 * adjacent precipitated calcium carbonate (PCC) plant — that fossil CO2 is NOT
 * emitted by the mill, so it's a deduction. Biogenic transfers go to the memo
 * line (not gross Scope 1).
 *
 * Output: a GasAmounts with NEGATIVE co2 for exports and positive for imports,
 * so it can be added to the per-category map and reduces the gross total.
 */

import type { EngineContext } from '../context'
import { isMissing, round } from '../util'
import { emptyGas } from './helpers'
import type { Co2TransferEntry, GasAmounts } from './types'

export function calculateCo2Transfers(
  ctx: EngineContext,
  entries: Co2TransferEntry[],
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.quantityTonnes)) {
      ctx.error('missing_transfer_quantity', `CO2 transfer "${e.label}" has no quantityTonnes.`, `co2Transfers.${e.id}.quantityTonnes`)
      continue
    }
    if ((e.quantityTonnes as number) < 0) {
      ctx.error('negative_input_value', `CO2 transfer "${e.label}" quantityTonnes cannot be negative (use direction=EXPORT for deductions).`)
      continue
    }
    const qty = e.quantityTonnes as number
    const signed = e.direction === 'EXPORT' ? -qty : qty

    if (e.origin === 'BIOGENIC') {
      // Biogenic transfer adjusts the memo line, not Scope 1
      total.biogenicCO2Tonnes += signed
    } else {
      // Fossil — adjusts Scope 1 CO2 (and therefore CO2e)
      total.co2Tonnes += signed
      total.co2eTonnes += signed
    }

    ctx.addTrace({
      step: `CO2 transfer (${e.direction.toLowerCase()}, ${e.origin.toLowerCase()}) - ${e.label}`,
      category: e.origin === 'FOSSIL' ? 'CO2_TRANSFER_FOSSIL' : 'CO2_TRANSFER_BIOGENIC',
      method: `${e.direction} ${e.origin}`,
      formula: 'Net_E_CO2 = combustion − exports + imports (fossil); biogenic transfers adjust memo line',
      inputs: { quantityTonnes: qty, direction: e.direction, origin: e.origin, signed: round(signed, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(signed, 4),
    })
  }
  return total
}
