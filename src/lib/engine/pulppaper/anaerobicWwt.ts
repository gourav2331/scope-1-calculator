/**
 * Anaerobic wastewater treatment & sludge digestion — Section 7.7 of Research.
 *
 * Method 1 — Gas capture (Eq 7.7a):
 *   CH4_released(m3) = (Q/FRCOLL)·(1−FRCOLL)·FRMETH + Q·FRMETH·(1−FRBURN)
 *   FRCOLL default 1.0 (odor-tight cover), 0.95 engineered, 0.50 open lagoon.
 *
 * Method 2 — Activity-based (Eq 7.7b):
 *   E_CH4(kg) = OC × EF − B
 *   EF = 0.25 kg CH4/kg COD (default IPCC) OR 0.6 kg CH4/kg BOD.
 *   B = mass of CH4 captured and burned.
 *
 * Anaerobic CH4 is biogenic but IS Scope 1 (biogenic CO2 portion goes to memo,
 * not modelled here separately).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { LANDFILL_DEFAULTS, WWT_DEFAULTS } from './constants'
import { ch4ToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { AnaerobicWwtEntry, GasAmounts } from './types'

function methodGasCapture(ctx: EngineContext, e: AnaerobicWwtEntry): number {
  if (isMissing(e.collectedGasNm3)) {
    ctx.error('missing_wwt_gas', `WWT "${e.label}" gas-capture method needs collectedGasNm3.`)
    return 0
  }
  if ((e.collectedGasNm3 as number) < 0) {
    ctx.error('negative_input_value', `WWT "${e.label}" collectedGasNm3 cannot be negative.`)
    return 0
  }
  const Q = e.collectedGasNm3 as number
  const FRCOLL = isPresent(e.collectionEfficiency) ? (e.collectionEfficiency as number) : WWT_DEFAULTS.collectionEfficiencyOdorTight
  const FRMETH = isPresent(e.methaneFraction) ? (e.methaneFraction as number) : WWT_DEFAULTS.methaneFraction
  const FRBURN = isPresent(e.fractionBurned) ? (e.fractionBurned as number) : 1.0
  if (FRCOLL <= 0 || FRCOLL > 1 || FRMETH < 0 || FRMETH > 1 || FRBURN < 0 || FRBURN > 1) {
    ctx.error('wwt_fraction_out_of_range', `WWT "${e.label}" fractions must be in [0, 1].`)
    return 0
  }
  const partUncollected = (Q / FRCOLL) * (1 - FRCOLL) * FRMETH
  const partCollectedVented = Q * FRMETH * (1 - FRBURN)
  const ch4Volume = partUncollected + partCollectedVented
  const ch4T = (ch4Volume * LANDFILL_DEFAULTS.ch4DensityKgPerNm3) / 1000
  return ch4T
}

function methodActivity(ctx: EngineContext, e: AnaerobicWwtEntry): number {
  // Prefer COD basis if both supplied; fall back to BOD
  const useCod = isPresent(e.codLoadKg)
  const useBod = !useCod && isPresent(e.bodLoadKg)
  if (!useCod && !useBod) {
    ctx.error('missing_wwt_load', `WWT "${e.label}" activity-based method needs codLoadKg or bodLoadKg.`)
    return 0
  }
  const OC = useCod ? (e.codLoadKg as number) : (e.bodLoadKg as number)
  if (OC < 0) {
    ctx.error('negative_input_value', `WWT "${e.label}" load cannot be negative.`)
    return 0
  }
  const ef = useCod
    ? (isPresent(e.efKgCh4PerKgCod) ? (e.efKgCh4PerKgCod as number) : WWT_DEFAULTS.efKgCh4PerKgCod)
    : (isPresent(e.efKgCh4PerKgBod) ? (e.efKgCh4PerKgBod as number) : WWT_DEFAULTS.efKgCh4PerKgBod)
  if (ef < 0) {
    ctx.error('negative_input_value', `WWT "${e.label}" CH4 EF cannot be negative.`)
    return 0
  }
  const captured = isPresent(e.ch4CapturedKg) ? Math.max(0, e.ch4CapturedKg as number) : 0
  const ch4Kg = Math.max(0, OC * ef - captured)
  return ch4Kg / 1000 // tonnes
}

export function calculateAnaerobicWwt(
  ctx: EngineContext,
  entries: AnaerobicWwtEntry[],
  gwp: PulpPaperGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    const ch4T = e.method === 'GAS_CAPTURE' ? methodGasCapture(ctx, e) : methodActivity(ctx, e)
    // Anaerobic CH4 is biogenic → use biogenic GWP
    const co2eT = ch4ToCO2e(ch4T, gwp, true)
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Anaerobic WWT - ${e.label}`,
      category: 'ANAEROBIC_WWT',
      method: e.method,
      formula: e.method === 'GAS_CAPTURE'
        ? 'CH4 m3 = (Q/FRCOLL)·(1−FRCOLL)·FRMETH + Q·FRMETH·(1−FRBURN); ×0.72/1000 → t'
        : 'CH4 kg = OC × EF − B (COD: 0.25 kgCH4/kgCOD; BOD: 0.6)',
      inputs: { ch4Tonnes: round(ch4T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
