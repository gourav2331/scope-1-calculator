/**
 * Seed factor library and constants for the cement methodology pack.
 *
 * Every value here is a *default*. The spec forbids hidden hardcoded factors:
 * each one carries source + version + priority rank, is recorded in the factor
 * snapshot of every calculation, and can be overridden by the user with a
 * reason (the customisation requirement).
 *
 * Priority ranks (spec section 10):
 *   1 plant-specific, 2 supplier-specific, 3 official national/regional,
 *   4 sector methodology default, 5 international default, 6 user estimate.
 *
 * Numbers cross-checked against the IPCC 2006 Guidelines (Vol 2 Table 1.4 /
 * Vol 3 cement) and the CSI Cement CO2 Protocol v2.0. Where the ChatGPT spec
 * differed from the citable primary source, the primary source value is used
 * and the source string says so.
 */

import type { GwpSet } from './types'

export const METHODOLOGY_PACK = 'CSI_CEMENT_PROTOCOL_V2'

export interface FactorDefault {
  factorCode: string
  factorName: string
  value: number
  unit: string
  source: string
  sourceVersion: string
  factorYear: number | null
  priorityRank: number
  isDefault: boolean
}

export const CONSTANT_FACTORS: Record<string, FactorDefault> = {
  CSI_DEFAULT_CLINKER_EF: {
    factorCode: 'CSI_DEFAULT_CLINKER_EF',
    factorName: 'CSI default clinker emission factor',
    value: 0.525,
    unit: 'tCO2/t_clinker',
    source: 'CSI Cement CO2 Protocol',
    sourceVersion: 'v2.0',
    factorYear: 2011,
    priorityRank: 4,
    isDefault: true,
  },
  IPCC_DEFAULT_CLINKER_EF: {
    factorCode: 'IPCC_DEFAULT_CLINKER_EF',
    factorName: 'IPCC default clinker emission factor (0.785 x 0.65 CaO)',
    value: 0.51,
    unit: 'tCO2/t_clinker',
    source: 'IPCC 2006 Guidelines Vol 3 Ch 2 (default 65% CaO)',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 5,
    isDefault: true,
  },
  CO2_PER_CAO: {
    factorCode: 'CO2_PER_CAO',
    factorName: 'Stoichiometric CO2 per CaO (44.01 / 56.08)',
    value: 0.785,
    unit: 'tCO2/tCaO',
    source: 'Stoichiometry (molar mass CO2 / CaO)',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  CO2_PER_MGO: {
    factorCode: 'CO2_PER_MGO',
    factorName: 'Stoichiometric CO2 per MgO (44.01 / 40.30)',
    value: 1.092,
    unit: 'tCO2/tMgO',
    source: 'Stoichiometry (molar mass CO2 / MgO)',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  CO2_PER_C: {
    factorCode: 'CO2_PER_C',
    factorName: 'CO2 per carbon (44/12 IPCC/CSI convention)',
    value: 44 / 12,
    unit: 'tCO2/tC',
    source: 'IPCC 2006 / CSI Cement CO2 Protocol convention (44/12)',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  BOUGHT_CLINKER_EF: {
    factorCode: 'BOUGHT_CLINKER_EF',
    factorName: 'Bought (external) clinker emission factor',
    value: 862,
    unit: 'kgCO2/t_clinker',
    source: 'CSI Cement CO2 Protocol default for purchased clinker',
    sourceVersion: 'v2.0',
    factorYear: 2011,
    priorityRank: 4,
    isDefault: true,
  },
  RAW_MEAL_TO_CLINKER_RATIO: {
    factorCode: 'RAW_MEAL_TO_CLINKER_RATIO',
    factorName: 'Default raw meal to clinker ratio',
    value: 1.55,
    unit: 't_raw_meal/t_clinker',
    source: 'CSI Cement CO2 Protocol default',
    sourceVersion: 'v2.0',
    factorYear: 2011,
    priorityRank: 4,
    isDefault: true,
  },
  TOC_FRACTION: {
    factorCode: 'TOC_FRACTION',
    factorName: 'Default total organic carbon fraction of raw meal',
    value: 0.002,
    unit: 'fraction',
    source: 'CSI Cement CO2 Protocol default',
    sourceVersion: 'v2.0',
    factorYear: 2011,
    priorityRank: 4,
    isDefault: true,
  },
  CKD_CALCINATION_RATE_DEFAULT: {
    factorCode: 'CKD_CALCINATION_RATE_DEFAULT',
    factorName: 'Default CKD calcination rate (fully calcined)',
    value: 1,
    unit: 'fraction',
    source: 'CSI Cement CO2 Protocol default',
    sourceVersion: 'v2.0',
    factorYear: 2011,
    priorityRank: 4,
    isDefault: true,
  },
  DUST_FALLBACK_PERCENT: {
    factorCode: 'DUST_FALLBACK_PERCENT',
    factorName: 'IPCC dust correction fallback (+2% of calcination CO2)',
    value: 0.02,
    unit: 'fraction_of_clinker_calcination_co2',
    source: 'IPCC 2006 Guidelines default CKD correction factor (1.02)',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 5,
    isDefault: true,
  },
  INDIA_GRID_EF: {
    factorCode: 'INDIA_GRID_EF',
    factorName: 'India grid electricity emission factor (location-based)',
    value: 0.71,
    unit: 'tCO2/MWh',
    source: 'CEA CO2 Baseline Database for the Indian Power Sector',
    sourceVersion: 'v19',
    factorYear: 2024,
    priorityRank: 3,
    isDefault: true,
  },
}

export interface FuelDefault {
  fuelCode: string
  name: string
  category: 'CONVENTIONAL_FOSSIL' | 'ALTERNATIVE_FOSSIL' | 'BIOMASS' | 'MIXED'
  defaultUnit: string
  lhvGjPerUnit: number
  co2EfKgPerGj: number
  /** Fraction of carbon that is biogenic (memo). null/undefined => 0 for fossil. */
  biomassFraction: number
  ch4EfKgPerGj: number
  n2oEfKgPerGj: number
  source: string
  sourceVersion: string
  factorYear: number
}

/**
 * Default fuel parameters. LHV (net calorific value) and CO2 EFs from IPCC
 * 2006 Vol 2 Table 1.4 / Vol 2 Ch 1 default NCVs unless the fuel is a cement
 * alternative fuel, in which case the CSI Protocol value is used.
 */
export const FUEL_DEFAULTS: Record<string, FuelDefault> = {
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
    source: 'IPCC 2006 Vol 2 Table 1.4 (other bituminous coal)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  petcoke: {
    fuelCode: 'petcoke',
    name: 'Petroleum coke',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 32.5,
    co2EfKgPerGj: 97.5,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0015,
    source: 'IPCC 2006 Vol 2 Table 1.4 (petroleum coke)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  lignite: {
    fuelCode: 'lignite',
    name: 'Lignite',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 11.9,
    co2EfKgPerGj: 101,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0015,
    source: 'IPCC 2006 Vol 2 Table 1.4 (lignite)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  natural_gas: {
    fuelCode: 'natural_gas',
    name: 'Natural gas',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'Sm3',
    lhvGjPerUnit: 0.0373,
    co2EfKgPerGj: 56.1,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.001,
    n2oEfKgPerGj: 0.0001,
    source: 'IPCC 2006 Vol 2 Table 1.4 (natural gas)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  diesel: {
    fuelCode: 'diesel',
    name: 'Diesel / gas oil',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'L',
    lhvGjPerUnit: 0.0358,
    co2EfKgPerGj: 74.1,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.0039,
    n2oEfKgPerGj: 0.0039,
    source: 'IPCC 2006 Vol 2 Table 1.4 (gas/diesel oil)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  heavy_fuel_oil: {
    fuelCode: 'heavy_fuel_oil',
    name: 'Heavy fuel oil',
    category: 'CONVENTIONAL_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 40.4,
    co2EfKgPerGj: 77.4,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'IPCC 2006 Vol 2 Table 1.4 (residual fuel oil)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  waste_oil: {
    fuelCode: 'waste_oil',
    name: 'Waste oil',
    category: 'ALTERNATIVE_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 40.2,
    co2EfKgPerGj: 73.3,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.003,
    n2oEfKgPerGj: 0.0006,
    source: 'IPCC 2006 Vol 2 Table 1.4 (waste oils)',
    sourceVersion: '2006',
    factorYear: 2006,
  },
  tyres: {
    fuelCode: 'tyres',
    name: 'Used tyres',
    category: 'MIXED',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 28,
    co2EfKgPerGj: 85,
    biomassFraction: 0.27,
    ch4EfKgPerGj: 0.002,
    n2oEfKgPerGj: 0.0006,
    source: 'CSI Cement CO2 Protocol alternative fuel default (tyres, ~27% biomass)',
    sourceVersion: 'v2.0',
    factorYear: 2011,
  },
  waste_plastics: {
    fuelCode: 'waste_plastics',
    name: 'Waste plastics',
    category: 'ALTERNATIVE_FOSSIL',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 30,
    co2EfKgPerGj: 75,
    biomassFraction: 0,
    ch4EfKgPerGj: 0.002,
    n2oEfKgPerGj: 0.0006,
    source: 'CSI Cement CO2 Protocol alternative fuel default (plastics)',
    sourceVersion: 'v2.0',
    factorYear: 2011,
  },
  mixed_industrial_waste: {
    fuelCode: 'mixed_industrial_waste',
    name: 'Mixed industrial waste (RDF)',
    category: 'MIXED',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 18,
    co2EfKgPerGj: 83,
    biomassFraction: 0.5,
    ch4EfKgPerGj: 0.002,
    n2oEfKgPerGj: 0.0006,
    source: 'CSI Cement CO2 Protocol alternative fuel default (mixed industrial waste, ~50% biomass)',
    sourceVersion: 'v2.0',
    factorYear: 2011,
  },
  solid_biomass: {
    fuelCode: 'solid_biomass',
    name: 'Solid biomass (wood / agri residue)',
    category: 'BIOMASS',
    defaultUnit: 'tonne',
    lhvGjPerUnit: 11.6,
    co2EfKgPerGj: 112,
    biomassFraction: 1,
    ch4EfKgPerGj: 0.03,
    n2oEfKgPerGj: 0.004,
    source: 'IPCC 2006 Vol 2 Table 1.4 (wood/wood waste) - biogenic CO2 is a memo item',
    sourceVersion: '2006',
    factorYear: 2006,
  },
}

export const GWP: Record<GwpSet, { CO2: number; CH4: number; N2O: number }> = {
  AR5: { CO2: 1, CH4: 28, N2O: 265 },
  AR6: { CO2: 1, CH4: 27, N2O: 273 },
}

export interface GasDefault {
  gasCode: string
  name: string
  gwpAR5: number
  gwpAR6: number
  source: string
  sourceVersion: string
}

/**
 * Fugitive gases (refrigerant leakage, SF6 from switchgear). 100-year GWPs
 * from the IPCC Fifth (AR5) and Sixth (AR6) Assessment Reports.
 */
export const GAS_DEFAULTS: Record<string, GasDefault> = {
  r22: { gasCode: 'r22', name: 'R-22 (HCFC-22)', gwpAR5: 1760, gwpAR6: 1960, source: 'IPCC AR5/AR6 100-yr GWP', sourceVersion: 'AR5/AR6' },
  r32: { gasCode: 'r32', name: 'R-32 (HFC-32)', gwpAR5: 677, gwpAR6: 771, source: 'IPCC AR5/AR6 100-yr GWP', sourceVersion: 'AR5/AR6' },
  r134a: { gasCode: 'r134a', name: 'R-134a (HFC-134a)', gwpAR5: 1300, gwpAR6: 1530, source: 'IPCC AR5/AR6 100-yr GWP', sourceVersion: 'AR5/AR6' },
  r404a: { gasCode: 'r404a', name: 'R-404A', gwpAR5: 3943, gwpAR6: 4728, source: 'IPCC AR5/AR6 100-yr GWP (blend)', sourceVersion: 'AR5/AR6' },
  r407c: { gasCode: 'r407c', name: 'R-407C', gwpAR5: 1624, gwpAR6: 1908, source: 'IPCC AR5/AR6 100-yr GWP (blend)', sourceVersion: 'AR5/AR6' },
  r410a: { gasCode: 'r410a', name: 'R-410A', gwpAR5: 1924, gwpAR6: 2256, source: 'IPCC AR5/AR6 100-yr GWP (blend)', sourceVersion: 'AR5/AR6' },
  r507a: { gasCode: 'r507a', name: 'R-507A', gwpAR5: 3985, gwpAR6: 4727, source: 'IPCC AR5/AR6 100-yr GWP (blend)', sourceVersion: 'AR5/AR6' },
  r23: { gasCode: 'r23', name: 'R-23 (HFC-23)', gwpAR5: 12400, gwpAR6: 14600, source: 'IPCC AR5/AR6 100-yr GWP', sourceVersion: 'AR5/AR6' },
  sf6: { gasCode: 'sf6', name: 'SF6 (switchgear)', gwpAR5: 23500, gwpAR6: 24300, source: 'IPCC AR5/AR6 100-yr GWP', sourceVersion: 'AR5/AR6' },
}
