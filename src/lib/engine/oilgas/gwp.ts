/**
 * Horizon-aware GWP resolution for the Oil & Gas pack. Methane has separate
 * fossil and biogenic values, and the inventory may be reported on the 100-year
 * or 20-year horizon (the latter materially raises methane's weight).
 */

import { OILGAS_GWP, type OilGasGwpSet } from './constants'

export interface OilGasGwp {
  set: OilGasGwpSet
  CO2: number
  CH4_FOSSIL: number
  CH4_BIOGENIC: number
  N2O: number
}

export function resolveGwp(set: OilGasGwpSet): OilGasGwp {
  return { set, ...OILGAS_GWP[set] }
}

/** CH4 mass (tonnes) -> CO2e (tonnes). Biogenic methane still counts in Scope 1. */
export function ch4ToCO2e(ch4Tonnes: number, gwp: OilGasGwp, biogenic = false): number {
  return ch4Tonnes * (biogenic ? gwp.CH4_BIOGENIC : gwp.CH4_FOSSIL)
}

/** N2O mass (tonnes) -> CO2e (tonnes). */
export function n2oToCO2e(n2oTonnes: number, gwp: OilGasGwp): number {
  return n2oTonnes * gwp.N2O
}
