/**
 * Type model for the Iron & Steel Scope 1 engine.
 *
 * 13 source categories (per the Steel_Scope1_Calculator_Enhanced.xlsx layout):
 *   stationary, mobile, cokeOven, flaring, sinter, dri, bfBof, eaf, limeKiln,
 *   fugitiveHFC, fugitiveSF6, fugitiveOther, reported.
 *
 * Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + HFCs + SF6). Biogenic CO2
 * goes to the memo (excluded from Scope 1) per GHG Protocol convention;
 * biogenic CH4 / N2O DO count.
 */

import type { Quantity, TraceEntry, FactorSnapshot, ValidationMessage } from '../types'
import type { IronSteelGwpSet } from './constants'

// Re-export sector-agnostic primitives so I&S consumers don't reach across packs.
export type { GasAmounts, ReportedEntry, EmissionBasis, ReconciliationLine, AssumptionEntry } from '../oilgas/types'
export type { IronSteelGwpSet }

/* ----------------------------- facility / route -------------------------- */

export type ProcessRoute =
  | 'BF_BOF'          // Integrated coke + sinter + BF + BOF
  | 'EAF'             // Scrap-based EAF
  | 'DRI_EAF_GAS'     // Natural-gas DRI shaft + EAF (MIDREX/Energiron)
  | 'DRI_EAF_COAL'    // Coal-based rotary kiln DRI + EAF (typical India)
  | 'DRI_EAF_H2'      // Green H2-based DRI + EAF (HYBRIT / H2GS)
  | 'INDUCTION'       // Induction furnace route (India / Asia small-scale)
  | 'INTEGRATED'      // Mixed BF-BOF + EAF on one site
  | 'MIXED'           // Portfolio aggregate

export interface IronSteelFacility {
  name: string
  processRoute: ProcessRoute
  state?: string
  country?: string
  hasOwnPowerPlant?: boolean
}

/* -------------------------- methods + applicability ---------------------- */

export type IsStationaryMethod = 'ENERGY_BASED' | 'CARBON_CONTENT_BASED' | 'DIRECT_MEASUREMENT'
export type IsMobileMethod = 'FUEL_BASED' | 'DISTANCE_BASED'
export type IsHfcMethod = 'MASS_BALANCE' | 'SCREENING'
export type IsSinterMethod = 'TIER1_DEFAULT' | 'TIER2_CARBON_BALANCE'
export type IsCokeMethod = 'TIER1_DEFAULT' | 'TIER2_CARBON_BALANCE'
export type IsBfBofMethod = 'TIER1_INTEGRATED' | 'TIER2_CARBON_BALANCE'
export type IsEafMethod = 'TIER1_ELECTRODES_ONLY' | 'TIER2_FULL_BALANCE'
export type IsDriMethod = 'TIER1_DEFAULT' | 'TIER2_CARBON_BALANCE'

export interface IronSteelMethodSelections {
  stationaryMethod: IsStationaryMethod
  mobileMethod: IsMobileMethod
  sinterMethod: IsSinterMethod
  cokeMethod: IsCokeMethod
  bfBofMethod: IsBfBofMethod
  eafMethod: IsEafMethod
  driMethod: IsDriMethod
  electricityMethod: 'LOCATION_BASED_SUPPORTING' | 'MARKET_BASED_SUPPORTING'
  /** Process gas allocation per Section 8.2 of the research brief. */
  processGasAllocation: 'POINT_OF_EMISSION' | 'CARBON_ALLOCATION_UPSTREAM' | 'ENERGY_BASED_CHP'
}

export interface IronSteelSourceApplicability {
  stationaryCombustion: boolean
  mobile: boolean
  cokeOven: boolean
  flaring: boolean
  sinter: boolean
  dri: boolean
  bfBof: boolean
  eaf: boolean
  limeKiln: boolean
  fugitiveHFC: boolean
  fugitiveSF6: boolean
  fugitiveOther: boolean
  reported: boolean
  purchasedElectricity: boolean
}

