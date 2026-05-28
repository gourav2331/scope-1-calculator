/**
 * Pulp & Paper Scope 1 — constants, factor defaults, GWPs.
 *
 * Primary methodology: ICFPA/NCASI Calculation Tools v1.4 (WRI/WBCSD-endorsed).
 * Sub-standards: IPCC 2006 Guidelines (refined 2019), US EPA GHGRP Subparts AA & C,
 * EU ETS MRR (Reg 2018/2066 amended 2023–2024), CEPI Framework, AR5/AR6 GWPs.
 *
 * All emission factors are on a Net Calorific Value (LHV) basis unless noted otherwise.
 * Every value here has a citable source (see the inline `source` strings).
 */

import type { FactorDefault } from '../constants'

export const METHODOLOGY_PACK = 'ICFPA_NCASI_PP_V14'

/* ------------------------- Global Warming Potentials ----------------------- */

export type PulpPaperGwpSet = 'AR4_100' | 'AR5_100' | 'AR6_100' | 'AR6_20'

/** GWPs from IPCC reports. AR4 retained for backward compatibility (ICFPA v1.3a). */
export const PULPPAPER_GWP = {
  AR4_100: { co2: 1, ch4Fossil: 25,   ch4Biogenic: 25,   n2o: 298 }, // IPCC AR4 (2007)
  AR5_100: { co2: 1, ch4Fossil: 30,   ch4Biogenic: 28,   n2o: 265 }, // IPCC AR5 (2014); ICFPA v1.4
  AR6_100: { co2: 1, ch4Fossil: 29.8, ch4Biogenic: 27.0, n2o: 273 }, // IPCC AR6 (2021) — DEFAULT
  AR6_20:  { co2: 1, ch4Fossil: 82.5, ch4Biogenic: 79.7, n2o: 273 }, // IPCC AR6 20-yr horizon
} as const

/** Map P&P GWP set to the shared cement-style GWP basis ('AR5'|'AR6') for reused primitives. */
export function sharedGwpSetFor(pp: PulpPaperGwpSet): 'AR5' | 'AR6' {
  return pp === 'AR5_100' || pp === 'AR4_100' ? 'AR5' : 'AR6'
}

/* ------------------ Stationary fuel defaults (IPCC 2006 LHV) --------------- */

export interface PpFuelDefault {
  fuelCode: string
  label: string
  ncvGjPerUnit: number   // LHV / NCV
  defaultUnit: string    // canonical unit for the NCV
  co2EfKgPerGj: number
  origin: 'FOSSIL'
  source: string
}

