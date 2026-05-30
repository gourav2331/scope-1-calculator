/**
 * Flaring of process gases (COG / BFG / BOFG) — IPCC 2019 Refinement.
 *
 *   E_CO2_combustion = V_gas × C_content × DRE × 44/12
 *   E_CH4_slip       = V_gas × CH4_slip_factor × (1 − DRE)   (optional)
 *
 * Typical flaring rates per IPCC 2019 Refinement: COG 0.3–2%, BFG 0.5–20%,
 * BOFG 5–100%. Default DRE 0.98 (lit assisted). Unlit ⇒ 0 ⇒ all carbon
 * vented as CO equivalent (mostly oxidises to CO2 in the atmosphere; for
 * accounting purposes we still attribute as CO2 release).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { FLARE_DRE_DEFAULTS, PROCESS_GAS_CARBON } from './constants'
import { ch4ToCO2e, type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FlaringEntry, GasAmounts } from './types'

function defaultCarbonForGas(gas: 'COG' | 'BFG' | 'BOFG' | 'MIXED') {
  if (gas === 'COG') return PROCESS_GAS_CARBON.COG.co2EfKgPerNm3
  if (gas === 'BFG') return PROCESS_GAS_CARBON.BFG.co2EfKgPerNm3
  if (gas === 'BOFG') return PROCESS_GAS_CARBON.BOFG.co2EfKgPerNm3
  // MIXED — assume worst-case BFG carbon density unless overridden
  return PROCESS_GAS_CARBON.BFG.co2EfKgPerNm3
}

export function calculateFlaring(
  ctx: EngineContext,
  entries: FlaringEntry[],
  gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.flaredVolumeNm3)) {
      ctx.error('missing_flare_volume', `Flare "${e.label}" has no flaredVolumeNm3.`)
      continue
    }
    if ((e.flaredVolumeNm3 as number) < 0) {
      ctx.error('negative_input_value', `Flare "${e.label}" flaredVolumeNm3 cannot be negative.`)
      continue
    }
    const v = e.flaredVolumeNm3 as number
    const dre = isPresent(e.combustionEfficiency) ? (e.combustionEfficiency as number) : FLARE_DRE_DEFAULTS.LIT_ASSISTED
    if (dre < 0 || dre > 1) {
      ctx.error('fraction_out_of_range', `Flare "${e.label}" combustionEfficiency must be in [0,1].`)
      continue
    }
    if (dre === 0) {
      ctx.warn('flare_unlit_treated_as_full_release', `Flare "${e.label}" DRE=0 (unlit) — all gas carbon released; treat as venting.`)
    } else if (dre < 0.6) {
      ctx.warn('flare_dre_below_60pct', `Flare "${e.label}" DRE ${dre} below the 60% reasonable floor — confirm sensor evidence.`)
    }

    const carbonKgPerNm3 = isPresent(e.carbonKgPerNm3) ? (e.carbonKgPerNm3 as number) : defaultCarbonForGas(e.gasType)
    if (carbonKgPerNm3 < 0) {
      ctx.error('negative_input_value', `Flare "${e.label}" carbonKgPerNm3 cannot be negative.`)
      continue
    }

    // Combustion CO2 (only the fraction destroyed in the flame). Carbon
    // escaping as CH4 slip is captured separately.
    const co2T = (v * carbonKgPerNm3 * dre) / 1000

    // Optional CH4 slip — small but counted (high GWP)
    const ch4SlipKgPerNm3 = isPresent(e.ch4SlipKgPerNm3) ? (e.ch4SlipKgPerNm3 as number) : 0
    if (ch4SlipKgPerNm3 < 0) {
      ctx.error('negative_input_value', `Flare "${e.label}" ch4SlipKgPerNm3 cannot be negative.`)
      continue
    }
    const ch4T = (v * ch4SlipKgPerNm3 * (1 - dre)) / 1000
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp)

    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Flaring - ${e.label}`,
      category: 'FLARING',
      method: `${e.gasType} flare`,
      formula: 'CO2 = V × C × DRE / 1000; CH4 slip = V × CH4_factor × (1−DRE) / 1000',
      inputs: { volumeNm3: v, gasType: e.gasType, dre, carbonKgPerNm3, ch4Tonnes: round(ch4T, 6) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
