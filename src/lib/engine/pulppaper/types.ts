/**
 * Type model for the Pulp & Paper Scope 1 engine.
 *
 * Built from the ICFPA/NCASI v1.4 ten source categories plus a `reported`
 * direct-entry category for disclosed-aggregate use. Gross Scope 1 is full
 * CO2e (CO2 + CH4 + N2O + HFCs); biogenic CO2 is a memo (excluded), but
 * biogenic CH4 and N2O DO count in gross.
 */

import type { Quantity, TraceEntry, FactorSnapshot, ValidationMessage } from '../types'
import type { PulpPaperGwpSet } from './constants'

// Re-export sector-agnostic primitives so P&P consumers don't reach across packs.
export type { GasAmounts, ReportedEntry, EmissionBasis, ReconciliationLine, AssumptionEntry } from '../oilgas/types'
export type { PulpPaperGwpSet }

/* ----------------------------- mill / facility ---------------------------- */

export type PulpPaperMillType =
  | 'KRAFT'           // chemical pulp, has recovery furnace + lime kiln
  | 'SULFITE'         // chemical pulp, sulfite recovery
  | 'RECYCLED'        // recycled fibre / deinking
  | 'MECHANICAL'      // mechanical / TMP pulp
  | 'PAPER_ONLY'      // non-integrated, buys pulp
  | 'INTEGRATED'      // pulp + paper on one site
  | 'MIXED'           // mixed / portfolio aggregate

export interface PulpPaperFacility {
  name: string
  millType: PulpPaperMillType
  state?: string
  country?: string
}

/* -------------------------- methods + applicability ----------------------- */

export type PpStationaryMethod = 'ENERGY_BASED' | 'CARBON_CONTENT_BASED' | 'DIRECT_MEASUREMENT'
export type PpMobileMethod = 'FUEL_BASED' | 'DISTANCE_BASED'
export type PpRefrigerantMethod = 'MASS_BALANCE' | 'SCREENING'
export type PpLandfillMethod = 'DIRECT_GAS_MEASUREMENT' | 'SIMPLIFIED_FOD'
export type PpWwtMethod = 'GAS_CAPTURE' | 'ACTIVITY_BASED'

export interface PulpPaperMethodSelections {
  stationaryMethod: PpStationaryMethod
  mobileMethod: PpMobileMethod
  electricityMethod: 'LOCATION_BASED_SUPPORTING' | 'MARKET_BASED_SUPPORTING'
}

export interface PulpPaperSourceApplicability {
  stationaryCombustion: boolean
  biomassCombustion: boolean
  limeKilns: boolean
  makeupCarbonates: boolean
  mobile: boolean
  landfills: boolean
  anaerobicWwt: boolean
  refrigerants: boolean
  chpAllocation: boolean
  co2Transfers: boolean
  reported: boolean
  purchasedElectricity: boolean
}

/* ------------------------------ entry types ------------------------------- */