/* ------------------------------ entry types ------------------------------ */

/** Stationary fossil / process-gas combustion (boilers, reheat furnaces, hot-blast stoves). */
export interface FuelEntry {
  id: string
  label: string
  fuelCode: string
  technology?: string      // BOILER, REHEAT_FURNACE, COKE_OVEN_UNDERFIRING, HOT_BLAST_STOVE, TURBINE...
  quantity: Quantity
  quantityUnit: string
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  carbonContentFraction?: Quantity   // for CARBON_CONTENT_BASED (Tier 3/4)
  oxidationFactor?: Quantity         // default 1.0 per IPCC 2006
  directCo2Tonnes?: Quantity         // Tier 4 CEMS
  useIndiaNatcom?: boolean           // toggle to use India NATCOM CEF override
  /** Mark fuel origin: fossil contributes to gross; biomass routes CO2 to memo. */
  origin?: 'FOSSIL' | 'BIOMASS'
  evidenceReference?: string
  overrideReason?: string
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
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Onsite coke production (carbon balance: coal C in − coke C out − by-product C). */
export interface CokeOvenEntry {
  id: string
  label: string
  method: IsCokeMethod
  /** Tier 1: coke produced × default EF. */
  cokeProducedTonnes?: Quantity
  ef?: Quantity                  // tCO2/t coke override (defaults to 0.56)
  /** Tier 2: carbon balance inputs. */
  cokingCoalChargedTonnes?: Quantity
  cokingCoalCarbonFraction?: Quantity   // default 0.79
  cokeOutTonnes?: Quantity
  cokeCarbonFraction?: Quantity         // default 0.875
  cogProducedNm3?: Quantity             // exported COG (carbon credit)
  cogCarbonKgPerNm3?: Quantity          // default 0.10 mol C/mol × MW
  tarBtxProducedTonnes?: Quantity       // by-product carbon retained (not emitted)
  tarCarbonFraction?: Quantity          // default 0.85
  evidenceReference?: string
  overrideReason?: string
}

/** Sinter plant (Tier 1 default or Tier 2 carbon balance with coke breeze). */
export interface SinterEntry {
  id: string
  label: string
  method: IsSinterMethod
  /** Tier 1: sinter produced × 0.20 tCO2/t. */
  sinterProducedTonnes?: Quantity
  ef?: Quantity   // tCO2/t sinter override (defaults to 0.20)
  /** Tier 2: carbon balance for sinter strand. */
  cokeBreezeConsumedTonnes?: Quantity
  cokeBreezeCarbonFraction?: Quantity   // default 0.875
  fluxLimestoneTonnes?: Quantity        // CaCO3 charged to sinter mix
  fluxDolomiteTonnes?: Quantity
  naturalGasConsumedGj?: Quantity
  /** N2O / CH4 from sintering (per 2019 Refinement). */
  sinterCh4EfKgPerTonne?: Quantity      // ~0.07 kg CH4/t sinter
  sinterN2oEfKgPerTonne?: Quantity      // ~0.025 kg N2O/t sinter
  evidenceReference?: string
  overrideReason?: string
}

/** Direct Reduced Iron — gas / coal / H2 routes have very different EFs. */
export interface DriEntry {
  id: string
  label: string
  driType: 'NATURAL_GAS' | 'COAL_BASED' | 'GREEN_HYDROGEN' | 'SYNGAS'
  method: IsDriMethod
  driProducedTonnes?: Quantity
  ef?: Quantity                          // tCO2/t DRI override
  /** Tier 2 carbon balance. */
  reductantConsumed?: Quantity
  reductantCarbonFraction?: Quantity
  reductantNcvGjPerUnit?: Quantity
  driCarbonFraction?: Quantity           // default 0.02 (gas), 0.003 (H2)
  ironOreConsumedTonnes?: Quantity       // mass-balance check
  evidenceReference?: string
  overrideReason?: string
}

/** BF (blast furnace) + BOF (basic oxygen furnace) combined or carbon balance. */
export interface BfBofEntry {
  id: string
  label: string
  method: IsBfBofMethod
  /** Tier 1: crude steel produced × integrated default 1.46 tCO2/t. */
  crudeSteelProducedTonnes?: Quantity
  bfEf?: Quantity                         // tCO2/t pig iron override (Tier 1 = 1.35)
  bofEf?: Quantity                        // tCO2/t crude steel override (Tier 1 integrated = 1.46)
  /** Tier 2 BF carbon balance. */
  cokeChargedTonnes?: Quantity
  cokeCarbonFraction?: Quantity            // default 0.875
  pciCoalTonnes?: Quantity                 // pulverised coal injection
  pciCarbonFraction?: Quantity             // default 0.79
  naturalGasInjectedGj?: Quantity
  limestoneChargedTonnes?: Quantity        // CaCO3 added directly to BF
  dolomiteChargedTonnes?: Quantity
  hotMetalProducedTonnes?: Quantity        // pig iron leaving BF
  hotMetalCarbonFraction?: Quantity        // default 0.043 (4.3%)
  bfgExportedNm3?: Quantity                // BFG exported to other unit/IPP
  bfgCarbonKgPerNm3?: Quantity             // for credit allocation
  /** Tier 2 BOF carbon balance (hot metal + scrap → crude steel + slag). */
  scrapChargedToBof?: Quantity
  bofSlagTonnes?: Quantity
  bofSlagCarbonFraction?: Quantity         // default 0.007
  bofgExportedNm3?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Electric Arc Furnace — electrodes + charge carbon + DRI/scrap C oxidation. */
export interface EafEntry {
  id: string
  label: string
  method: IsEafMethod
  crudeSteelProducedTonnes?: Quantity
  ef?: Quantity                            // tCO2/t crude steel override (Tier 1 electrodes = 0.08)
  /** Tier 2 carbon balance. */
  electrodeConsumedTonnes?: Quantity        // ~1–4 kg/t steel
  electrodeCarbonFraction?: Quantity        // default 0.99
  chargeCarbonTonnes?: Quantity             // anthracite, coke breeze, plastics, etc.
  chargeCarbonFraction?: Quantity           // default 0.83
  driChargedTonnes?: Quantity               // DRI/HBI carbon oxidation in EAF
  driCarbonFraction?: Quantity              // default 0.02
  scrapChargedTonnes?: Quantity
  scrapCarbonFraction?: Quantity            // default 0.004
  limeChargedTonnes?: Quantity
  dolomiteChargedTonnes?: Quantity
  oxyFuelNaturalGasGj?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Lime kiln onsite calcination + combustion. */
export interface LimeKilnEntry {
  id: string
  label: string
  kilnType: 'ROTARY' | 'SHAFT' | 'FLUIDIZED_BED'
  /** Combustion side. */
  fuelCode: string
  fuelQuantity: Quantity
  fuelQuantityUnit: string
  ncvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  ch4EfKgPerGj?: Quantity
  n2oEfKgPerGj?: Quantity
  /** Process side: calcination of charged limestone / dolomite. */
  limestoneChargedTonnes?: Quantity         // CaCO3
  dolomiteChargedTonnes?: Quantity
  calcinationFraction?: Quantity            // default 1.0 (full)
  evidenceReference?: string
  overrideReason?: string
}

/** Flaring of process gases (COG/BFG/BOFG) — combustion CO2 + CH4 slip. */
export interface FlaringEntry {
  id: string
  label: string
  gasType: 'COG' | 'BFG' | 'BOFG' | 'MIXED'
  flaredVolumeNm3: Quantity
  carbonKgPerNm3?: Quantity                // overrides default from PROCESS_GAS_CARBON
  combustionEfficiency?: Quantity          // default 0.98 (lit assisted)
  ch4SlipKgPerNm3?: Quantity               // residual CH4
  evidenceReference?: string
  overrideReason?: string
}

/** Refrigerant HFC fugitives — chillers, AC, cold-rolling oil chillers. */
export interface RefrigerantEntry {
  id: string
  label: string
  gasCode: string                          // r134a, r410a, r404a, ...
  method: IsHfcMethod
  /** Mass balance. */
  inventoryStartKg?: Quantity
  purchasedKg?: Quantity
  soldKg?: Quantity
  inventoryEndKg?: Quantity
  recoveredForRecycleKg?: Quantity
  /** Screening. */
  chargeKg?: Quantity
  annualLeakRate?: Quantity                // fraction 0–1
  gwpOverride?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** SF6 from high-voltage switchgear (own substations). */
export interface Sf6Entry {
  id: string
  label: string
  nameplateInventoryKg: Quantity
  annualLeakRate?: Quantity                // fraction; default by equipment age
  /** Or supply directly observed mass: */
  leakedMassKg?: Quantity
  gwpOverride?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/** Other fugitives — coal stockpile CH4, coke-oven seal CH4, NG line leaks. */
export interface OtherFugitiveEntry {
  id: string
  label: string
  source: 'COAL_STOCKPILE' | 'COKE_OVEN_SEAL' | 'NG_PIPELINE' | 'OTHER_CH4'
  /** Either direct mass or activity × EF. */
  ch4MassKg?: Quantity
  activityTonnes?: Quantity                // tonnes coal / coke / NG throughput
  efKgCh4PerTonne?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

/* ----------------------------- production data --------------------------- */

export interface IronSteelProduction {
  crudeSteelTonnes?: Quantity
  hotMetalTonnes?: Quantity
  sinterProducedTonnes?: Quantity
  pelletProducedTonnes?: Quantity
  cokeProducedTonnes?: Quantity
  hotRolledTonnes?: Quantity
  driProducedTonnes?: Quantity
}

/* --------------------------- input payload root -------------------------- */

import type { ReportedEntry } from '../oilgas/types'

export interface IronSteelActivityData {
  production: IronSteelProduction
  stationaryCombustion: FuelEntry[]
  mobile: MobileEntry[]
  cokeOven: CokeOvenEntry[]
  flaring: FlaringEntry[]
  sinter: SinterEntry[]
  dri: DriEntry[]
  bfBof: BfBofEntry[]
  eaf: EafEntry[]
  limeKiln: LimeKilnEntry[]
  fugitiveHFC: RefrigerantEntry[]
  fugitiveSF6: Sf6Entry[]
  fugitiveOther: OtherFugitiveEntry[]
  reported: ReportedEntry[]
  /** Disclosed gross Scope 1 figure for reconciliation (top-line). */
  disclosedGrossScope1CO2eTonnes?: Quantity
  /** Per-gas disclosed figures — let users reconcile CO2 / CH4 / N2O independently
   *  (common in BRSR Section A.III, ETS verified statements, worldsteel returns). */
  disclosedScope1CO2Tonnes?: Quantity
  disclosedScope1CH4Tonnes?: Quantity
  disclosedScope1N2OTonnes?: Quantity
  /** Disclosed Scope 2 (location-based) for supporting reconciliation. */
  disclosedScope2CO2eTonnes?: Quantity
  /** Disclosed intensity (kgCO2e per tonne crude steel) — many disclosures lead with this. */
  disclosedIntensityKgPerTcrudeSteel?: Quantity
  purchasedElectricity: { mwh: Quantity; gridEfTco2PerMwh: Quantity }
}

/** Boundary basis the user is reporting under. Required when reported entries
 *  contribute material share of gross. Captured in the audit trail so the
 *  verifier sees exactly which scope the disclosed totals describe. */
export type DisclosureBoundaryBasis =
  | 'STEELMAKING_SITES_ONLY'   // worldsteel / ISO 14404 site-level basis
  | 'ALL_SITES'                // corporate-aggregate including non-steelmaking sites
  | 'WSA_SCOPE_1_PLUS_1A'      // worldsteel Scope 1 + Scope 1.1 (purchased intermediates)
  | 'BRSR_BOUNDARY'            // India SEBI BRSR (Indian operations boundary)
  | 'EU_ETS'                   // EU ETS Annex I installation boundary
  | 'CBAM'                     // CBAM Annex II direct embedded emissions
  | 'CORPORATE_AGGREGATE'      // catch-all corporate reporting boundary
  | 'OTHER'                    // explain in note

export interface IronSteelInputPayload {
  calculationContext: {
    calculationType: 'ANNUAL_INVENTORY' | 'PARTIAL_PERIOD'
    reportingPeriod: { year: number; startDate: string; endDate: string }
    inventoryVersion: string
    gwpSet: IronSteelGwpSet
  }
  organization: { name: string; country: string; contactName?: string; contactEmail?: string; contactPhone?: string; contactRole?: string }
  facility: IronSteelFacility
  organizationBoundary: {
    boundaryMethod: 'OPERATIONAL_CONTROL' | 'FINANCIAL_CONTROL' | 'EQUITY_SHARE'
    ownershipSharePercent?: number
    consolidationPercent?: number
    justification?: string
  }
  sector: { sectorCode: 'IRON_STEEL' }
  methodSelections: IronSteelMethodSelections
  sourceApplicability: IronSteelSourceApplicability
  activityData: IronSteelActivityData
  /** Inventory-level disclosure metadata. Required when reported entries
   *  contribute material share of gross — captured in the audit trail. */
  disclosure?: {
    boundaryBasis?: DisclosureBoundaryBasis
    boundaryNote?: string
    publicReportUrl?: string
    publicReportPageReference?: string
  }
  factorOverrides: Record<string, { value: number; source?: string; reason?: string }>
}

/* -------------------------------- result --------------------------------- */

export type IronSteelCategory =
  | 'stationaryCombustion'
  | 'mobile'
  | 'cokeOven'
  | 'flaring'
  | 'sinter'
  | 'dri'
  | 'bfBof'
  | 'eaf'
  | 'limeKiln'
  | 'fugitiveHFC'
  | 'fugitiveSF6'
  | 'fugitiveOther'
  | 'reported'

import type { GasAmounts, ReconciliationLine, AssumptionEntry } from '../oilgas/types'

export interface IronSteelIntensityMetrics {
  /** kgCO2e per tonne crude steel (the canonical steel-sector KPI). */
  co2ePerTonneCrudeSteel?: number
  /** Per tonne hot-rolled steel (GSCC + ResponsibleSteel boundary). */
  co2ePerTonneHotRolled?: number
  /** Per tonne hot metal (BF output). */
  co2ePerTonneHotMetal?: number
  /** Fossil-only CO2 per t crude steel (excludes biogenic memo). */
  fossilCo2PerTonneCrudeSteel?: number
}

export interface IronSteelCalculationResult {
  calculationId: string | null
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'BLOCKED'
  sectorCode: 'IRON_STEEL'
  methodologyPack: string
  gwpSet: IronSteelGwpSet
  reportingPeriod: { year: number; startDate: string; endDate: string }
  scope1: {
    grossScope1CO2eTonnes: number
    byCategory: Record<IronSteelCategory, GasAmounts>
    byGas: {
      co2Tonnes: number
      ch4Tonnes: number
      ch4CO2eTonnes: number
      n2oTonnes: number
      n2oCO2eTonnes: number
      hfcCO2eTonnes: number
      sf6CO2eTonnes: number
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
  intensityMetrics: IronSteelIntensityMetrics
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
