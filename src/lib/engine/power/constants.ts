/**
 * Power Sector Scope 1 — constants, factor defaults, GWPs.
 *
 * Primary methodology stack (per the research brief §17):
 *   1. GHG Protocol Corporate Standard + ISO 14064-1:2018 (organisational layer)
 *   2. IPCC 2006 Guidelines Vol 2 Ch 2 (Stationary Combustion) + 2019 Refinement
 *   3. IPCC 2006 Vol 2 Ch 3 (Mobile Combustion) + Vol 3 Ch 7 (Refrigeration/HFCs)
 *   4. EU ETS MRR (Reg 2018/2066 consolidated) + AVR (Reg 2018/2067)
 *   5. US EPA GHGRP 40 CFR Part 98 Subparts A, C, D, DD + Part 75 (Acid Rain)
 *   6. India CEA CO2 Baseline Database v21 (Nov–Dec 2025) + India NATCOM CEFs
 *   7. UK DEFRA-DESNZ Conversion Factors (annual)
 *   8. Disclosure: SASB IF-EU, IFRS S2, ESRS E1, GRI 305, CDP, BRSR
 *   9. Sector targets: SBTi Power Sector Standard / SDA (draft 2025–26)
 *
 * All emission factors are NCV/LHV basis. AR6 GWP100 is the default GWP set
 * (CSRD/ESRS E1 requirement). Methane GWP differentiates fossil vs biogenic
 * because biomass cofiring is a major MVP case.
 */

import type { FactorDefault } from '../constants'

export const METHODOLOGY_PACK = 'GHGPROTOCOL_IPCC2006_EUETSMRR_EPAPART98_CEA_V1'

/* ------------------------- Global Warming Potentials ----------------------- */

export type PowerGwpSet = 'AR5_100' | 'AR6_100' | 'AR6_20'

/**
 * GWPs from IPCC AR5 (2014) and AR6 (2021). Power covers SF6 prominently
 * (gas-insulated switchgear), and methane horizon swings change the methane-
 * abatement business case for coal-handling fugitives.
 */
export const POWER_GWP = {
  AR5_100: { co2: 1, ch4Fossil: 30,   ch4Biogenic: 28,   n2o: 265, sf6: 22_800, nf3: 17_200 },
  AR6_100: { co2: 1, ch4Fossil: 29.8, ch4Biogenic: 27.0, n2o: 273, sf6: 25_200, nf3: 17_400 }, // DEFAULT
  AR6_20:  { co2: 1, ch4Fossil: 82.5, ch4Biogenic: 79.7, n2o: 273, sf6: 25_200, nf3: 17_400 },
} as const

export function sharedGwpSetFor(p: PowerGwpSet): 'AR5' | 'AR6' {
  return p === 'AR5_100' ? 'AR5' : 'AR6'
}

/* ----------- HFC + PFC + other refrigerant GWPs (AR6 100-yr) -------------- */

/** HFC GWPs always use 100-yr AR6 regardless of CH4 horizon (industry convention). */
export const HFC_GWP_AR6: Record<string, number> = {
  r134a:   1530,
  r410a:   2256,
  r404a:   4728,
  r407c:   1907,
  r32:     771,
  r507a:   4605,
  r23:     14600,
  r125:    3740,
  r143a:   5810,
  r449a:   1400,
  r1234yf: 1, // <1, conservatively 1
}

/* ----------- Fossil fuel defaults (IPCC 2006 Vol 2 Ch 1, LHV basis) ------ */

export interface PowerFuelDefault {
  fuelCode: string
  label: string
  ncvGjPerUnit: number   // LHV / NCV per unit
  defaultUnit: string
  co2EfKgPerGj: number   // CO2 emission factor (kg CO2 / GJ LHV)
  origin: 'FOSSIL' | 'BIOMASS' | 'WASTE_MIXED'
  /** Default biomass fraction (0 = fossil, 1 = pure biomass, 0–1 for waste-derived). */
  biomassFraction: number
  source: string
}

/**
 * IPCC 2006 Tier-1 defaults + the most common coal ranks used at power plants.
 * Indian operators normally override coal CO2 EF with the India NATCOM CEF
 * (see INDIA_NATCOM_OVERRIDES below).
 */
