/**
 * Venting (V1 §4.4 / §8.3). Intentional release of gas WITHOUT combustion:
 * blowdowns, dehydrator still vents, pneumatic controller bleeds, tank flash
 * gas, well unloading. Methane-dominated. Vapour-recovery (VRU) capture reduces
 * the released quantity; the captured gas is counted at its destination source
 * (sales/fuel), not here.
 *
 *   CH4 released = ventVolume × molfrac_CH4 × ρ_CH4 × (1 − capture)
 *   CO2 released = ventVolume × molfrac_CO2 × ρ_CO2 × (1 − capture)
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { ch4ToCO2e, type OilGasGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, VentEntry } from './types'

function frac(percent: number | null | undefined): number {
  return isPresent(percent) ? (percent as number) / 100 : 0
}

export function calculateVenting(ctx: EngineContext, entries: VentEntry[], gwp: OilGasGwp): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total // don't record vent constants when unused
  const ch4Density = ctx.resolver.constant('CH4_DENSITY_SM3')
  const co2Density = ctx.resolver.constant('CO2_DENSITY_SM3')

  for (const entry of entries) {
    if (isMissing(entry.ventVolumeSm3)) {
      ctx.error('missing_vent_volume', `Vent "${entry.label}" has no vented volume.`, `venting.${entry.id}.ventVolumeSm3`)
      continue
    }
    if ((entry.ventVolumeSm3 as number) < 0) {
      ctx.error('negative_input_value', `Vent "${entry.label}" volume cannot be negative.`, `venting.${entry.id}.ventVolumeSm3`)
      continue
    }
    let capture = orDefault(entry.captureFraction, 0)
    if (capture < 0 || capture > 1) {
      ctx.warn('vru_capture_outside_0_1', `Vent "${entry.label}" capture fraction ${capture} is outside [0, 1]; clamped.`, `venting.${entry.id}.captureFraction`)
      capture = Math.min(Math.max(capture, 0), 1)
    }
    const volume = entry.ventVolumeSm3 as number
    const ch4 = frac(entry.composition.ch4Percent)
    const co2In = frac(entry.composition.co2Percent)

    if (ch4 === 0) {
      ctx.warn('vent_zero_methane', `Vent "${entry.label}" reports 0% methane — confirm the gas composition is correct.`, `venting.${entry.id}.composition.ch4Percent`)
    }

    const residual = 1 - capture
    const ch4T = (volume * ch4 * ch4Density * residual) / 1000
    const co2T = (volume * co2In * co2Density * residual) / 1000
    const ch4eCO2e = ch4ToCO2e(ch4T, gwp)
    const co2eT = co2T + ch4eCO2e

    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    const inputs: Record<string, number | string | null> = {
      ventVolumeSm3: volume,
      ch4Percent: orDefault(entry.composition.ch4Percent, 0),
      co2Percent: orDefault(entry.composition.co2Percent, 0),
      captureFraction: capture,
      eventType: entry.eventType,
      ch4Tonnes: round(ch4T, 4),
      co2Tonnes: round(co2T, 4),
    }
    if (entry.ventReason) inputs.ventReason = entry.ventReason
    if (entry.evidenceReference) inputs.evidenceReference = entry.evidenceReference
    ctx.addTrace({
      step: `Venting - ${entry.label}`,
      category: 'VENTING',
      method: entry.eventType === 'ABNORMAL' ? 'GAS_COMPOSITION (abnormal-event)' : 'GAS_COMPOSITION',
      formula: 'released = ventVolume × molfrac × density × (1 − capture)',
      inputs,
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
