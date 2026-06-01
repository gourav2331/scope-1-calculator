/**
 * Type model for the Power Sector Scope 1 calculator (thermal generators
 * MVP scope: coal / gas / oil / biomass / waste-to-energy + CHP).
 */

import type {
  FactorSnapshot,
  Quantity,
  TraceEntry,
  ValidationMessage,
} from '../types'
import type { PowerGwpSet } from './constants'

export type { PowerGwpSet }

export interface GasAmounts {
  co2Tonnes: number
  ch4Tonnes: number
  n2oTonnes: number
  sf6Tonnes: number
  hfcCO2eTonnes: number
  biogenicCO2Tonnes: number  // memo only — NOT in gross
  co2eTonnes: number
}

/* ----------------------- Plant / unit primary technology ------------------ */

/** Primary plant technology — drives source applicability and CH4/N2O techs. */
export type PowerPlantTechnology =
  | 'PC_SUBCRITICAL'           // pulverised coal, subcritical
  | 'PC_SUPERCRITICAL'         // pulverised coal, supercritical
  | 'PC_ULTRA_SUPERCRITICAL'   // pulverised coal, ultra-supercritical
  | 'CFB_COAL'                 // circulating fluidised bed — coal
  | 'IGCC'                     // integrated gasification combined cycle
  | 'OCGT'                     // open-cycle gas turbine (peaker)
  | 'CCGT'                     // combined-cycle gas turbine
  | 'RECIPROCATING_ENGINE'     // gas / diesel reciprocating engine
  | 'BIOMASS_STEAM'            // dedicated biomass steam plant
  | 'WASTE_STEAM'              // dedicated waste-to-energy plant
  | 'OIL_STEAM'                // residual-oil steam plant
  | 'CHP'                      // generic combined heat & power
  | 'MIXED'                    // multiple units, mixed technologies

/* ----------------------- Method selections per category ------------------- */

export type StationaryCombustionMethod =
  | 'ENERGY_BASED'        // Tier 1/2: qty × NCV × EF
  | 'CARBON_CONTENT_BASED' // Tier 3: qty × %C × 44/12 × OF
  | 'DIRECT_MEASUREMENT'  // Tier 5: CEMS direct entry

export type MobileCombustionMethod =
  | 'FUEL_BASED'          // qty × NCV × EF
  | 'DISTANCE_BASED'      // km × g/km

export type FgdMethod =
  | 'STOICHIOMETRIC'  // mass × purity × 0.440
  | 'NOT_APPLICABLE'  // no wet FGD

export type ScrSncrMethod =
  | 'UREA_STOICHIOMETRIC' // mass × purity × 0.733
  | 'AMMONIA_DIRECT'      // direct CO2 (rare; mostly N2O)
  | 'NOT_APPLICABLE'      // no SCR/SNCR

export type Sf6Method =
  | 'MASS_BALANCE'        // EPA Subpart DD / EU ETS Annex IV preferred
  | 'DEFAULT_LEAK_RATE'   // nameplate × manufacturer leak rate

export type HfcMethod =
  | 'MASS_BALANCE'        // inventory start + purchased - sold - end - recovered
  | 'EQUIPMENT_BASED'     // charge × leak rate × period

export type CcusMethod =
  | 'NOT_APPLICABLE'
  | 'CAPTURED_AND_STORED' // net off gross + permanence warning

export interface PowerMethodSelections {
  stationaryMethod: StationaryCombustionMethod
  mobileMethod: MobileCombustionMethod
  fgdMethod: FgdMethod
  scrMethod: ScrSncrMethod
  sf6Method: Sf6Method
  hfcMethod: HfcMethod
  ccusMethod: CcusMethod
  /** Default tier reported on Step 5 audit trail. */
  defaultTier: 'TIER_1' | 'TIER_2' | 'TIER_3' | 'TIER_5_CEMS'
}

/* ----------------------- Source applicability ----------------------------- */

