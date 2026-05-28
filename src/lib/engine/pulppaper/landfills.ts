/**
 * Mill-owned landfills (CH4) — Section 7.6 of Research Brief.
 *
 * Method 1 — Direct gas measurement (Eq 7.6a):
 *   CH4_released(m3) = (REC/FRCOLL)·(1−FRCOLL)·FRMETH·(1−OX) + REC·FRMETH·(1−FRBURN)
 *   CH4_t = CH4_released × 0.72 kg/Nm3 / 1000
 *
 * Method 2 — Simplified FOD (Eq 7.6b):
 *   CH4_generated(m3) = R × L0 × (e^(−kC) − e^(−kT))
 *   CH4_released(m3) = (CH4_generated − CH4_recovered)·(1−OX) + CH4_recovered·(1−FRBURN)
 *
 * Defaults: L0 100 m3/Mg · k 0.03/yr · FRCOLL 0.75 · FRMETH 0.5 · OX 0.10 · ρCH4 0.72 kg/Nm3.
 * CH4 from landfill is biogenic but IS in Scope 1 (only biogenic CO2 is the memo).
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { LANDFILL_DEFAULTS } from './constants'
import { ch4ToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, LandfillEntry } from './types'

function methodDirect(ctx: EngineContext, e: LandfillEntry): number {
  if (isMissing(e.collectedGasNm3)) {
    ctx.error('missing_landfill_gas', `Landfill "${e.label}" direct method needs collectedGasNm3.`, `landfills.${e.id}.collectedGasNm3`)
    return 0
  }
  if ((e.collectedGasNm3 as number) < 0) {
    ctx.error('negative_input_value', `Landfill "${e.label}" collectedGasNm3 cannot be negative.`)
    return 0
  }
  const REC = e.collectedGasNm3 as number
  const FRCOLL = isPresent(e.collectionEfficiency) ? (e.collectionEfficiency as number) : LANDFILL_DEFAULTS.collectionEfficiency
  const FRMETH = isPresent(e.methaneFraction) ? (e.methaneFraction as number) : LANDFILL_DEFAULTS.methaneFraction
  const OX = isPresent(e.oxidationFactor) ? (e.oxidationFactor as number) : LANDFILL_DEFAULTS.oxidationFactor
  const FRBURN = isPresent(e.fractionBurned) ? (e.fractionBurned as number) : 0
  if (FRCOLL <= 0 || FRCOLL > 1 || FRMETH < 0 || FRMETH > 1 || OX < 0 || OX > 1 || FRBURN < 0 || FRBURN > 1) {
    ctx.error('landfill_fraction_out_of_range', `Landfill "${e.label}" fractions must be in [0, 1] (FRCOLL in (0,1]).`)
    return 0
  }
  const partUncollected = (REC / FRCOLL) * (1 - FRCOLL) * FRMETH * (1 - OX)
  const partCollectedVented = REC * FRMETH * (1 - FRBURN)
  return partUncollected + partCollectedVented // m3
}

function methodFod(ctx: EngineContext, e: LandfillEntry): number {
  if (isMissing(e.annualDepositDryMg) || isMissing(e.yearsSinceOpening)) {
    ctx.error('missing_landfill_fod_inputs', `Landfill "${e.label}" simplified FOD needs annualDepositDryMg and yearsSinceOpening.`)
    return 0
  }
  const R = e.annualDepositDryMg as number
  const T = e.yearsSinceOpening as number
  const C = isPresent(e.yearsSinceClosure) ? (e.yearsSinceClosure as number) : 0
  if (R < 0 || T < 0 || C < 0) {
    ctx.error('negative_input_value', `Landfill "${e.label}" deposit/years cannot be negative.`)
    return 0
  }
  const L0 = isPresent(e.methanePotentialM3PerMg) ? (e.methanePotentialM3PerMg as number) : LANDFILL_DEFAULTS.methanePotentialM3PerMg
  const k = isPresent(e.decayRatePerYear) ? (e.decayRatePerYear as number) : LANDFILL_DEFAULTS.decayRatePerYear
  if (L0 < 0 || k < 0) {
    ctx.error('negative_input_value', `Landfill "${e.label}" L0/k cannot be negative.`)
    return 0
  }
  const generated = R * L0 * (Math.exp(-k * C) - Math.exp(-k * T))
  // Released = (generated − recovered)·(1−OX) + recovered·(1−FRBURN)
  const recovered = isPresent(e.ch4RecoveredM3) ? Math.max(0, e.ch4RecoveredM3 as number) : 0
  const OX = isPresent(e.oxidationFactor) ? (e.oxidationFactor as number) : LANDFILL_DEFAULTS.oxidationFactor
  const FRBURN = isPresent(e.fractionBurned) ? (e.fractionBurned as number) : 0
  const released = (generated - recovered) * (1 - OX) + recovered * (1 - FRBURN)
  return Math.max(0, released)
}

export function calculateLandfills(
  ctx: EngineContext,
  entries: LandfillEntry[],
  gwp: PulpPaperGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    const ch4Vol = e.method === 'DIRECT_GAS_MEASUREMENT' ? methodDirect(ctx, e) : methodFod(ctx, e)
    const ch4T = (ch4Vol * LANDFILL_DEFAULTS.ch4DensityKgPerNm3) / 1000
    // Landfill CH4 is biogenic → use biogenic GWP
    const co2eT = ch4ToCO2e(ch4T, gwp, true)
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Landfill - ${e.label}`,
      category: 'LANDFILL',
      method: e.method,
      formula: e.method === 'DIRECT_GAS_MEASUREMENT'
        ? 'CH4 m3 = (REC/FRCOLL)·(1−FRCOLL)·FRMETH·(1−OX) + REC·FRMETH·(1−FRBURN); ×0.72/1000 → t'
        : 'CH4 m3 generated = R·L0·(e^(−kC) − e^(−kT)); released = (gen−recov)(1−OX) + recov(1−FRBURN); ×0.72/1000 → t',
      inputs: { ch4Volume_m3: round(ch4Vol, 3), ch4Tonnes: round(ch4T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