/** IPCC 2006 Tier-1 fossil-fuel defaults, LHV basis. Section 9.1 of the Research Brief. */
export const PULPPAPER_FUEL_DEFAULTS: Record<string, PpFuelDefault> = {
  natural_gas:         { fuelCode: 'natural_gas',         label: 'Natural gas (dry)',          ncvGjPerUnit: 0.0383,  defaultUnit: 'Sm3',   co2EfKgPerGj: 56.1,  origin: 'FOSSIL', source: 'IPCC 2006 Vol 2 Ch 1 Tab 1.2' },
  refinery_fuel_gas:   { fuelCode: 'refinery_fuel_gas',   label: 'Refinery fuel gas',          ncvGjPerUnit: 0.0395,  defaultUnit: 'Sm3',   co2EfKgPerGj: 57.6,  origin: 'FOSSIL', source: 'IPCC 2006' },
  crude_oil:           { fuelCode: 'crude_oil',           label: 'Crude oil',                  ncvGjPerUnit: 42.3,    defaultUnit: 'tonne', co2EfKgPerGj: 73.3,  origin: 'FOSSIL', source: 'IPCC 2006' },
  gasoline:            { fuelCode: 'gasoline',            label: 'Gasoline / petrol',          ncvGjPerUnit: 0.03278, defaultUnit: 'L',     co2EfKgPerGj: 69.3,  origin: 'FOSSIL', source: 'IPCC 2006' },
  kerosene:            { fuelCode: 'kerosene',            label: 'Kerosene',                   ncvGjPerUnit: 0.03528, defaultUnit: 'L',     co2EfKgPerGj: 71.9,  origin: 'FOSSIL', source: 'IPCC 2006' },
  diesel:              { fuelCode: 'diesel',              label: 'Diesel oil (distillate)',    ncvGjPerUnit: 0.03612, defaultUnit: 'L',     co2EfKgPerGj: 74.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  residual_oil:        { fuelCode: 'residual_oil',        label: 'Residual fuel oil (No.5/6)', ncvGjPerUnit: 0.0404,  defaultUnit: 'L',     co2EfKgPerGj: 77.4,  origin: 'FOSSIL', source: 'IPCC 2006' },
  lpg:                 { fuelCode: 'lpg',                 label: 'LPG',                        ncvGjPerUnit: 47.3,    defaultUnit: 'tonne', co2EfKgPerGj: 63.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  bituminous_coal:     { fuelCode: 'bituminous_coal',     label: 'Bituminous coal',            ncvGjPerUnit: 25.8,    defaultUnit: 'tonne', co2EfKgPerGj: 94.6,  origin: 'FOSSIL', source: 'IPCC 2006' },
  sub_bituminous_coal: { fuelCode: 'sub_bituminous_coal', label: 'Sub-bituminous coal',        ncvGjPerUnit: 18.9,    defaultUnit: 'tonne', co2EfKgPerGj: 96.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  lignite:             { fuelCode: 'lignite',             label: 'Lignite',                    ncvGjPerUnit: 11.9,    defaultUnit: 'tonne', co2EfKgPerGj: 101.0, origin: 'FOSSIL', source: 'IPCC 2006' },
  anthracite:          { fuelCode: 'anthracite',          label: 'Anthracite coal',            ncvGjPerUnit: 26.7,    defaultUnit: 'tonne', co2EfKgPerGj: 98.3,  origin: 'FOSSIL', source: 'IPCC 2006' },
  peat:                { fuelCode: 'peat',                label: 'Peat (treated as fossil)',   ncvGjPerUnit: 9.76,    defaultUnit: 'tonne', co2EfKgPerGj: 106.0, origin: 'FOSSIL', source: 'IPCC 2006' },
  petcoke:             { fuelCode: 'petcoke',             label: 'Petroleum coke',             ncvGjPerUnit: 32.5,    defaultUnit: 'tonne', co2EfKgPerGj: 97.5,  origin: 'FOSSIL', source: 'IPCC 2006' },
  coke_oven_gas:       { fuelCode: 'coke_oven_gas',       label: 'Coke oven gas',              ncvGjPerUnit: 0.0381,  defaultUnit: 'Sm3',   co2EfKgPerGj: 44.4,  origin: 'FOSSIL', source: 'IPCC 2006' },
}

/* --------------- Stationary CH4/N2O by fuel × technology ------------------- */

export interface PpTechFactor { ch4EfKgPerGj: number; n2oEfKgPerGj: number; source: string }

/** Tier-3 stationary combustion CH4/N2O factors (NCASI/IPCC 2006). Section 9.2. */
export const PP_STATIONARY_TECH_DEFAULTS: Record<string, Record<string, PpTechFactor>> = {
  natural_gas: {
    BOILER_OR_IR_DRYER:    { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006 / NCASI' },
    TURBINE_OVER_3MW:      { ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.001,  source: 'IPCC 2006' },
    ENGINE_2STROKE_LEAN:   { ch4EfKgPerGj: 0.693, n2oEfKgPerGj: 0.0001, source: 'NCASI' },
    ENGINE_4STROKE_LEAN:   { ch4EfKgPerGj: 0.597, n2oEfKgPerGj: 0.0001, source: 'NCASI' },
    ENGINE_4STROKE_RICH:   { ch4EfKgPerGj: 0.110, n2oEfKgPerGj: 0.0001, source: 'NCASI' },
  },
  diesel:        { BOILER: { ch4EfKgPerGj: 0.0002, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006' } },
  residual_oil:  { BOILER: { ch4EfKgPerGj: 0.003,  n2oEfKgPerGj: 0.0003, source: 'IPCC 2006' } },
  lpg:           { BOILER: { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006' } },
  bituminous_coal: {
    OVERFEED_STOKER:           { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.0007, source: 'IPCC 2006' },
    UNDERFEED_STOKER:          { ch4EfKgPerGj: 0.014,  n2oEfKgPerGj: 0.0007, source: 'IPCC 2006' },
    PULVERIZED_DRY_WALL:       { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0005, source: 'NCASI' },
    PULVERIZED_DRY_TANGENTIAL: { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0014, source: 'NCASI' },
    PULVERIZED_WET:            { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.0014, source: 'NCASI' },
    SPREADER_STOKER:           { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.0007, source: 'IPCC 2006' },
    CFB:                       { ch4EfKgPerGj: 0.001,  n2oEfKgPerGj: 0.061,  source: 'Fortum 2001 — N2O 10× elevated' },
  },
  anthracite: { BOILER: { ch4EfKgPerGj: 0.010, n2oEfKgPerGj: 0.0015, source: 'IPCC 2006' } },
  lignite:    { BOILER: { ch4EfKgPerGj: 0.010, n2oEfKgPerGj: 0.0015, source: 'IPCC 2006' } },
}

/* ------------------- Biomass fuel defaults (memo + tech CH4/N2O) ----------- */

export interface PpBiomassDefault {
  fuelCode: string
  label: string
  ncvGjPerUnit: number
  defaultUnit: string
  biogenicCo2EfKgPerGj: number  // MEMO ONLY — excluded from gross Scope 1
  source: string
}

/** Biomass fuels: biogenic CO2 EF for the MEMO line, plus tech-specific CH4/N2O. */
export const PULPPAPER_BIOMASS_DEFAULTS: Record<string, PpBiomassDefault> = {
  wood_bark:             { fuelCode: 'wood_bark',             label: 'Wood / bark / hog fuel',          ncvGjPerUnit: 0.0156, defaultUnit: 'tonne_dry', biogenicCo2EfKgPerGj: 112,  source: 'IPCC 2006 Vol 2 Ch 2 Tab 2.5' },
  black_liquor:          { fuelCode: 'black_liquor',          label: 'Black liquor (kraft pulping)',     ncvGjPerUnit: 13.3,   defaultUnit: 'tonne_dry', biogenicCo2EfKgPerGj: 95.3, source: 'IPCC 2006 (sulphite lyes proxy)' },
  spent_sulphite_liquor: { fuelCode: 'spent_sulphite_liquor', label: 'Spent sulphite liquor',            ncvGjPerUnit: 13.3,   defaultUnit: 'tonne_dry', biogenicCo2EfKgPerGj: 95.3, source: 'IPCC 2006' },
  biogas:                { fuelCode: 'biogas',                label: 'Biogas (anaerobic / landfill)',    ncvGjPerUnit: 0.020,  defaultUnit: 'Sm3',       biogenicCo2EfKgPerGj: 54.6, source: 'IPCC 2006' },
  ncg:                   { fuelCode: 'ncg',                   label: 'Non-condensable gases (NCG)',      ncvGjPerUnit: 0,      defaultUnit: 'GJ',        biogenicCo2EfKgPerGj: 0,    source: 'Negligible if collected & incinerated (NCASI)' },
}

/** Biomass CH4/N2O are Scope 1 (only the CO2 is memo). Section 7.2 of Research. */
export const PP_BIOMASS_TECH_DEFAULTS: Record<string, Record<string, PpTechFactor>> = {
  wood_bark: {
    STOKER_BOILER: { ch4EfKgPerGj: 0.012, n2oEfKgPerGj: 0.004,  source: 'NCASI median, multi-source' },
    CFB:           { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0088, source: 'Fortum 2001 — elevated N2O' },
    BFB:           { ch4EfKgPerGj: 0.002, n2oEfKgPerGj: 0.002,  source: 'Fortum 2001' },
  },
  black_liquor: {
    KRAFT_RECOVERY_FURNACE: { ch4EfKgPerGj: 0.0025, n2oEfKgPerGj: 0.002, source: 'NCASI median; JPA 2002' },
  },
  spent_sulphite_liquor: {
    SULFITE_RECOVERY_FURNACE: { ch4EfKgPerGj: 0.0025, n2oEfKgPerGj: 0.002, source: 'NCASI median' },
  },
  biogas: {
    BOILER: { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0, source: 'NCASI 1981 (NG analog)' },
    KILN:   { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0, source: 'NCASI 1981 (NG analog)' },
  },
}

/* ------------------- Lime kiln / calciner factors -------------------------- */

/** Kiln CH4 = 0.0027 kg/GJ; kiln N2O = 0 (T > 980°C); calciner N2O > 0. Section 9.3. */
export const LIME_KILN_FACTORS: Record<string, PpTechFactor> = {
  LIME_KILN_NG:     { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0,   source: 'NCASI 1981 — high-T kiln' },
  LIME_KILN_OIL:    { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0,   source: 'NCASI 1981' },
  LIME_KILN_BIOGAS: { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0,   source: 'NCASI 1981' },
  CALCINER_NG:      { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0.1, source: 'IPCC 2006 Tier 1 — calciner' },
  CALCINER_OIL:     { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0.3, source: 'IPCC 2006 Tier 1 — fluidized bed' },
  CALCINER_BIOGAS:  { ch4EfKgPerGj: 0.0027, n2oEfKgPerGj: 0,   source: 'NCASI 1981' },
}

/* ------------------- Make-up carbonate stoichiometric factors -------------- */

/** From molecular weights: tCO2 per tonne of carbonate added (Section 7.4). */
export const MAKEUP_CARBONATE_FACTORS = {
  CACO3:    0.440, // 44/100
  NA2CO3:   0.415, // 44/106
  DOLOMITE: 0.477, // combined molar ratio
} as const

/* ------------------- Mobile off-road defaults (Tier 1) --------------------- */

export interface PpMobileDefault {
  vehicleCode: string
  label: string
  fuelCode: 'diesel' | 'gasoline' | 'lpg' | 'natural_gas'
  co2EfKgPerGj: number
  ch4EfKgPerGj: number
  n2oEfKgPerGj: number
  source: string
}

/** IPCC 2006 Vol 2 Ch 3 (mobile off-road). Section 9.4 of Research. */
export const PULPPAPER_MOBILE_DEFAULTS: Record<string, PpMobileDefault> = {
  DIESEL_OFFROAD:           { vehicleCode: 'DIESEL_OFFROAD',           label: 'Diesel — industry off-road',     fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.030,  source: 'IPCC 2006' },
  DIESEL_FORESTRY:          { vehicleCode: 'DIESEL_FORESTRY',          label: 'Diesel — forestry / harvesting', fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.030,  source: 'IPCC 2006' },
  GASOLINE_4STROKE:         { vehicleCode: 'GASOLINE_4STROKE',         label: 'Gasoline — 4-stroke off-road',   fuelCode: 'gasoline',    co2EfKgPerGj: 69.3, ch4EfKgPerGj: 0.050, n2oEfKgPerGj: 0.002,  source: 'IPCC 2006' },
  GASOLINE_2STROKE_INDUSTRY:{ vehicleCode: 'GASOLINE_2STROKE_INDUSTRY',label: 'Gasoline — 2-stroke off-road',    fuelCode: 'gasoline',    co2EfKgPerGj: 69.3, ch4EfKgPerGj: 0.130, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006' },
  GASOLINE_2STROKE_FORESTRY:{ vehicleCode: 'GASOLINE_2STROKE_FORESTRY',label: 'Gasoline — 2-stroke forestry',    fuelCode: 'gasoline',    co2EfKgPerGj: 69.3, ch4EfKgPerGj: 0.170, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006' },
  LPG_MOBILE:               { vehicleCode: 'LPG_MOBILE',               label: 'LPG — forklift / yard',           fuelCode: 'lpg',         co2EfKgPerGj: 63.1, ch4EfKgPerGj: 0.062, n2oEfKgPerGj: 0.0002, source: 'IPCC 2006' },
  NATGAS_MOBILE:            { vehicleCode: 'NATGAS_MOBILE',            label: 'CNG / NG mobile equipment',       fuelCode: 'natural_gas', co2EfKgPerGj: 56.1, ch4EfKgPerGj: 0.092, n2oEfKgPerGj: 0.003,  source: 'IPCC 2006' },
}

/* ------------------- Landfill / WWT / CHP defaults ------------------------- */

export const LANDFILL_DEFAULTS = {
  methanePotentialM3PerMg: 100,   // L0 (range 50–200)
  decayRatePerYear: 0.03,         // k for slow-degrading mill sludge
  collectionEfficiency: 0.75,     // FRCOLL (range 0.60–0.85)
  methaneFraction: 0.50,          // FRMETH
  oxidationFactor: 0.10,          // OX in cover
  ch4DensityKgPerNm3: 0.72,       // from Perry's
} as const

export const WWT_DEFAULTS = {
  efKgCh4PerKgCod: 0.25,                 // IPCC 2006
  efKgCh4PerKgBod: 0.60,                 // alternative basis
  methaneFraction: 0.50,
  collectionEfficiencyOdorTight: 1.0,
  collectionEfficiencyEngineered: 0.95,
  collectionEfficiencyOpenLagoon: 0.50,
} as const

export const CHP_DEFAULTS = {
  heatEfficiency: 0.80, // eH (WRI/WBCSD Simplified Efficiency Method)
  powerEfficiency: 0.35, // eP (Reff = eH/eP = 2.286 ≈ 2.3)
} as const

/* ------------------- HFC refrigerant GWPs (AR6 100-yr) --------------------- */

/** Refrigerant GWPs always use 100-yr AR6 regardless of CH4 horizon (industry convention). */
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

/* ------------------- Supporting Scope 2 default --------------------------- */

export const INDIA_GRID_EF_TCO2_PER_MWH = 0.71 // CEA published value (matches O&G/cement default)

/* ------------------- Constants registry for FactorResolver ---------------- */

/** Codes used via `ctx.resolver.constant(...)` or `resolveOrSupplied(...)`. */
export const PULPPAPER_CONSTANT_FACTORS: Record<string, FactorDefault> = {
  PP_INDIA_GRID_EF: {
    factorCode: 'PP_INDIA_GRID_EF',
    factorName: 'India national grid emission factor (supporting Scope 2)',
    value: INDIA_GRID_EF_TCO2_PER_MWH,
    unit: 'tCO2/MWh',
    source: 'India CEA latest publication',
    sourceVersion: '2024',
    factorYear: 2024,
    priorityRank: 4,
    isDefault: true,
  },
  PP_CACO3_STOICH: {
    factorCode: 'PP_CACO3_STOICH',
    factorName: 'CaCO3 → CO2 stoichiometric factor (44/100)',
    value: 0.440,
    unit: 'tCO2/tCaCO3',
    source: 'IPCC 2006 / NCASI v1.4',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_NA2CO3_STOICH: {
    factorCode: 'PP_NA2CO3_STOICH',
    factorName: 'Na2CO3 → CO2 stoichiometric factor (44/106)',
    value: 0.415,
    unit: 'tCO2/tNa2CO3',
    source: 'IPCC 2006 / NCASI v1.4',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_DOLOMITE_STOICH: {
    factorCode: 'PP_DOLOMITE_STOICH',
    factorName: 'Dolomite → CO2 stoichiometric factor',
    value: 0.477,
    unit: 'tCO2/tDolomite',
    source: 'IPCC 2006 / NCASI v1.4',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_CH4_DENSITY_NM3: {
    factorCode: 'PP_CH4_DENSITY_NM3',
    factorName: 'CH4 density at standard conditions',
    value: 0.72,
    unit: 'kg/Nm3',
    source: "Perry's Chemical Engineers' Handbook",
    sourceVersion: '1997',
    factorYear: 1997,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LANDFILL_L0: {
    factorCode: 'PP_LANDFILL_L0',
    factorName: 'Landfill methane potential (mill waste)',
    value: 100,
    unit: 'm3/Mg',
    source: 'NCASI v1.4 / IPCC 2006',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LANDFILL_K: {
    factorCode: 'PP_LANDFILL_K',
    factorName: 'Landfill first-order decay rate (mill sludge)',
    value: 0.03,
    unit: '/yr',
    source: 'IPCC 2006',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LANDFILL_FRCOLL: {
    factorCode: 'PP_LANDFILL_FRCOLL',
    factorName: 'Landfill gas collection efficiency',
    value: 0.75,
    unit: 'fraction',
    source: 'US EPA / NCASI',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LANDFILL_FRMETH: {
    factorCode: 'PP_LANDFILL_FRMETH',
    factorName: 'Landfill gas CH4 fraction',
    value: 0.50,
    unit: 'fraction',
    source: 'IPCC 2006',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LANDFILL_OX: {
    factorCode: 'PP_LANDFILL_OX',
    factorName: 'Landfill cover layer oxidation factor',
    value: 0.10,
    unit: 'fraction',
    source: 'IPCC 2006',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_WWT_EF_COD: {
    factorCode: 'PP_WWT_EF_COD',
    factorName: 'Anaerobic WWT CH4 EF (COD basis)',
    value: 0.25,
    unit: 'kgCH4/kgCOD',
    source: 'IPCC 2006 Vol 5 Ch 6',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_WWT_EF_BOD: {
    factorCode: 'PP_WWT_EF_BOD',
    factorName: 'Anaerobic WWT CH4 EF (BOD basis)',
    value: 0.60,
    unit: 'kgCH4/kgBOD',
    source: 'IPCC 2006 Vol 5 Ch 6',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  PP_CHP_HEAT_EFF: {
    factorCode: 'PP_CHP_HEAT_EFF',
    factorName: 'CHP heat efficiency (default)',
    value: 0.80,
    unit: 'fraction',
    source: 'WRI/WBCSD Simplified Efficiency Method',
    sourceVersion: '2005',
    factorYear: 2005,
    priorityRank: 4,
    isDefault: true,
  },
  PP_CHP_POWER_EFF: {
    factorCode: 'PP_CHP_POWER_EFF',
    factorName: 'CHP power efficiency (default)',
    value: 0.35,
    unit: 'fraction',
    source: 'WRI/WBCSD Simplified Efficiency Method',
    sourceVersion: '2005',
    factorYear: 2005,
    priorityRank: 4,
    isDefault: true,
  },
  PP_LIME_KILN_CH4: {
    factorCode: 'PP_LIME_KILN_CH4',
    factorName: 'Lime kiln CH4 EF (all fuels)',
    value: 0.0027,
    unit: 'kg/GJ',
    source: 'NCASI 1981',
    sourceVersion: '1981',
    factorYear: 1981,
    priorityRank: 4,
    isDefault: true,
  },
}
