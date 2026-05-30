/**
 * Iron & Steel Scope 1 — constants, factor defaults, GWPs.
 *
 * Primary methodology stack (per Section 14 of the research brief):
 *   1. GHG Protocol Corporate Standard + ISO 14064-1:2018 (organisational layer)
 *   2. ISO 14404-1/-2/-3 (site-level intensity, BF-BOF / EAF / DRI)
 *   3. worldsteel CO2 Data Collection User Guide v11 (2024 — sector benchmarking)
 *   4. IPCC 2006 Guidelines Vol 3 Ch 4 (Iron & Steel) + 2019 Refinement
 *   5. Regulatory overlays: EU ETS MRR (Reg 2018/2066), EU CBAM (Reg 2023/956),
 *      US EPA GHGRP Subpart Q (40 CFR 98.170-178), India CCTS + Green Steel Notification
 *   6. Disclosure: GRI 305, ESRS E1, IFRS S2, CDP, BRSR, SBTi Steel Guidance
 *
 * All emission factors are NCV/LHV basis. AR6 GWP100 is the default GWP set
 * (CSRD/ESRS E1 requirement; CSRD adopted AR6).
 */

import type { FactorDefault } from '../constants'

export const METHODOLOGY_PACK = 'WORLDSTEEL_ISO14404_IPCC2006_2024'

/* ------------------------- Global Warming Potentials ----------------------- */

export type IronSteelGwpSet = 'AR5_100' | 'AR6_100' | 'AR6_20'

/** GWPs from IPCC reports. AR6_100 is the default (ESRS E1 mandates it). */
export const IRONSTEEL_GWP = {
  AR5_100: { co2: 1, ch4Fossil: 30,   ch4Biogenic: 28,   n2o: 265, sf6: 22_800, nf3: 17_200 }, // IPCC AR5 (2014)
  AR6_100: { co2: 1, ch4Fossil: 29.8, ch4Biogenic: 27.0, n2o: 273, sf6: 25_200, nf3: 17_400 }, // IPCC AR6 (2021) — DEFAULT
  AR6_20:  { co2: 1, ch4Fossil: 82.5, ch4Biogenic: 79.7, n2o: 273, sf6: 25_200, nf3: 17_400 }, // 20-yr horizon (methane-emphasising)
} as const

export function sharedGwpSetFor(iss: IronSteelGwpSet): 'AR5' | 'AR6' {
  return iss === 'AR5_100' ? 'AR5' : 'AR6'
}

/* ----------------- HFC refrigerant GWPs (AR6 100-yr basis) ---------------- */

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
  // SF6 is tracked separately because it isn't an HFC; included here for any
  // accidental gas-code aliasing.
}

/* ----------- Fossil fuel defaults (IPCC 2006 Vol 2 Ch 1, LHV basis) ------ */

export interface IsFuelDefault {
  fuelCode: string
  label: string
  ncvGjPerUnit: number   // LHV / NCV per unit
  defaultUnit: string
  co2EfKgPerGj: number   // CO2 emission factor (kg CO2 / GJ LHV)
  origin: 'FOSSIL' | 'PROCESS_GAS' | 'BIOMASS'
  source: string
}

/** IPCC 2006 Tier-1 defaults, plus process gases (COG/BFG/BOFG) per Section 9.1
 *  of the research brief and IPCC Vol 3 Ch 4 Table 4.1. */
