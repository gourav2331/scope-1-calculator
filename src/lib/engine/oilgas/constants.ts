/**
 * Seed factor library and constants for the Oil & Gas Scope 1 methodology pack.
 *
 * Sources: IPIECA/IOGP/API Petroleum Industry GHG Guidelines (4th ed., 2023),
 * the API Compendium (2021), US EPA GHGRP Subpart W, and the IPCC 2006
 * Guidelines (refined 2019). Every value here is a *default*: it carries a
 * source + version + priority rank, is recorded in the factor snapshot of every
 * calculation, and can be overridden by the user with a reason.
 *
 * Priority ranks (shared with the cement pack):
 *   1 plant-specific, 2 supplier-specific, 3 official national/regional,
 *   4 sector methodology default, 5 international default, 6 user estimate.
 *
 * Two deliberate decisions, mirroring the cement pack's "use the citable
 * primary value, document where it differs from the source doc":
 *   - Methane is a PRIMARY Scope 1 gas in O&G (not a CO2-only addendum as in
 *     CSI cement). Gross Scope 1 is full CO2e across CO2 + CH4 + N2O.
 *   - The reference document quotes both a molar volume (23.685 L/mol at 15 C)
 *     and a pure-methane density (0.657 kg/Sm3) in Appendix A.3. These are not
 *     perfectly self-consistent (0.657 implies ~24.4 L/mol). We keep BOTH as
 *     the documented defaults because each is the basis of a different worked
 *     example, and both are overridable so a user can harmonise to one standard
 *     condition. Venting/fugitive mass uses the density constants; flaring's
 *     carbon-combustion route uses the molar-volume constant.
 */

import type { FactorDefault, FuelDefault } from '../constants'

export const METHODOLOGY_PACK = 'IPIECA_API_OG_2023'

/* ------------------------------------------------------------------ */
/* Global Warming Potentials (Appendix A.2)                            */
/* ------------------------------------------------------------------ */

/**
 * O&G supports both 100-year and 20-year horizons because methane dominates
 * the sector and the 20-year view materially changes abatement priorities.
 * CH4 has separate fossil vs biogenic values (fossil CH4 oxidises to CO2,
 * adding to its forcing). Source: IPCC AR6 WG1 Ch.7 Table 7.15; AR5 Ch.8.
 */
export type OilGasGwpSet = 'AR5_100' | 'AR6_100' | 'AR6_20'

export interface OilGasGwpValues {
  CO2: number
  CH4_FOSSIL: number
  CH4_BIOGENIC: number
  N2O: number
}

export const OILGAS_GWP: Record<OilGasGwpSet, OilGasGwpValues> = {
  AR5_100: { CO2: 1, CH4_FOSSIL: 30, CH4_BIOGENIC: 28, N2O: 265 },
  AR6_100: { CO2: 1, CH4_FOSSIL: 29.8, CH4_BIOGENIC: 27.0, N2O: 273 },
  AR6_20: { CO2: 1, CH4_FOSSIL: 82.5, CH4_BIOGENIC: 79.7, N2O: 273 },
}

/** Map an O&G GWP set to the shared AR5/AR6 100-yr basis used by reusable
 * cement primitives (refrigerant CO2e via the gas library). HFC GWPs are
 * conventionally quoted on the 100-year horizon regardless of the CH4 horizon
 * chosen for the inventory. */
export function sharedGwpSetFor(set: OilGasGwpSet): 'AR5' | 'AR6' {
  return set === 'AR5_100' ? 'AR5' : 'AR6'
}

/* ------------------------------------------------------------------ */
/* Named constant factors                                              */
/* ------------------------------------------------------------------ */