export const POWER_FUEL_DEFAULTS: Record<string, PowerFuelDefault> = {
  natural_gas:         { fuelCode: 'natural_gas',         label: 'Natural gas (sales/fuel gas)',     ncvGjPerUnit: 0.0383,  defaultUnit: 'Sm3',   co2EfKgPerGj: 56.1,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 Vol 2 Ch 1 Tab 1.2 (natural gas)' },
  lng:                 { fuelCode: 'lng',                 label: 'LNG (regasified)',                 ncvGjPerUnit: 0.0494,  defaultUnit: 'kg',    co2EfKgPerGj: 56.1,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (natural gas as LNG)' },
  diesel:              { fuelCode: 'diesel',              label: 'Diesel oil / LDO / gas oil',       ncvGjPerUnit: 0.03612, defaultUnit: 'L',     co2EfKgPerGj: 74.1,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (gas/diesel oil)' },
  residual_oil:        { fuelCode: 'residual_oil',        label: 'Heavy fuel oil / HFO (residual)',  ncvGjPerUnit: 0.0404,  defaultUnit: 'L',     co2EfKgPerGj: 77.4,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (residual fuel oil)' },
  lpg:                 { fuelCode: 'lpg',                 label: 'LPG',                              ncvGjPerUnit: 47.3,    defaultUnit: 'tonne', co2EfKgPerGj: 63.1,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (LPG)' },
  bituminous_coal:     { fuelCode: 'bituminous_coal',     label: 'Bituminous coal (other)',          ncvGjPerUnit: 25.8,    defaultUnit: 'tonne', co2EfKgPerGj: 94.6,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (other bituminous coal)' },
  sub_bituminous_coal: { fuelCode: 'sub_bituminous_coal', label: 'Sub-bituminous coal',              ncvGjPerUnit: 18.9,    defaultUnit: 'tonne', co2EfKgPerGj: 96.1,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (sub-bituminous coal)' },
  lignite:             { fuelCode: 'lignite',             label: 'Lignite (brown coal)',             ncvGjPerUnit: 11.9,    defaultUnit: 'tonne', co2EfKgPerGj: 101.0, origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (lignite)' },
  anthracite:          { fuelCode: 'anthracite',          label: 'Anthracite coal',                  ncvGjPerUnit: 26.7,    defaultUnit: 'tonne', co2EfKgPerGj: 98.3,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (anthracite)' },
  petcoke:             { fuelCode: 'petcoke',             label: 'Petroleum coke',                   ncvGjPerUnit: 32.5,    defaultUnit: 'tonne', co2EfKgPerGj: 97.5,  origin: 'FOSSIL', biomassFraction: 0, source: 'IPCC 2006 (petroleum coke)' },
  // Biomass / co-firing fuels — CO2 to MEMO line, CH4/N2O to Scope 1
  wood_bark:           { fuelCode: 'wood_bark',           label: 'Wood chips / bark / hog fuel',     ncvGjPerUnit: 0.0156,  defaultUnit: 'tonne_dry', co2EfKgPerGj: 112,  origin: 'BIOMASS', biomassFraction: 1, source: 'IPCC 2006 (wood/wood waste) — biogenic CO2 reported separately' },
  agri_residue:        { fuelCode: 'agri_residue',        label: 'Agricultural residue (rice husk, bagasse, straw)', ncvGjPerUnit: 14, defaultUnit: 'tonne_dry', co2EfKgPerGj: 112, origin: 'BIOMASS', biomassFraction: 1, source: 'IPCC 2006 (other primary solid biomass)' },
  biogas:              { fuelCode: 'biogas',              label: 'Biogas / landfill gas',            ncvGjPerUnit: 0.020,   defaultUnit: 'Sm3',  co2EfKgPerGj: 54.6, origin: 'BIOMASS', biomassFraction: 1, source: 'IPCC 2006 (biogas)' },
  // Mixed / waste-derived (partial biomass)
  msw_rdf:             { fuelCode: 'msw_rdf',             label: 'Municipal solid waste / RDF',      ncvGjPerUnit: 11,      defaultUnit: 'tonne', co2EfKgPerGj: 91,    origin: 'WASTE_MIXED', biomassFraction: 0.50, source: 'IPCC 2006 — ~50% biomass fraction (varies regionally)' },
  industrial_waste:    { fuelCode: 'industrial_waste',    label: 'Mixed industrial waste',           ncvGjPerUnit: 18,      defaultUnit: 'tonne', co2EfKgPerGj: 83,    origin: 'WASTE_MIXED', biomassFraction: 0.30, source: 'IPCC 2006 (mixed industrial waste)' },
}

/** India NATCOM CEFs — official national overrides for coals at Indian power plants. */
export const INDIA_NATCOM_OVERRIDES: Record<string, { co2EfKgPerGj: number; source: string }> = {
  // CEA v21 (2025) authoritative — derived from MoEFCC NATCOM with ~120 coal samples
  bituminous_coal:     { co2EfKgPerGj: 95.81, source: 'India NATCOM / MoEFCC (non-coking coal CEF 26.1 tC/TJ)' },
  sub_bituminous_coal: { co2EfKgPerGj: 95.81, source: 'India NATCOM / MoEFCC' },
  lignite:             { co2EfKgPerGj: 106.51, source: 'India NATCOM / MoEFCC (lignite CEF 29.0 tC/TJ)' },
}

/* ---------- CH4 / N2O combustion factors by fuel × technology ------------ */

export interface PowerTechFactor { ch4EfKgPerGj: number; n2oEfKgPerGj: number; source: string }

/**
 * Stationary CH4/N2O factors — IPCC 2006 Vol 2 Ch 2 Tables 2.6–2.10 plus
 * 2019 Refinement. Technology-specific because non-CO2 emissions vary
 * dramatically with combustion technology (e.g. CFB N2O 10× pulverised).
 */
export const POWER_STATIONARY_TECH_DEFAULTS: Record<string, Record<string, PowerTechFactor>> = {
  natural_gas: {
    BOILER_LARGE:               { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 (NG large boiler)' },
    GAS_TURBINE_OCGT:           { ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 (gas turbine OCGT)' },
    GAS_TURBINE_CCGT:           { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 (CCGT HRSG)' },
    RECIPROCATING_ENGINE_LEAN:  { ch4EfKgPerGj: 0.597, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006 (NG 4-stroke lean) — major CH4 slip' },
    AUXILIARY_BOILER:           { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006' },
  },
  bituminous_coal: {
    PULVERIZED_DRY_WALL:        { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0005, source: 'IPCC 2006 (pulverised dry-bottom)' },
    PULVERIZED_DRY_TANGENTIAL:  { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006 (pulverised dry tangential)' },
    PULVERIZED_WET:             { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006 (pulverised wet-bottom)' },
    CFB:                        { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.061,  source: 'IPCC 2006 Vol 2 Ch 2 — CFB N2O 10× elevated' },
    BFB:                        { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.040,  source: 'IPCC 2006 (BFB)' },
    SPREADER_STOKER:            { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.0007, source: 'IPCC 2006 (spreader stoker)' },
    IGCC:                       { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 (IGCC syngas)' },
  },
  sub_bituminous_coal: {
    PULVERIZED_DRY_WALL:        { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0005, source: 'IPCC 2006' },
    CFB:                        { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.061,  source: 'IPCC 2006 (CFB)' },
  },
  lignite: {
    PULVERIZED_WET:             { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006 (lignite PC wet-bottom)' },
    CFB:                        { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.061,  source: 'IPCC 2006 (CFB)' },
  },
  anthracite: {
    PULVERIZED_DRY_WALL:        { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006' },
  },
  petcoke: {
    PULVERIZED_DRY_WALL:        { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006' },
    CFB:                        { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.061,  source: 'IPCC 2006 (CFB)' },
  },
  diesel: {
    BOILER:                     { ch4EfKgPerGj: 0.0002, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006 (gas oil boiler)' },
    EMERGENCY_GENSET:           { ch4EfKgPerGj: 0.003,  n2oEfKgPerGj: 0.0006, source: 'IPCC 2006 (diesel emergency genset)' },
    STARTUP_BURNER:             { ch4EfKgPerGj: 0.0002, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006' },
  },
  residual_oil: {
    BOILER:                     { ch4EfKgPerGj: 0.003,  n2oEfKgPerGj: 0.0003, source: 'IPCC 2006 (HFO boiler)' },
  },
  lpg:                          { BOILER: { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006 (LPG)' } },
  // Biomass technology factors — CO2 biogenic (memo); CH4/N2O Scope 1
  wood_bark: {
    STOKER_BOILER:              { ch4EfKgPerGj: 0.012, n2oEfKgPerGj: 0.004,  source: 'NCASI median (wood stoker)' },
    CFB:                        { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0088, source: 'IPCC 2006 / Fortum 2001 (biomass CFB)' },
    BFB:                        { ch4EfKgPerGj: 0.002, n2oEfKgPerGj: 0.002,  source: 'IPCC 2006 / Fortum 2001 (biomass BFB)' },
  },
  agri_residue: {
    STOKER_BOILER:              { ch4EfKgPerGj: 0.012, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006 (other primary solid biomass)' },
    CFB:                        { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0088, source: 'IPCC 2006 (biomass CFB)' },
  },
  biogas: {
    GAS_ENGINE:                 { ch4EfKgPerGj: 0.500, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006 / NCASI (biogas engine) — high CH4 slip' },
    BOILER:                     { ch4EfKgPerGj: 0.003, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 (biogas boiler)' },
  },
  msw_rdf: {
    STOKER_BOILER:              { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006 (MSW combustor)' },
    CFB:                        { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.061,  source: 'IPCC 2006 (MSW CFB)' },
  },
  industrial_waste: {
    BOILER:                     { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006 (industrial waste)' },
  },
}

/* ------------------- Mobile defaults (IPCC 2006 Vol 2 Ch 3) -------------- */

export interface PowerMobileDefault {
  vehicleCode: string
  label: string
  fuelCode: 'diesel' | 'gasoline' | 'lpg' | 'natural_gas'
  co2EfKgPerGj: number
  ch4EfKgPerGj: number
  n2oEfKgPerGj: number
  source: string
}

export const POWER_MOBILE_DEFAULTS: Record<string, PowerMobileDefault> = {
  DIESEL_HAUL:        { vehicleCode: 'DIESEL_HAUL',        label: 'Diesel — coal haul truck / off-road (captive mine)', fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.030, source: 'IPCC 2006 Vol 2 Ch 3 (off-road)' },
  DIESEL_LOCO:        { vehicleCode: 'DIESEL_LOCO',        label: 'Diesel — locomotive (coal yard)',                    fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.026, source: 'IPCC 2006 (rail diesel)' },
  DIESEL_LIGHT:       { vehicleCode: 'DIESEL_LIGHT',       label: 'Diesel — light vehicles / patrol',                   fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.005, n2oEfKgPerGj: 0.039, source: 'IPCC 2006 / EPA on-road' },
  LPG_FORKLIFT:       { vehicleCode: 'LPG_FORKLIFT',       label: 'LPG — forklift / yard equipment',                    fuelCode: 'lpg',         co2EfKgPerGj: 63.1, ch4EfKgPerGj: 0.062, n2oEfKgPerGj: 0.0002, source: 'IPCC 2006' },
  NATGAS_MOBILE:      { vehicleCode: 'NATGAS_MOBILE',      label: 'CNG / NG mobile equipment',                          fuelCode: 'natural_gas', co2EfKgPerGj: 56.1, ch4EfKgPerGj: 0.092, n2oEfKgPerGj: 0.003,  source: 'IPCC 2006' },
}

/* ------------- Process emissions — FGD limestone + SCR/SNCR urea --------- */

/** Stoichiometric calcination factors. */
export const PROCESS_STOICH = {
  CACO3_TO_CO2:   44 / 100.09,  // 0.4396 — limestone in FGD
  UREA_TO_CO2:    44 / 60.06,   // 0.7326 — urea in SCR/SNCR
  C_TO_CO2:       44 / 12,      // 3.667 — general carbon
} as const

/** Default purities (CSI / EU ETS / EPA-aligned). */
export const PROCESS_PURITY_DEFAULTS = {
  CACO3_PURITY: 0.92,           // FGD limestone average
  UREA_PURITY:  0.99,           // solid urea
} as const

/* ------- Fugitive — SF6 leak rates + CH4 placeholders + HFC GWPs --------- */

/** SF6 leak rates per equipment class. EPA Subpart DD / IPCC 2006 Vol 3 Ch 8. */
export const SF6_LEAK_RATES = {
  GAS_INSULATED_SWITCHGEAR_SEALED_NEW:   0.005,  // <0.5%/yr modern sealed-pressure
  GAS_INSULATED_SWITCHGEAR_SEALED_OLDER: 0.01,
  GAS_INSULATED_SWITCHGEAR_CLOSED_NEW:   0.025,  // 2.5%/yr
  GAS_INSULATED_SWITCHGEAR_CLOSED_OLDER: 0.08,   // older closed-pressure
  CIRCUIT_BREAKER_LIVE_TANK:             0.013,  // EPA Subpart DD average
  GAS_INSULATED_LINE:                    0.005,
} as const

/** Coal handling CH4 fugitive — research §5.4 / IPCC Vol 2 Ch 4 proxy. */
export const FUGITIVE_CH4_DEFAULTS = {
  COAL_STORAGE_PILE_KG_PER_T:    0.13,  // surface-mining proxy
  COAL_HANDLING_KG_PER_T:        0.10,  // conveyors, transfer points
  NATURAL_GAS_FUGITIVE_KG_PER_GJ: 0.0001, // on-plant gas pipework + valves
} as const

/* ------------------ Supporting Scope 2 grid EF defaults ------------------ */

export const INDIA_GRID_EF_TCO2_PER_MWH = 0.716  // CEA v21 (FY 22-23 weighted avg, RE-adjusted ~0.727 for FY 23-24)
export const US_AVG_GRID_EF_TCO2_PER_MWH = 0.366 // EPA eGRID 2022 US average
export const EU_AVG_GRID_EF_TCO2_PER_MWH = 0.230 // EEA 2022 weighted EU-27 average

/* ----------- CHP allocation (Simplified Efficiency Method) -------------- */

/** WRI/WBCSD Simplified Efficiency Method for CHP heat/power allocation. */
export const CHP_DEFAULTS = {
  HEAT_EFFICIENCY:  0.80,        // η_H
  POWER_EFFICIENCY: 0.35,        // η_P
  // R_eff = η_H / η_P = 2.286
} as const

/* --------------- Constants registry for FactorResolver ------------------- */

export const POWER_CONSTANT_FACTORS: Record<string, FactorDefault> = {
  POWER_INDIA_GRID_EF: {
    factorCode: 'POWER_INDIA_GRID_EF',
    factorName: 'India national grid EF (supporting Scope 2)',
    value: INDIA_GRID_EF_TCO2_PER_MWH,
    unit: 'tCO2/MWh',
    source: 'India CEA CO2 Baseline Database for the Indian Power Sector',
    sourceVersion: 'v21 (Nov–Dec 2025; FY 22-23)',
    factorYear: 2025,
    priorityRank: 3,
    isDefault: true,
  },
  POWER_US_GRID_EF: {
    factorCode: 'POWER_US_GRID_EF',
    factorName: 'US average grid EF (eGRID)',
    value: US_AVG_GRID_EF_TCO2_PER_MWH,
    unit: 'tCO2/MWh',
    source: 'US EPA eGRID',
    sourceVersion: '2022',
    factorYear: 2022,
    priorityRank: 3,
    isDefault: true,
  },
  POWER_CACO3_STOICH: {
    factorCode: 'POWER_CACO3_STOICH',
    factorName: 'CaCO3 → CO2 stoichiometric factor (44/100.09)',
    value: PROCESS_STOICH.CACO3_TO_CO2,
    unit: 'tCO2/tCaCO3',
    source: 'IPCC 2006 Vol 3 Ch 2',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  POWER_UREA_STOICH: {
    factorCode: 'POWER_UREA_STOICH',
    factorName: 'Urea → CO2 stoichiometric factor (44/60.06)',
    value: PROCESS_STOICH.UREA_TO_CO2,
    unit: 'tCO2/tUrea',
    source: 'IPCC 2006 — SCR/SNCR urea oxidation',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  POWER_CACO3_PURITY: {
    factorCode: 'POWER_CACO3_PURITY',
    factorName: 'FGD limestone purity default',
    value: PROCESS_PURITY_DEFAULTS.CACO3_PURITY,
    unit: 'fraction',
    source: 'EU ETS MRR / EPA Subpart C — typical FGD reagent',
    sourceVersion: 'consolidated',
    factorYear: 2024,
    priorityRank: 4,
    isDefault: true,
  },
  POWER_UREA_PURITY: {
    factorCode: 'POWER_UREA_PURITY',
    factorName: 'Urea purity default (solid)',
    value: PROCESS_PURITY_DEFAULTS.UREA_PURITY,
    unit: 'fraction',
    source: 'EPA Subpart C / EU ETS MRR',
    sourceVersion: 'consolidated',
    factorYear: 2024,
    priorityRank: 4,
    isDefault: true,
  },
}
