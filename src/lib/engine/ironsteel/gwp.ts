/**
 * Horizon-aware GWP for the Iron & Steel pack.
 * AR6_100 is the default (CSRD / ESRS E1 requirement).
 * AR6_20 is supported because methane materially shifts when the 20-year
 * horizon is chosen (fugitive CH4 from coal stockpiles + coke-oven seals).
 */

import { IRONSTEEL_GWP, type IronSteelGwpSet } from './constants'

export interface IronSteelGwp {
  set: IronSteelGwpSet
  CO2: number
  CH4_FOSSIL: number
  CH4_BIOGENIC: number
  N2O: number
  SF6: number
  NF3: number
}

export function resolveGwp(set: IronSteelGwpSet): IronSteelGwp {
  const g = IRONSTEEL_GWP[set]
  return {
    set,
    CO2: g.co2,
    CH4_FOSSIL: g.ch4Fossil,
    CH4_BIOGENIC: g.ch4Biogenic,
    N2O: g.n2o,
    SF6: g.sf6,
    NF3: g.nf3,
  }
}

export function ch4ToCO2e(ch4Tonnes: number, gwp: IronSteelGwp, biogenic = false): number {
  return ch4Tonnes * (biogenic ? gwp.CH4_BIOGENIC : gwp.CH4_FOSSIL)
}

export function n2oToCO2e(n2oTonnes: number, gwp: IronSteelGwp): number {
  return n2oTonnes * gwp.N2O
}

export function sf6ToCO2e(sf6Tonnes: number, gwp: IronSteelGwp): number {
  return sf6Tonnes * gwp.SF6
}
