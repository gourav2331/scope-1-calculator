/**
 * Public exports for the Iron & Steel Scope 1 pack.
 * Source of truth: the deterministic engine in this folder.
 *
 * Methodology stack: GHG Protocol Corporate + ISO 14064-1:2018 + ISO 14404
 * (1/2/3/4) + worldsteel CO2 Data Collection v11 (2024) + IPCC 2006 Vol 3
 * Ch 4 + 2019 Refinement, with regulatory overlays for EU ETS MRR, EU CBAM,
 * EPA Subpart Q, and India CCTS / Green Steel Notification.
 */

export {
  METHODOLOGY_PACK as IRONSTEEL_METHODOLOGY_PACK,
  IRONSTEEL_GWP,
  IRONSTEEL_CONSTANT_FACTORS,
  IRONSTEEL_FUEL_DEFAULTS,
  IRONSTEEL_BIOMASS_DEFAULTS,
  IRONSTEEL_MOBILE_DEFAULTS,
  IS_STATIONARY_TECH_DEFAULTS,
  CARBONATE_CALCINATION_FACTORS,
  PROCESS_TIER1_EF,
  MATERIAL_CARBON_FRAC,
  HFC_GWP_AR6,
  SF6_LEAK_RATES,
  PROCESS_GAS_CARBON,
  FLARE_DRE_DEFAULTS,
  INDIA_NATCOM_OVERRIDES,
  sharedGwpSetFor,
} from './constants'
export type { IronSteelGwpSet } from './constants'
export { resolveGwp, ch4ToCO2e, n2oToCO2e, sf6ToCO2e } from './gwp'
export { emptyGas, addGas, scaleGas, roundGas } from './helpers'
export * from './types'
export { calculateIronSteel } from './calculate'
