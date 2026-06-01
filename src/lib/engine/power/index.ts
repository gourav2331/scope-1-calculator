/**
 * Public exports for the Power Sector Scope 1 pack (thermal generators MVP).
 *
 * Methodology stack: GHG Protocol Corporate + ISO 14064-1:2018 + IPCC 2006
 * Vol 2 Ch 2 (stationary) + Ch 3 (mobile) + Vol 3 Ch 7 (HFC) + 2019 Refinement,
 * with regulatory overlays for EU ETS MRR, US EPA GHGRP Subparts A/C/D/DD,
 * India CEA v21, BRSR, IFRS S2, SASB IF-EU, GRI 305, CDP, SBTi Power.
 */

export {
  METHODOLOGY_PACK as POWER_METHODOLOGY_PACK,
  POWER_GWP,
  POWER_CONSTANT_FACTORS,
  POWER_FUEL_DEFAULTS,
  POWER_MOBILE_DEFAULTS,
  POWER_STATIONARY_TECH_DEFAULTS,
  HFC_GWP_AR6,
  SF6_LEAK_RATES,
  FUGITIVE_CH4_DEFAULTS,
  INDIA_NATCOM_OVERRIDES,
  PROCESS_STOICH,
  PROCESS_PURITY_DEFAULTS,
  CHP_DEFAULTS,
  INDIA_GRID_EF_TCO2_PER_MWH,
  US_AVG_GRID_EF_TCO2_PER_MWH,
  EU_AVG_GRID_EF_TCO2_PER_MWH,
  sharedGwpSetFor,
} from './constants'
export type { PowerGwpSet } from './constants'
export { ch4ToCO2e, n2oToCO2e, sf6ToCO2e, nf3ToCO2e } from './gwp'
export { emptyGas, addGas, scaleGas, roundGas } from './helpers'
export * from './types'
export { calculatePower } from './calculate'