export const IRONSTEEL_FUEL_DEFAULTS: Record<string, IsFuelDefault> = {
  natural_gas:         { fuelCode: 'natural_gas',         label: 'Natural gas (dry)',          ncvGjPerUnit: 0.0383,  defaultUnit: 'Sm3',   co2EfKgPerGj: 56.1,  origin: 'FOSSIL', source: 'IPCC 2006 Vol 2 Ch 1 Table 1.2' },
  diesel:              { fuelCode: 'diesel',              label: 'Diesel oil / gas oil',       ncvGjPerUnit: 0.03612, defaultUnit: 'L',     co2EfKgPerGj: 74.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  residual_oil:        { fuelCode: 'residual_oil',        label: 'Residual fuel oil',          ncvGjPerUnit: 0.0404,  defaultUnit: 'L',     co2EfKgPerGj: 77.4,  origin: 'FOSSIL', source: 'IPCC 2006' },
  lpg:                 { fuelCode: 'lpg',                 label: 'LPG',                        ncvGjPerUnit: 47.3,    defaultUnit: 'tonne', co2EfKgPerGj: 63.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  coking_coal:         { fuelCode: 'coking_coal',         label: 'Coking coal',                ncvGjPerUnit: 28.2,    defaultUnit: 'tonne', co2EfKgPerGj: 94.6,  origin: 'FOSSIL', source: 'IPCC 2006 (coking coal)' },
  bituminous_coal:     { fuelCode: 'bituminous_coal',     label: 'Other bituminous coal',      ncvGjPerUnit: 25.8,    defaultUnit: 'tonne', co2EfKgPerGj: 94.6,  origin: 'FOSSIL', source: 'IPCC 2006' },
  sub_bituminous_coal: { fuelCode: 'sub_bituminous_coal', label: 'Sub-bituminous coal',        ncvGjPerUnit: 18.9,    defaultUnit: 'tonne', co2EfKgPerGj: 96.1,  origin: 'FOSSIL', source: 'IPCC 2006' },
  lignite:             { fuelCode: 'lignite',             label: 'Lignite',                    ncvGjPerUnit: 11.9,    defaultUnit: 'tonne', co2EfKgPerGj: 101.2, origin: 'FOSSIL', source: 'IPCC 2006' },
  anthracite:          { fuelCode: 'anthracite',          label: 'Anthracite coal',            ncvGjPerUnit: 26.7,    defaultUnit: 'tonne', co2EfKgPerGj: 98.3,  origin: 'FOSSIL', source: 'IPCC 2006' },
  petcoke:             { fuelCode: 'petcoke',             label: 'Petroleum coke',             ncvGjPerUnit: 32.5,    defaultUnit: 'tonne', co2EfKgPerGj: 97.5,  origin: 'FOSSIL', source: 'IPCC 2006' },
  coke_oven_coke:      { fuelCode: 'coke_oven_coke',      label: 'Coke-oven coke',             ncvGjPerUnit: 28.2,    defaultUnit: 'tonne', co2EfKgPerGj: 107.0, origin: 'FOSSIL', source: 'IPCC 2006 (BKB/peat coke proxy)' },
  // Process gases — high-carbon, low-NCV; reused as fuel within the mill.
  coke_oven_gas:       { fuelCode: 'coke_oven_gas',       label: 'Coke-oven gas (COG)',        ncvGjPerUnit: 0.0387,  defaultUnit: 'Nm3',   co2EfKgPerGj: 44.4,  origin: 'PROCESS_GAS', source: 'IPCC 2006 / worldsteel — high H2 content' },
  blast_furnace_gas:   { fuelCode: 'blast_furnace_gas',   label: 'Blast furnace gas (BFG)',    ncvGjPerUnit: 0.0030,  defaultUnit: 'Nm3',   co2EfKgPerGj: 260,   origin: 'PROCESS_GAS', source: 'IPCC 2006 / worldsteel — high N2/CO content' },
  bof_gas:             { fuelCode: 'bof_gas',             label: 'BOF gas (BOFG/LDG)',         ncvGjPerUnit: 0.0071,  defaultUnit: 'Nm3',   co2EfKgPerGj: 182,   origin: 'PROCESS_GAS', source: 'IPCC 2006 / worldsteel — high CO' },
}

/** Biomass fuels (bio-coke, charcoal, biomass injection). Biogenic CO2 = memo. */
export const IRONSTEEL_BIOMASS_DEFAULTS: Record<string, IsFuelDefault> = {
  bio_coke: { fuelCode: 'bio_coke', label: 'Bio-coke / charcoal', ncvGjPerUnit: 28.0,  defaultUnit: 'tonne', co2EfKgPerGj: 112, origin: 'BIOMASS', source: 'IPCC 2006 biomass (charcoal proxy)' },
  biomass:  { fuelCode: 'biomass',  label: 'Generic biomass',     ncvGjPerUnit: 0.0156, defaultUnit: 'tonne_dry', co2EfKgPerGj: 112, origin: 'BIOMASS', source: 'IPCC 2006' },
}

/** India NATCOM CEFs — override defaults when reporting Indian operations. */
export const INDIA_NATCOM_OVERRIDES: Record<string, { co2EfKgPerGj: number; source: string }> = {
  coking_coal:         { co2EfKgPerGj: 93.61, source: 'India NATCOM / MoEFCC (CEF 25.5 tC/TJ)' },
  bituminous_coal:     { co2EfKgPerGj: 95.81, source: 'India NATCOM / MoEFCC (non-coking coal CEF 26.1 tC/TJ)' },
  sub_bituminous_coal: { co2EfKgPerGj: 95.81, source: 'India NATCOM / MoEFCC' },
  lignite:             { co2EfKgPerGj: 106.51, source: 'India NATCOM / MoEFCC (CEF 29.0 tC/TJ)' },
}

/* ---------- CH4 / N2O combustion factors by fuel × technology ------------ */

export interface IsTechFactor { ch4EfKgPerGj: number; n2oEfKgPerGj: number; source: string }

/** Stationary CH4/N2O — IPCC 2006 Vol 2 Ch 2 + 2019 Refinement (sintering new). */
export const IS_STATIONARY_TECH_DEFAULTS: Record<string, Record<string, IsTechFactor>> = {
  natural_gas: {
    BOILER:                { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001, source: 'IPCC 2006' },
    REHEAT_FURNACE:        { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001, source: 'IPCC 2006' },
    COKE_OVEN_UNDERFIRING: { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.001, source: 'IPCC 2006' },
    TURBINE:               { ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.001, source: 'IPCC 2006' },
    ENGINE:                { ch4EfKgPerGj: 0.597, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006 NG 4-stroke lean' },
  },
  coking_coal: {
    SINTER_STRAND:         { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.005, source: 'IPCC 2019 Refinement Vol 3 Ch 4 — sintering' },
    BOILER:                { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0015, source: 'IPCC 2006' },
  },
  bituminous_coal: {
    BOILER:                { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0015, source: 'IPCC 2006' },
    PULVERIZED:            { ch4EfKgPerGj: 0.0007, n2oEfKgPerGj: 0.0014, source: 'IPCC 2006' },
    CFB:                   { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.061, source: 'Fortum 2001 — CFB elevated N2O' },
  },
  diesel:        { BOILER: { ch4EfKgPerGj: 0.0002, n2oEfKgPerGj: 0.0004, source: 'IPCC 2006' } },
  residual_oil:  { BOILER: { ch4EfKgPerGj: 0.003,  n2oEfKgPerGj: 0.0003, source: 'IPCC 2006' } },
  lpg:           { BOILER: { ch4EfKgPerGj: 0.0009, n2oEfKgPerGj: 0.004,  source: 'IPCC 2006' } },
  coke_oven_gas:     { COKE_OVEN_UNDERFIRING: { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006' } },
  blast_furnace_gas: { HOT_BLAST_STOVE:       { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006' } },
  bof_gas:           { BOILER:                { ch4EfKgPerGj: 0.001, n2oEfKgPerGj: 0.0001, source: 'IPCC 2006' } },
}

/* -------------- Material carbon contents (mass-balance Tier 2/3) --------- */

/** Carbon mass fractions per ISO 14404 Annex / IPCC 2019 Refinement Table 4.1.
 *  Used in carbon-balance modules (BF, BOF, EAF, coke oven, sinter, DRI). */
export const MATERIAL_CARBON_FRAC = {
  coking_coal:         0.79,  // typical 73–85%
  coke_oven_coke:      0.875, // typical 83–92%
  anthracite_charge_c: 0.83,  // typical 80–86%
  petcoke:             0.94,  // typical 90–98%
  natural_gas:         0.75,  // mass fraction in CH4
  pig_iron_hot_metal:  0.043, // typical 4.0–4.5%
  dri_gas:             0.02,  // typical 1.5–2.5% (gas-based)
  dri_coal:            0.02,
  dri_h2:              0.003, // 0.1–0.5% (H2-DRI)
  crude_steel:         0.005, // 0.1–1.5%
  steel_scrap:         0.004,
  bf_slag:             0.001, // typically <0.1%
  bof_slag:            0.007,
  graphite_electrodes: 0.99,  // electrodes — 99% C
} as const

/* -------------- Process / material emission factors (IPCC defaults) ------ */

/** Stoichiometric calcination factors (CaCO3 → CaO + CO2; dolomite analogous). */
export const CARBONATE_CALCINATION_FACTORS = {
  CACO3:    0.440, // tCO2/tCaCO3 (44/100)
  MGCO3:    0.522, // tCO2/tMgCO3 (44/84.3)
  DOLOMITE: 0.477, // tCO2/t (combined molar ratio)
  LIME:     0.785, // tCO2/t lime produced (pure CaCO3 feed, full calcination)
} as const

/** IPCC 2006 Tier 1 defaults (Vol 3 Ch 4 Table 4.1 / research §9.2). */
export const PROCESS_TIER1_EF = {
  SINTER:           0.20,  // tCO2/t sinter
  PELLET:           0.03,  // tCO2/t pellet
  COKE:             0.56,  // tCO2/t coke (recovery oven; combustion side only)
  PIG_IRON_BF:      1.35,  // tCO2/t pig iron (blast furnace)
  BOF_INTEGRATED:   1.46,  // tCO2/t crude steel (combined BF + BOF Tier 1)
  EAF_ELECTRODES:   0.08,  // tCO2/t crude steel (electrode oxidation only)
  EAF_TOTAL:        0.20,  // tCO2/t crude steel (electrodes + charge C + injection)
  DRI_NATURAL_GAS:  0.70,  // tCO2/t DRI
  DRI_COAL:         2.50,  // tCO2/t DRI
} as const

/* ------------- Mobile combustion (off-road + on-road, IPCC) -------------- */

export interface IsMobileDefault {
  vehicleCode: string
  label: string
  fuelCode: 'diesel' | 'gasoline' | 'lpg' | 'natural_gas'
  co2EfKgPerGj: number
  ch4EfKgPerGj: number
  n2oEfKgPerGj: number
  source: string
}

export const IRONSTEEL_MOBILE_DEFAULTS: Record<string, IsMobileDefault> = {
  DIESEL_OFFROAD:   { vehicleCode: 'DIESEL_OFFROAD',   label: 'Diesel — off-road (yard, loaders)', fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.030,  source: 'IPCC 2006' },
  DIESEL_HAUL:      { vehicleCode: 'DIESEL_HAUL',      label: 'Diesel — heavy haul truck',         fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.005, n2oEfKgPerGj: 0.039,  source: 'IPCC 2006 / EPA on-road' },
  DIESEL_LOCO:      { vehicleCode: 'DIESEL_LOCO',      label: 'Diesel — locomotive (slag pots)',   fuelCode: 'diesel',      co2EfKgPerGj: 74.1, ch4EfKgPerGj: 0.004, n2oEfKgPerGj: 0.026,  source: 'IPCC 2006 (rail)' },
  LPG_FORKLIFT:     { vehicleCode: 'LPG_FORKLIFT',     label: 'LPG — forklift',                    fuelCode: 'lpg',         co2EfKgPerGj: 63.1, ch4EfKgPerGj: 0.062, n2oEfKgPerGj: 0.0002, source: 'IPCC 2006' },
  NATGAS_MOBILE:    { vehicleCode: 'NATGAS_MOBILE',    label: 'CNG / NG mobile equipment',         fuelCode: 'natural_gas', co2EfKgPerGj: 56.1, ch4EfKgPerGj: 0.092, n2oEfKgPerGj: 0.003,  source: 'IPCC 2006' },
}

/* --------------- Process-gas characteristics (carbon content) ------------ */

/** Per Section 8.1 of the research brief — used in flaring + mass balances. */
export const PROCESS_GAS_CARBON = {
  COG: { molarCarbonFraction: 0.10, ncvMjPerNm3: 17.5, co2EfKgPerNm3: 0.85, source: 'worldsteel v11 — typical COG' },
  BFG: { molarCarbonFraction: 0.20, ncvMjPerNm3: 3.0,  co2EfKgPerNm3: 0.80, source: 'worldsteel v11 — typical BFG' },
  BOFG: { molarCarbonFraction: 0.55, ncvMjPerNm3: 7.5,  co2EfKgPerNm3: 1.30, source: 'worldsteel v11 — typical BOFG' },
} as const

/* -------- Flaring DRE (destruction & removal efficiency) defaults -------- */

export const FLARE_DRE_DEFAULTS = {
  LIT_ASSISTED:   0.98,
  LIT_UNASSISTED: 0.96,
  EMERGENCY_PILOT: 0.98,
  UNLIT_VENT:      0,    // unlit flare ⇒ full venting (treated as fugitive)
} as const

/* ------------------- Fugitive defaults ------------------------------------ */

/** SF6 sealed-pressure switchgear leak rates per EPA / IPCC 2006 Vol 3 Ch 8 */
export const SF6_LEAK_RATES = {
  SEALED_PRESSURE_NEW:   0.005, // ≤0.5 %/yr modern sealed-pressure
  SEALED_PRESSURE_OLDER: 0.01,
  CLOSED_PRESSURE_NEW:   0.025, // 2.5%/yr
  CLOSED_PRESSURE_OLDER: 0.08,  // 8%/yr (older closed-pressure)
} as const

/** Coal-stockpile / coke-oven seal fugitive CH4 — site-specific; provide tracker. */
export const FUGITIVE_CH4_PLACEHOLDER = {
  COAL_STOCKPILE_KG_CH4_PER_TONNE_COAL: 0.13, // IPCC 2006 Vol 2 Ch 4 surface mining proxy
  COKE_OVEN_SEAL_KG_CH4_PER_TONNE_COKE:  0.1,  // worldsteel v11 — annex average
} as const

/* ------------------ Supporting Scope 2 grid EF defaults ------------------ */

export const INDIA_GRID_EF_TCO2_PER_MWH = 0.716 // CEA FY 22-23
export const US_AVG_GRID_EF_TCO2_PER_MWH = 0.366 // EPA eGRID 2022 US average

/* --------------- Constants registry for FactorResolver ------------------- */

export const IRONSTEEL_CONSTANT_FACTORS: Record<string, FactorDefault> = {
  IS_INDIA_GRID_EF: {
    factorCode: 'IS_INDIA_GRID_EF',
    factorName: 'India national grid EF (supporting Scope 2 only)',
    value: INDIA_GRID_EF_TCO2_PER_MWH,
    unit: 'tCO2/MWh',
    source: 'India CEA CO2 Baseline Database v19 (FY 22-23)',
    sourceVersion: '2024',
    factorYear: 2024,
    priorityRank: 4,
    isDefault: true,
  },
  IS_CACO3_STOICH: {
    factorCode: 'IS_CACO3_STOICH',
    factorName: 'CaCO3 → CO2 stoichiometric factor (44/100)',
    value: 0.440,
    unit: 'tCO2/tCaCO3',
    source: 'IPCC 2006 Vol 3 Ch 2 — Mineral Industry',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_DOLOMITE_STOICH: {
    factorCode: 'IS_DOLOMITE_STOICH',
    factorName: 'Dolomite → CO2 stoichiometric factor',
    value: 0.477,
    unit: 'tCO2/tDolomite',
    source: 'IPCC 2006 Vol 3 Ch 2',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_LIME_PRODUCTION_EF: {
    factorCode: 'IS_LIME_PRODUCTION_EF',
    factorName: 'Lime production EF (pure CaCO3 feed, full calcination)',
    value: 0.785,
    unit: 'tCO2/t lime',
    source: 'IPCC 2006 / GHG Protocol cement & lime',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_FLARE_DRE_DEFAULT: {
    factorCode: 'IS_FLARE_DRE_DEFAULT',
    factorName: 'Flare destruction & removal efficiency (default, lit-assisted)',
    value: 0.98,
    unit: 'fraction',
    source: 'IPCC 2019 Refinement Vol 3 Ch 4 — flare CO2',
    sourceVersion: '2019',
    factorYear: 2019,
    priorityRank: 4,
    isDefault: true,
  },
  IS_C_TO_CO2: {
    factorCode: 'IS_C_TO_CO2',
    factorName: 'Molecular mass ratio CO2/C (44/12)',
    value: 44 / 12,
    unit: 'mass ratio',
    source: 'Stoichiometry',
    sourceVersion: 'constant',
    factorYear: null,
    priorityRank: 4,
    isDefault: true,
  },
  IS_SINTER_TIER1: {
    factorCode: 'IS_SINTER_TIER1',
    factorName: 'Sinter production Tier-1 EF',
    value: PROCESS_TIER1_EF.SINTER,
    unit: 'tCO2/t sinter',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_COKE_TIER1: {
    factorCode: 'IS_COKE_TIER1',
    factorName: 'Coke production Tier-1 EF (recovery oven)',
    value: PROCESS_TIER1_EF.COKE,
    unit: 'tCO2/t coke',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_BF_TIER1: {
    factorCode: 'IS_BF_TIER1',
    factorName: 'BF pig iron Tier-1 EF',
    value: PROCESS_TIER1_EF.PIG_IRON_BF,
    unit: 'tCO2/t pig iron',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_BOF_INTEGRATED_TIER1: {
    factorCode: 'IS_BOF_INTEGRATED_TIER1',
    factorName: 'BOF integrated Tier-1 EF (combined BF+BOF)',
    value: PROCESS_TIER1_EF.BOF_INTEGRATED,
    unit: 'tCO2/t crude steel',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_EAF_ELECTRODES_TIER1: {
    factorCode: 'IS_EAF_ELECTRODES_TIER1',
    factorName: 'EAF electrode oxidation Tier-1 EF',
    value: PROCESS_TIER1_EF.EAF_ELECTRODES,
    unit: 'tCO2/t crude steel',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_DRI_NG_TIER1: {
    factorCode: 'IS_DRI_NG_TIER1',
    factorName: 'DRI natural-gas-based Tier-1 EF',
    value: PROCESS_TIER1_EF.DRI_NATURAL_GAS,
    unit: 'tCO2/t DRI',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_DRI_COAL_TIER1: {
    factorCode: 'IS_DRI_COAL_TIER1',
    factorName: 'DRI coal-based Tier-1 EF',
    value: PROCESS_TIER1_EF.DRI_COAL,
    unit: 'tCO2/t DRI',
    source: 'IPCC 2006 Vol 3 Ch 4 Table 4.1 / India CCTS',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
  IS_ELECTRODE_EF: {
    factorCode: 'IS_ELECTRODE_EF',
    factorName: 'Carbon electrode oxidation (99% C × 44/12)',
    value: 3.66,
    unit: 'tCO2/t electrode',
    source: 'Research §9.2 (99% C × 44/12)',
    sourceVersion: '2006',
    factorYear: 2006,
    priorityRank: 4,
    isDefault: true,
  },
}
