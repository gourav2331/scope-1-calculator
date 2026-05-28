/**
 * Horizon-aware GWP for the Pulp & Paper pack.
 *
 * Four sets are supported: AR4_100 (legacy ICFPA v1.3a), AR5_100 (ICFPA v1.4),
 * AR6_100 (DEFAULT for new inventories), AR6_20 (methane-emphasising horizon).
 * CH4 fossil and biogenic have different values in AR5+ — both matter in P&P
 * because biomass CH4 is in Scope 1 (only the CO2 is the memo line).
 */

import { PULPPAPER_GWP, type PulpPaperGwpSet } from './constants'

export interface PulpPaperGwp {
  set: PulpPaperGwpSet
  CO2: number
  CH4_FOSSIL: number
  CH4_BIOGENIC: number
  N2O: number
}

export function resolveGwp(set: PulpPaperGwpSet): PulpPaperGwp {
  const g = PULPPAPER_GWP[set]
  return {
    set,
    CO2: g.co2,
    CH4_FOSSIL: g.ch4Fossil,
    CH4_BIOGENIC: g.ch4Biogenic,
    N2O: g.n2o,
  }
}

/** CH4 mass (tonnes) → CO2e (tonnes). Biogenic CH4 still counts in Scope 1. */
export function ch4ToCO2e(ch4Tonnes: number, gwp: PulpPaperGwp, biogenic = false): number {
  return ch4Tonnes * (biogenic ? gwp.CH4_BIOGENIC : gwp.CH4_FOSSIL)
}

/** N2O mass (tonnes) → CO2e (tonnes). Same value across fossil / biogenic. */
export function n2oToCO2e(n2oTonnes: number, gwp: PulpPaperGwp): number {
  return n2oTonnes * gwp.N2O
}
