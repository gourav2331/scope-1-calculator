/**
 * GWP helpers for the Power Scope 1 engine.
 * Treats fossil and biogenic CH4 separately (per IPCC AR6) since biomass
 * cofiring is a major MVP case for power.
 */

import { POWER_GWP, type PowerGwpSet } from './constants'

export type PowerGwp = PowerGwpSet

export function ch4ToCO2e(ch4Tonnes: number, gwpSet: PowerGwp, biogenic = false): number {
  const gwp = biogenic ? POWER_GWP[gwpSet].ch4Biogenic : POWER_GWP[gwpSet].ch4Fossil
  return ch4Tonnes * gwp
}

export function n2oToCO2e(n2oTonnes: number, gwpSet: PowerGwp): number {
  return n2oTonnes * POWER_GWP[gwpSet].n2o
}

export function sf6ToCO2e(sf6Tonnes: number, gwpSet: PowerGwp): number {
  return sf6Tonnes * POWER_GWP[gwpSet].sf6
}

export function nf3ToCO2e(nf3Tonnes: number, gwpSet: PowerGwp): number {
  return nf3Tonnes * POWER_GWP[gwpSet].nf3
}