export interface PowerSourceApplicability {
  stationaryMain: boolean         // primary boilers / turbines
  stationaryAuxiliary: boolean    // startup / aux boilers / gensets
  biomassCofiring: boolean        // biomass / waste streams
  mobile: boolean
  fgdLimestone: boolean
  scrUrea: boolean
  fugitiveSF6: boolean
  fugitiveHFC: boolean
  fugitiveOtherCH4: boolean
  ccus: boolean
  reported: boolean
  purchasedElectricity: boolean   // supporting Scope 2
}

/* ----------------------- Activity entries --------------------------------- */

export interface FuelEntry {
  id: string
  label: string
  fuelCode: string
  /** Combustion technology — picks the CH4/N2O default. */
  technology: string
  quantity: Quantity
  quantityUnit: string
  /** Optional NCV override (LHV). */
  ncvGjPerUnit?: Quantity
  /** Optional CO2 EF override. */
  co2EfKgPerGj?: Quantity
  /** Optional CH4 EF override. */
  ch4EfKgPerGj?: Quantity
  /** Optional N2O EF override. */
  n2oEfKgPerGj?: Quantity
  /** Optional biomass fraction override (for mixed/waste fuels). */
  biomassFraction?: Quantity
  /** Optional oxidation factor (Tier 3 ash carbon balance). */
  oxidationFactor?: Quantity
  /** Optional plant-specific carbon content (Tier 3). */
  carbonContentFraction?: Quantity
  /** India NATCOM CEF used for this coal row. */
  useIndiaNatcom?: boolean
  /** CEMS-measured CO2 if defaultTier is TIER_5_CEMS — overrides AD×EF chain. */
  cemsCo2Tonnes?: Quantity
  /** Required for any override. */
  overrideReason?: string
  evidenceReference?: string
}

export interface MobileEntry {
  id: string
  label: string
  ownership: 'OWNED_CONTROLLED' | 'THIRD_PARTY'
  vehicleCode: string
  quantity: Quantity
  quantityUnit: string
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  overrideReason?: string
  evidenceReference?: string
}

export interface FgdEntry {
  id: string
  label: string
  /** Mass of limestone reagent consumed (tonnes). */
  limestoneTonnes: Quantity
  /** CaCO3 purity fraction; default 0.92. */
  purity?: Quantity
  evidenceReference?: string
}

export interface ScrSncrEntry {
  id: string
  label: string
  /** Mass of urea consumed (tonnes). For solution: solution_kg × concentration. */
  ureaTonnes: Quantity
  /** Urea purity; default 0.99 for solid. */
  purity?: Quantity
  /** Optional N2O slip from SCR (kg N2O/yr) — direct measurement. */
  scrN2oSlipKg?: Quantity
  evidenceReference?: string
}

export interface Sf6Entry {
  id: string
  label: string
  equipmentClass: keyof typeof import('./constants').SF6_LEAK_RATES
  method: Sf6Method
  /** Nameplate SF6 inventory in service (kg). */
  nameplateInventoryKg: Quantity
  /** Mass-balance terms (when method = MASS_BALANCE). */
  inventoryStartKg?: Quantity
  inventoryEndKg?: Quantity
  purchasedKg?: Quantity
  soldKg?: Quantity
  recoveredKg?: Quantity
  /** Equipment-installed (new units). */
  inNewEquipmentKg?: Quantity
  /** Equipment-retired (removed). */
  inRetiredEquipmentKg?: Quantity
  /** Optional leak rate override (fraction/yr). */
  leakRateOverride?: Quantity
  overrideReason?: string
  evidenceReference?: string
}

export interface HfcEntry {
  id: string
  label: string
  gasCode: string  // r134a / r410a / r404a etc.
  method: HfcMethod
  /** Mass-balance terms (preferred). */
  inventoryStartKg?: Quantity
  inventoryEndKg?: Quantity
  purchasedKg?: Quantity
  soldKg?: Quantity
  recoveredKg?: Quantity
  /** Equipment-based fallback (when method = EQUIPMENT_BASED). */
  chargeKg?: Quantity
  annualLeakRate?: Quantity  // fraction/yr
  gwpOverride?: Quantity
  overrideReason?: string
  evidenceReference?: string
}

