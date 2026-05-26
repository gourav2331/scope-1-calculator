/** Small accumulation helpers for per-category gas breakdowns. */

import { round } from '../util'
import type { GasAmounts } from './types'

export function emptyGas(): GasAmounts {
  return { co2Tonnes: 0, ch4Tonnes: 0, n2oTonnes: 0, co2eTonnes: 0, biogenicCO2Tonnes: 0 }
}

/** Add `src` into `target` in place. */
export function addGas(target: GasAmounts, src: GasAmounts): void {
  target.co2Tonnes += src.co2Tonnes
  target.ch4Tonnes += src.ch4Tonnes
  target.n2oTonnes += src.n2oTonnes
  target.co2eTonnes += src.co2eTonnes
  target.biogenicCO2Tonnes += src.biogenicCO2Tonnes
}

/** Scale every component (used for equity-share consolidation). */
export function scaleGas(g: GasAmounts, factor: number): GasAmounts {
  return {
    co2Tonnes: g.co2Tonnes * factor,
    ch4Tonnes: g.ch4Tonnes * factor,
    n2oTonnes: g.n2oTonnes * factor,
    co2eTonnes: g.co2eTonnes * factor,
    biogenicCO2Tonnes: g.biogenicCO2Tonnes * factor,
  }
}

/** Round every component for presentation without losing audit precision. */
export function roundGas(g: GasAmounts, dp = 4): GasAmounts {
  return {
    co2Tonnes: round(g.co2Tonnes, dp),
    ch4Tonnes: round(g.ch4Tonnes, dp),
    n2oTonnes: round(g.n2oTonnes, dp),
    co2eTonnes: round(g.co2eTonnes, dp),
    biogenicCO2Tonnes: round(g.biogenicCO2Tonnes, dp),
  }
}
