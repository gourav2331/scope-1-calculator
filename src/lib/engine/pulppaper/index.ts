/**
 * Public exports for the Pulp & Paper Scope 1 pack.
 * The deterministic engine in this folder is the source of truth — it is fully
 * unit-tested against the worked examples in the methodology research brief
 * (ICFPA/NCASI v1.4 + IPCC 2006 + AR5/AR6 GWPs).
 */

export { calculatePulpPaper } from './calculate'
export {
  METHODOLOGY_PACK as PULPPAPER_METHODOLOGY_PACK,
  PULPPAPER_GWP,
  PULPPAPER_CONSTANT_FACTORS,
  PULPPAPER_FUEL_DEFAULTS,
  PULPPAPER_BIOMASS_DEFAULTS,
  PULPPAPER_MOBILE_DEFAULTS,
  PP_STATIONARY_TECH_DEFAULTS,
  PP_BIOMASS_TECH_DEFAULTS,
  LIME_KILN_FACTORS,
  MAKEUP_CARBONATE_FACTORS,
  HFC_GWP_AR6,
  LANDFILL_DEFAULTS,
  WWT_DEFAULTS,
  CHP_DEFAULTS,
  sharedGwpSetFor,
} from './constants'
export type { PulpPaperGwpSet } from './constants'
export { resolveGwp, ch4ToCO2e, n2oToCO2e } from './gwp'
export { emptyGas, addGas, scaleGas, roundGas } from './helpers'
export * from './types'