export interface OtherFugitiveCh4Entry {
  id: string
  label: string
  source: 'COAL_STORAGE' | 'COAL_HANDLING' | 'NATURAL_GAS_PIPEWORK' | 'OTHER'
  /** Activity proxy — t coal or GJ gas throughput. */
  activityQuantity: Quantity
  activityUnit: 't_coal' | 't_coal_handled' | 'GJ_gas' | 'other'
  /** Optional EF override. */
  efKgCh4PerUnit?: Quantity
  evidenceReference?: string
}

export interface CcusEntry {
  id: string
  label: string
  /** Tonnes CO2 captured and securely stored (deducted from gross). */
  capturedAndStoredTonnes: Quantity
  /** Tonnes CO2 captured and utilised (NOT deducted — short-cycle re-release). */
  capturedAndUtilisedTonnes?: Quantity
  /** Tonnes CO2 vented from the capture process itself (start-up etc.). */
  processVentTonnes?: Quantity
  mrvProtocol: 'EU_ETS_ARTICLE_49' | 'EPA_SUBPART_RR' | 'EPA_SUBPART_PP' | 'ISO_27914' | 'OTHER'
  storageReference?: string
  evidenceReference?: string
}

export interface ReportedEntry {
  id: string
  label: string
  source?: string
  basis: 'measured' | 'estimated' | 'inferred' | 'reported' | 'residual'
  totalCO2eTonnes?: Quantity
  co2Tonnes?: Quantity
  ch4Tonnes?: Quantity
  n2oTonnes?: Quantity
  evidenceReference?: string
  note?: string
}

/* ----------------------- Production / facility --------------------------- */

export interface PowerProduction {
  /** Gross electrical generation at terminals (MWh). */
  grossGenerationMwh?: Quantity
  /** Net electrical generation sent out after auxiliary load (MWh). */
  netGenerationMwh?: Quantity
  /** Auxiliary power consumption %. */
  auxiliaryPowerPercent?: Quantity
  /** For CHP: heat supplied (GJ). */
  heatSuppliedGj?: Quantity
  /** Reporting-period operating hours per unit (annual). */
  operatingHoursYr?: Quantity
}

/* ----------------------- Facility ----------------------------------------- */

export interface PowerFacility {
  name: string
  state?: string
  country?: string
  technology: PowerPlantTechnology
  /** Number of generating units. */
  numberOfUnits?: number
  /** Plant nameplate capacity (MW). */
  nameplateCapacityMw?: number
  /** Reporting period — financial year typically. */
  commissioningYear?: number
  /** CHP plant — heat output reported separately. */
  isChp?: boolean
  /** CCUS installed (drives CCUS card). */
  hasCcus?: boolean
}

/* ----------------------- Activity data ------------------------------------ */

export interface PowerActivityData {
  production: PowerProduction
  stationaryMain: FuelEntry[]
  stationaryAuxiliary: FuelEntry[]
  biomassCofiring: FuelEntry[]
  mobile: MobileEntry[]
  fgd: FgdEntry[]
  scr: ScrSncrEntry[]
  fugitiveSF6: Sf6Entry[]
  fugitiveHFC: HfcEntry[]
  fugitiveOtherCH4: OtherFugitiveCh4Entry[]
  ccus: CcusEntry[]
  reported: ReportedEntry[]
  /** Top-line disclosed Scope 1 (for reconciliation). */
  disclosedGrossScope1CO2eTonnes?: Quantity
  disclosedScope1CO2Tonnes?: Quantity
  disclosedScope1CH4Tonnes?: Quantity
  disclosedScope1N2OTonnes?: Quantity
  disclosedScope2CO2eTonnes?: Quantity
  /** Disclosed intensity (kg CO2e per MWh net) — the canonical power KPI. */
  disclosedIntensityKgPerMwhNet?: Quantity
  purchasedElectricity: { mwh: Quantity; gridEfTco2PerMwh: Quantity }
}

/* ----------------------- Disclosure metadata ----------------------------- */