export const OILGAS_CONSTANT_FACTORS: Record<string, FactorDefault> = {
  CO2_PER_C: {
    factorCode: 'CO2_PER_C',
    factorName: 'CO2 per carbon (44/12 IPCC convention)',
    value: 44 / 12,
    unit: 'tCO2/tC',
    source: 'IPCC 2006 stoichiometric convention (44/12)',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  MOL_CO2_MASS: {
    factorCode: 'MOL_CO2_MASS',
    factorName: 'Molar mass of CO2',
    value: 44.01,
    unit: 'g/mol',
    source: 'IUPAC atomic masses',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  MOL_PER_SM3: {
    factorCode: 'MOL_PER_SM3',
    factorName: 'Moles of ideal gas per standard cubic metre (15 C, 101.325 kPa)',
    // 1000 L/Sm3 / 23.685 L/mol = 42.2208 mol/Sm3
    value: 1000 / 23.685,
    unit: 'mol/Sm3',
    source: 'O&G Appendix A.3 molar volume 23.685 L/mol (ideal gas, 15 C)',
    sourceVersion: 'IPIECA-aligned',
    factorYear: null,
    priorityRank: 5,
    isDefault: true,
  },
  CH4_DENSITY_SM3: {
    factorCode: 'CH4_DENSITY_SM3',
    factorName: 'Density of methane (pure CH4) at standard conditions',
    value: 0.657,
    unit: 'kg/Sm3',
    source: 'O&G Appendix A.3 (density of natural gas, pure CH4 at STP)',
    sourceVersion: 'IPIECA-aligned',
    factorYear: null,
    priorityRank: 5,
    isDefault: true,
  },
  CO2_DENSITY_SM3: {
    factorCode: 'CO2_DENSITY_SM3',
    factorName: 'Density of CO2 at standard conditions',
    value: 1.842,
    unit: 'kg/Sm3',
    source: 'O&G Appendix A.3 (density of CO2 at STP)',
    sourceVersion: 'IPIECA-aligned',
    factorYear: null,
    priorityRank: 5,
    isDefault: true,
  },
  FLARE_DRE_DEFAULT: {
    factorCode: 'FLARE_DRE_DEFAULT',
    factorName: 'Default flare destruction & removal efficiency (lit, in spec)',
    value: 0.98,
    unit: 'fraction',
    source: 'IPIECA / API Compendium default flare DRE',
    sourceVersion: '2021/2023',
    factorYear: 2021,
    priorityRank: 4,
    isDefault: true,
  },
  INDIA_GRID_EF: {
    factorCode: 'INDIA_GRID_EF',
    factorName: 'India grid electricity emission factor (location-based, supporting Scope 2)',
    value: 0.71,
    unit: 'tCO2/MWh',
    source: 'CEA CO2 Baseline Database for the Indian Power Sector',
    sourceVersion: 'v19',
    factorYear: 2024,
    priorityRank: 3,
    isDefault: true,
  },
}

/**
 * Default DRE by flare type / operating status (V1 Section 4.3). Used to seed
 * the flare default; the user can override per source. Unlit flares are treated
 * as venting (0% destruction) by the flaring module.
 */
export const FLARE_DRE_BY_TYPE: Record<string, number> = {
  steam_assisted_lit: 0.98,
  air_assisted_lit: 0.98,
  enclosed_ground: 0.995,
  unassisted_lit: 0.96,
  smoking: 0.8,
  unstable: 0.85,
  unlit: 0,
  acid_gas: 0.98,
  emergency_relief: 0.98,
}

/* ------------------------------------------------------------------ */
/* Stationary / mobile fuels (Appendix A.1, IPCC 2006 refined 2019)    */
/* ------------------------------------------------------------------ */

/**
 * NCV in Appendix A.1 is given in TJ/Gg (== GJ/tonne) and CO2 EF in tCO2/TJ
 * (== kgCO2/GJ). For gaseous/liquid fuels normally metered by volume we convert
 * NCV to GJ per the stated unit using a documented density assumption; users
 * routinely override LHV with their own measured calorific value. CH4/N2O are
 * given in kg/TJ in the appendix (== 0.001 kg/GJ).
 */
export const OILGAS_FUEL_DEFAULTS: Record<string, FuelDefault> = {
  natural_gas: {
    fuelCode: 'natural_gas',
    name: 'Natural gas (sales/fuel gas)',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'Sm3',
    // 48.0 GJ/t at ~0.80 kg/Sm3 sales gas => ~0.0383 GJ/Sm3 (within 35-42 MJ/Sm3)
    lhvGjPerUnit: 0.0383,
    co2EfKgPerGj: 56.1,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0001,
    source: 'IPCC 2006 Vol 2 Table 1.4 / O&G Appendix A.1 (natural gas)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  refinery_fuel_gas: {
    fuelCode: 'refinery_fuel_gas',
    name: 'Refinery fuel gas',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'Sm3',
    lhvGjPerUnit: 0.0395,
    co2EfKgPerGj: 57.6,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0001,
    source: 'O&G Appendix A.1 (refinery fuel gas)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  diesel: {
    fuelCode: 'diesel',
    name: 'Diesel / gas oil',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'L',
    // 43.0 GJ/t at 0.84 kg/L => 0.03612 GJ/L
    lhvGjPerUnit: 0.03612,
    co2EfKgPerGj: 74.1,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'IPCC 2006 Vol 2 Table 1.4 / O&G Appendix A.1 (gas/diesel oil)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  heavy_fuel_oil: {
    fuelCode: 'heavy_fuel_oil',
    name: 'Heavy / residual fuel oil',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 40.4,
    co2EfKgPerGj: 77.4,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'O&G Appendix A.1 (residual fuel oil)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  lpg: {
    fuelCode: 'lpg',
    name: 'LPG',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 47.3,
    co2EfKgPerGj: 63.1,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0001,
    source: 'O&G Appendix A.1 (LPG)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  petcoke: {
    fuelCode: 'petcoke',
    name: 'Petroleum coke',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 32.5,
    co2EfKgPerGj: 97.5,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'O&G Appendix A.1 (petroleum coke)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  coal_bituminous: {
    fuelCode: 'coal_bituminous',
    name: 'Coal (bituminous)',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 25.8,
    co2EfKgPerGj: 94.6,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0015,
    source: 'O&G Appendix A.1 (bituminous coal)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  crude_oil: {
    fuelCode: 'crude_oil',
    name: 'Crude oil',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 42.3,
    co2EfKgPerGj: 73.3,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'O&G Appendix A.1 (crude oil)',
    sourceVersion: '2006/2019',
    factorYear: 2019,
  },
  motor_gasoline: {
    fuelCode: 'motor_gasoline',
    name: 'Motor gasoline (fleet)',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'L',
    // 44.3 GJ/t at 0.74 kg/L => 0.03278 GJ/L
    lhvGjPerUnit: 0.03278,
    co2EfKgPerGj: 69.3,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.0033,
    n2oEfKgPerGj: 0.0032,
    source: 'IPCC 2006 Vol 2 Table 1.4 (motor gasoline)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  jet_kerosene: {
    fuelCode: 'jet_kerosene',
    name: 'Jet kerosene (Jet A-1, helicopters)',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'L',
    // 44.1 GJ/t at 0.80 kg/L => 0.03528 GJ/L
    lhvGjPerUnit: 0.03528,
    co2EfKgPerGj: 71.5,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.0005,
    n2oEfKgPerGj: 0.002,
    source: 'IPCC 2006 Vol 2 Table 1.4 (jet kerosene)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  biodiesel: {
    fuelCode: 'biodiesel',
    name: 'Biodiesel (FAME, biogenic component)',
    category: 'BIOMASS',
    defaultUnit: 'L',
    lhvGjPerUnit: 0.033,
    // Biogenic CO2 (reported as a memo item, never inside gross Scope 1).
    co2EfKgPerGj: 75.8,
    biomassFraction: 1,
    ch4EfKgPerGj: 0.0027,
    n2oEfKgPerGj: 0.0042,
    source: 'IPCC 2006 (liquid biofuels) — biogenic CO2 reported separately',
    sourceVersion: '2006',
    factorYear: 2006,
  },
}

/* ------------------------------------------------------------------ */
/* Fugitive component-count emission factors (EPA Subpart W Table W-1A)*/
/* ------------------------------------------------------------------ */

export interface ComponentEfDefault {
  componentCode: string
  name: string
  /** Average leak rate, kg CH4 per hour per source, gas service unless noted. */
  kgCh4PerHrPerSource: number
  source: string
  sourceVersion: string
}

export const COMPONENT_EF_DEFAULTS: Record<string, ComponentEfDefault> = {
  valve_gas: {
    componentCode: 'valve_gas',
    name: 'Valve (gas service)',
    kgCh4PerHrPerSource: 0.0029,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  valve_light_liquid: {
    componentCode: 'valve_light_liquid',
    name: 'Valve (light-liquid service)',
    kgCh4PerHrPerSource: 0.0048,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  flange_connector: {
    componentCode: 'flange_connector',
    name: 'Flange / connector',
    kgCh4PerHrPerSource: 0.00038,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  pump_seal: {
    componentCode: 'pump_seal',
    name: 'Pump seal (light liquid)',
    kgCh4PerHrPerSource: 0.0024,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  open_ended_line: {
    componentCode: 'open_ended_line',
    name: 'Open-ended line',
    kgCh4PerHrPerSource: 0.002,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  pressure_relief_valve: {
    componentCode: 'pressure_relief_valve',
    name: 'Pressure-relief valve / device',
    kgCh4PerHrPerSource: 0.2,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
  compressor_seal: {
    componentCode: 'compressor_seal',
    name: 'Compressor seal',
    kgCh4PerHrPerSource: 0.5,
    source: 'US EPA GHGRP Subpart W Table W-1A',
    sourceVersion: '40 CFR 98',
  },
}

export const DEFAULT_OPERATING_HOURS_YR = 8760

/* ------------------------------------------------------------------ */
/* Process unit default factors (V1 Section 4.6 / 8.5)                 */
/* ------------------------------------------------------------------ */

export const PROCESS_FACTORS: Record<string, FactorDefault> = {
  SMR_GREY_H2_EF: {
    factorCode: 'SMR_GREY_H2_EF',
    factorName: 'Steam methane reformer grey hydrogen CO2 intensity (process + fuel)',
    value: 7.69,
    unit: 'tCO2/t_H2',
    source: 'API Compendium / IPIECA SMR benchmark (grey H2, process + combustion)',
    sourceVersion: '2021/2023',
    factorYear: 2021,
    priorityRank: 4,
    isDefault: true,
  },
  FCC_COKE_CARBON_FRACTION: {
    factorCode: 'FCC_COKE_CARBON_FRACTION',
    factorName: 'FCC catalyst coke carbon fraction',
    value: 0.94,
    unit: 'tC/t_coke',
    source: 'API Compendium (FCC coke combustion, typical carbon content)',
    sourceVersion: '2021',
    factorYear: 2021,
    priorityRank: 4,
    isDefault: true,
  },
}