/** Stationary fossil-fuel combustion (boilers, IR dryers, RTOs, turbines, engines). */
export interface FuelEntry {
  id: string
  label: string
  fuelCode: string
  /** Combustion technology — drives CH4/N2O EFs. Keys match PP_STATIONARY_TECH_DEFAULTS. */
  technology?: string
  quantity: Quantity
  quantityUnit: string
  // Optional overrides (blank = library default)
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  /** Tier 3/4: site-measured carbon content (mass fraction 0–1). */
  carbonContentFraction?: Quantity
  /** IPCC 2006 default = 1.0; only set < 1.0 if site demonstrates unoxidised C. */
  oxidationFactor?: Quantity
  /** Tier 4: directly metered tCO2 from CEMS. Overrides everything else. */
  directCo2Tonnes?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Biomass combustion (wood/bark/hog, black liquor, sulphite liquor, biogas, NCG). */
export interface BiomassEntry {
  id: string
  label: string
  fuelCode: string
  technology?: string
  quantity: Quantity
  quantityUnit: string
  ncvGjPerUnit?: Quantity
  /** Biogenic CO2 EF for the MEMO line. Override only with site-measured value. */
  biogenicCo2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Kraft mill lime kilns and calciners. */
export interface LimeKilnEntry {
  id: string
  label: string
  kilnType: 'LIME_KILN' | 'CALCINER'
  fuelCode: string                // fossil fuel firing the kiln/calciner
  fuelQuantity: Quantity
  fuelQuantityUnit: string
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity          // default 0.0027 kg/GJ
  n2oEfKgPerGj?: Quantity          // 0 for kilns, 0.1–0.3 for calciners
  /** Biogenic CO2 from CaCO3 calcination (recovery-cycle carbon) — MEMO only. */
  biogenicCo2FromCalcinationTonnes?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Make-up CaCO3 / Na2CO3 / dolomite / FGD sorbent — fossil-origin process CO2. */
export interface MakeupCarbonateEntry {
  id: string
  label: string
  chemicalCode: 'CACO3' | 'NA2CO3' | 'DOLOMITE'
  quantityTonnes: Quantity
  co2EfTonnesPerTonne?: Quantity   // override the stoichiometric factor
  /** Fossil origin (mined limestone / Solvay soda ash). True by default. */
  fossilOrigin?: boolean
  evidenceReference?: string
  overrideReason?: string
}

/** Mill-owned mobile equipment: forklifts, log loaders, yard trucks, forestry equipment. */
export interface MobileEntry {
  id: string
  label: string
  ownership: 'OWNED_CONTROLLED' | 'THIRD_PARTY'
  vehicleCode: string              // e.g. DIESEL_OFFROAD; key into PULPPAPER_MOBILE_DEFAULTS
  quantity: Quantity
  quantityUnit: string
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Mill landfill receiving sludge, ash, rejects — CH4 by FOD or direct gas. */
export interface LandfillEntry {
  id: string
  label: string
  method: PpLandfillMethod
  /** Method 1 — direct gas measurement. */
  collectedGasNm3?: Quantity        // REC
  collectionEfficiency?: Quantity   // FRCOLL, default 0.75
  methaneFraction?: Quantity        // FRMETH, default 0.5
  oxidationFactor?: Quantity        // OX, default 0.10
  fractionBurned?: Quantity         // FRBURN, fraction of collected gas burned
  /** Method 2 — simplified first-order decay. */
  annualDepositDryMg?: Quantity     // R
  methanePotentialM3PerMg?: Quantity // L0, default 100
  decayRatePerYear?: Quantity       // k, default 0.03
  yearsSinceOpening?: Quantity      // T
  yearsSinceClosure?: Quantity      // C, default 0
  ch4RecoveredM3?: Quantity         // CH4 recovered (for FOD with gas system)
  evidenceReference?: string
  overrideReason?: string
}

/** Anaerobic wastewater treatment (UASB / EGSB / IC) or sludge digester. */
export interface AnaerobicWwtEntry {
  id: string
  label: string
  method: PpWwtMethod
  /** Method 1 — gas capture. */
  collectedGasNm3?: Quantity
  collectionEfficiency?: Quantity   // default 1.0 odor-tight, 0.95 engineered, 0.5 open lagoon
  methaneFraction?: Quantity        // default 0.5
  fractionBurned?: Quantity         // default 1.0 if flared
  /** Method 2 — activity-based. */
  codLoadKg?: Quantity              // kg COD to anaerobic stage
  bodLoadKg?: Quantity              // kg BOD (alternative)
  efKgCh4PerKgCod?: Quantity        // default 0.25
  efKgCh4PerKgBod?: Quantity        // default 0.6
  ch4CapturedKg?: Quantity          // B — CH4 captured and burned
  evidenceReference?: string
  overrideReason?: string
}

/** Fugitive HFC refrigerant leakage from chillers, AC, lab chemicals. */
export interface RefrigerantEntry {
  id: string
  label: string
  gasCode: string                   // r134a, r410a, r404a, ...
  method: PpRefrigerantMethod
  /** Mass balance: Inv_start + Purchased − Sold − Inv_end − Recovered. */
  inventoryStartKg?: Quantity
  purchasedKg?: Quantity
  soldKg?: Quantity
  inventoryEndKg?: Quantity
  recoveredForRecycleKg?: Quantity
  /** Screening: Charge × annual leak rate. */
  chargeKg?: Quantity
  annualLeakRate?: Quantity         // fraction 0–1
  gwpOverride?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** CHP allocation (Simplified Efficiency Method per ICFPA / WRI/WBCSD). */
export interface ChpAllocationEntry {
  id: string
  label: string
  totalEmissionsCo2eTonnes: Quantity
  heatOutputGj: Quantity
  powerOutputGj: Quantity
  heatEfficiency?: Quantity         // eH, default 0.80
  powerEfficiency?: Quantity        // eP, default 0.35
  /** Heat / power exported externally (drives allocation note). */
  heatExportedGj?: Quantity
  powerExportedGj?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** CO2 transfers — fossil exports to PCC plant (deduction) or imports. */
export interface Co2TransferEntry {
  id: string
  label: string
  direction: 'EXPORT' | 'IMPORT'
  origin: 'FOSSIL' | 'BIOGENIC'
  quantityTonnes: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/* ----------------------------- production data ---------------------------- */

export interface PulpPaperProduction {
  /** Air-dry pulp tonnes. */
  airDryPulpTonnes?: Quantity
  paperProducedTonnes?: Quantity
  boardProducedTonnes?: Quantity
}

/* --------------------------- input payload root --------------------------- */

import type { ReportedEntry } from '../oilgas/types'

export interface PulpPaperActivityData {
  production: PulpPaperProduction
  stationaryCombustion: FuelEntry[]
  biomassCombustion: BiomassEntry[]
  limeKilns: LimeKilnEntry[]
  makeupCarbonates: MakeupCarbonateEntry[]
  mobile: MobileEntry[]
  landfills: LandfillEntry[]
  anaerobicWwt: AnaerobicWwtEntry[]
  refrigerants: RefrigerantEntry[]
  chpAllocation: ChpAllocationEntry[]
  co2Transfers: Co2TransferEntry[]
  reported: ReportedEntry[]
  disclosedGrossScope1CO2eTonnes?: Quantity
  /** Supporting Scope 2 (excluded from gross Scope 1, kept for completeness). */
  purchasedElectricity: { mwh: Quantity; gridEfTco2PerMwh: Quantity }
}

export interface PulpPaperInputPayload {
  calculationContext: {
    calculationType: 'ANNUAL_INVENTORY' | 'PARTIAL_PERIOD'
    reportingPeriod: { year: number; startDate: string; endDate: string }
    inventoryVersion: string
    gwpSet: PulpPaperGwpSet
  }
  organization: { name: string; country: string; contactName?: string; contactEmail?: string; contactPhone?: string; contactRole?: string }
  facility: PulpPaperFacility
  organizationBoundary: {
    boundaryMethod: 'OPERATIONAL_CONTROL' | 'FINANCIAL_CONTROL' | 'EQUITY_SHARE'
    ownershipSharePercent?: number
    consolidationPercent?: number
    /** GHG Protocol requires a written narrative of why this boundary applies (assurance). */
    justification?: string
  }
  sector: { sectorCode: 'PULP_PAPER' }
  methodSelections: PulpPaperMethodSelections
  sourceApplicability: PulpPaperSourceApplicability
  activityData: PulpPaperActivityData
  factorOverrides: Record<string, { value: number; source?: string; reason?: string }>
}

/* -------------------------------- result ---------------------------------- */

export type PulpPaperCategory =
  | 'stationaryCombustion'
  | 'biomassCombustion'
  | 'limeKilns'
  | 'makeupCarbonates'
  | 'mobile'
  | 'landfills'
  | 'anaerobicWwt'
  | 'refrigerants'
  | 'chpAllocation'
  | 'co2Transfers'
  | 'reported'

import type { GasAmounts, ReconciliationLine, AssumptionEntry } from '../oilgas/types'

export interface PulpPaperIntensityMetrics {
  co2ePerAdtPulp?: number
  co2ePerTonnePaper?: number
  co2ePerTonneBoard?: number
  fossilCo2PerAdtPulp?: number
  biomassShareOfPrimaryEnergyPercent?: number
}

export interface ChpAllocationResult {
  label: string
  heatEmissionsTonnes: number
  powerEmissionsTonnes: number
  heatEfKgPerGj: number
  powerEfKgPerGj: number
}

export interface PulpPaperCalculationResult {
  calculationId: string | null
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'BLOCKED'
  sectorCode: 'PULP_PAPER'
  methodologyPack: string
  gwpSet: PulpPaperGwpSet
  reportingPeriod: { year: number; startDate: string; endDate: string }
  scope1: {
    grossScope1CO2eTonnes: number
    byCategory: Record<PulpPaperCategory, GasAmounts>
    byGas: {
      co2Tonnes: number
      ch4Tonnes: number
      ch4CO2eTonnes: number
      n2oTonnes: number
      n2oCO2eTonnes: number
      refrigerantCO2eTonnes: number
    }
    excludedFromGrossScope1: {
      biogenicCO2MemoTonnes: number
      purchasedElectricityCO2eTonnes: number
      thirdPartyMobileCO2eTonnes: number
    }
  }
  memoItems: { biogenicCO2Tonnes: number }
  supportingScope2: { purchasedElectricityCO2eTonnes: number }
  supportingScope3: { thirdPartyMobileCO2eTonnes: number }
  intensityMetrics: PulpPaperIntensityMetrics
  chpAllocations: ChpAllocationResult[]
  reconciliation: {
    checked: boolean
    disclosedGrossCO2eTonnes: number | null
    modelledGrossCO2eTonnes: number
    variancePercent: number | null
    note: string
    lines: ReconciliationLine[]
  }
  assumptions: AssumptionEntry[]
  dataQuality: { defaultsUsed: string[]; fallbacksApplied: string[]; overall: string }
  warnings: ValidationMessage[]
  errors: ValidationMessage[]
  calculationTrace: TraceEntry[]
  factorSnapshots: FactorSnapshot[]
  auditStatus: { workflowStatus: string; calculatedAt: string }
}