export type PowerDisclosureBoundaryBasis =
  | 'OPERATIONAL_CONTROL'       // GHG Protocol default
  | 'FINANCIAL_CONTROL'
  | 'EQUITY_SHARE'
  | 'EU_ETS_INSTALLATION'       // Annex I per EU ETS MRR
  | 'US_EPA_GHGRP'              // 40 CFR Part 98 Subpart D
  | 'INDIA_CEA_BOUNDARY'        // CEA station-level
  | 'BRSR_BOUNDARY'             // SEBI BRSR
  | 'CORPORATE_AGGREGATE'
  | 'OTHER'

/* ----------------------- Input payload ------------------------------------ */

export interface PowerInputPayload {
  calculationContext: {
    calculationType: 'ANNUAL_INVENTORY' | 'PARTIAL_PERIOD'
    reportingPeriod: { year: number; startDate: string; endDate: string }
    inventoryVersion: string
    gwpSet: PowerGwpSet
  }
  organization: {
    name: string
    country: string
    contactName?: string
    contactEmail?: string
    contactPhone?: string
    contactRole?: string
  }
  facility: PowerFacility
  organizationBoundary: {
    boundaryMethod: 'OPERATIONAL_CONTROL' | 'FINANCIAL_CONTROL' | 'EQUITY_SHARE'
    ownershipSharePercent?: number
    consolidationPercent?: number
    justification?: string
  }
  sector: { sectorCode: 'POWER' }
  methodSelections: PowerMethodSelections
  sourceApplicability: PowerSourceApplicability
  activityData: PowerActivityData
  /** Disclosure metadata — boundary basis, public report URL, page ref. */
  disclosure?: {
    boundaryBasis?: PowerDisclosureBoundaryBasis
    boundaryNote?: string
    publicReportUrl?: string
    publicReportPageReference?: string
  }
  factorOverrides: Record<string, { value: number; source?: string; reason?: string }>
}

/* ----------------------- Result model ------------------------------------- */

export interface ByCategory {
  stationaryMain: GasAmounts
  stationaryAuxiliary: GasAmounts
  biomassCofiring: GasAmounts
  mobile: GasAmounts
  fgdLimestone: GasAmounts
  scrUrea: GasAmounts
  fugitiveSF6: GasAmounts
  fugitiveHFC: GasAmounts
  fugitiveOtherCH4: GasAmounts
  ccusVenting: GasAmounts
  reported: GasAmounts
}

export interface ReconciliationLine {
  metric: 'GROSS_CO2E' | 'CO2' | 'CH4' | 'N2O' | 'SCOPE2' | 'INTENSITY'
  label: string
  unit: string
  disclosed: number | null
  modelled: number
  variancePercent: number | null
  withinThreshold: boolean
}

export interface AssumptionEntry {
  kind: 'DEFAULT' | 'FALLBACK' | 'OVERRIDE' | 'ESTIMATED'
  label: string
  detail: string
}

export interface PowerIntensityMetrics {
  co2ePerMwhNet?: number
  co2ePerMwhGross?: number
  fossilCo2PerMwhNet?: number
  co2ePerGjHeatInput?: number
}

export interface PowerCalculationResult {
  calculationId: string
  methodologyPack: string
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'BLOCKED'
  gwpSet: PowerGwpSet
  reportingPeriod: { year: number; startDate: string; endDate: string }
  /** Captures captured-and-stored deducted from gross (CCUS net-off). */
  ccsCapturedAndStoredTonnes: number
  scope1: {
    byCategory: ByCategory
    byGas: GasAmounts
    grossScope1CO2eTonnes: number
  }
  memoItems: {
    biogenicCO2Tonnes: number
    /** Tonnes CO2 vented during CCS process (NOT in gross — but flagged). */
    ccsProcessVentTonnes: number
  }
  supportingScope2: { purchasedElectricityCO2eTonnes: number }
  supportingScope3: { thirdPartyMobileCO2eTonnes: number }
  intensityMetrics: PowerIntensityMetrics
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
