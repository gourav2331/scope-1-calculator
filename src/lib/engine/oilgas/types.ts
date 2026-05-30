/**
 * Type model for the Oil & Gas Scope 1 calculation engine.
 *
 * Reuses the sector-agnostic primitives from the cement pack (`../types`):
 * `Quantity`, fuel/mobile entries, factor overrides/snapshots, trace entries,
 * boundary + reporting types. Adds the Oil & Gas six-category activity data
 * (IPIECA/API taxonomy) plus refrigerants and process units, and a gas-level
 * result model.
 *
 * Two hard rules carried over from the cement pack:
 *   - `null` = missing/unknown, `0` = confirmed actual zero (never coerced).
 *   - Scope buckets stay separate: biogenic CO2 is a memo, purchased
 *     electricity is supporting Scope 2, third-party mobile is supporting
 *     Scope 3 — none are merged into gross Scope 1.
 *
 * Unlike CSI cement (CO2-only), O&G gross Scope 1 is full CO2e across
 * CO2 + CH4 + N2O, because methane is a primary Scope 1 gas in this sector.
 */

import type { OilGasGwpSet } from './constants'
import type {
  ElectricityMethod,
  FactorOverride,
  FactorSnapshot,
  FuelCombustionMethod,
  FuelEntry,
  MobileCombustionMethod,
  MobileEntry,
  OrganizationBoundary,
  OrganizationInput,
  Quantity,
  ReportingPeriod,
  TraceEntry,
  ValidationMessage,
} from '../types'

export type { OilGasGwpSet } from './constants'

export type OilGasSegment = 'UPSTREAM' | 'MIDSTREAM' | 'DOWNSTREAM' | 'MIXED'

export type OilGasFacilityType =
  | 'UPSTREAM_ONSHORE'
  | 'UPSTREAM_OFFSHORE'
  | 'GAS_PROCESSING'
  | 'LNG'
  | 'PIPELINE_COMPRESSION'
  | 'REFINERY'
  | 'PETROCHEMICAL'
  | 'TERMINAL_STORAGE'
  | 'CORPORATE_AGGREGATE'

/** How a reported/disclosed figure was derived — for the assurance audit trail. */
export type EmissionBasis = 'MEASURED' | 'ESTIMATED' | 'INFERRED' | 'REPORTED' | 'RESIDUAL'

/**
 * A directly-entered emission from a public disclosure or client head-office
 * total, when activity data isn't available. Enter EITHER a direct CO2e total
 * OR by-gas masses (the engine applies the GWP set). Sits in its own 'reported'
 * bucket so it's never confused with bottom-up modelled sources.
 */
export interface ReportedEntry {
  id: string
  label: string
  /** Informational: which source this disclosed figure represents (free text). */
  categoryTag?: string
  /** Direct CO2e (tonnes). If set, it is authoritative for this entry. */
  co2eTonnes?: Quantity
  /** Otherwise, by-gas masses (tonnes); engine computes CO2e via the GWP set. */
  co2Tonnes?: Quantity
  ch4Tonnes?: Quantity
  n2oTonnes?: Quantity
  basis: EmissionBasis
  source?: string
  note?: string
}

export type FlareType =
  | 'steam_assisted_lit'
  | 'air_assisted_lit'
  | 'enclosed_ground'
  | 'unassisted_lit'
  | 'smoking'
  | 'unstable'
  | 'unlit'
  | 'acid_gas'
  | 'emergency_relief'

export type FlareOperatingStatus = 'lit' | 'partially_lit' | 'unlit' | 'unknown'

export type VolumeBasis = 'METERED' | 'MATERIAL_BALANCE' | 'ENGINEERING_ESTIMATE'

export type DreBasis = 'DEFAULT' | 'MEASURED' | 'ENGINEERING_ESTIMATE'

export type LdarMethod = 'TIER1_COUNT' | 'TIER2_LDAR' | 'TIER3_MEASURED'

export type RefrigerantTier = 'TIER1_CAPACITY' | 'TIER2_MASS_BALANCE'

export type ProcessType =
  | 'SMR_HYDROGEN'
  | 'FCC_REGEN'
  | 'AMINE_ACID_GAS'
  | 'GENERIC_EF'
  | 'DIRECT_CO2'

/** Molar (volume) composition of a gas stream, in mol%. */
export interface GasComposition {
  ch4Percent: Quantity
  co2Percent: Quantity
  c2h6Percent?: Quantity
  c3h8Percent?: Quantity
  c4PlusPercent?: Quantity
  n2Percent?: Quantity
  h2sPercent?: Quantity
  sampleDate?: string
  labId?: string
}

export interface FlareEntry {
  id: string
  label: string
  flareType: FlareType
  operatingStatus: FlareOperatingStatus
  /** Gas routed to the flare over the period (standard cubic metres). */
  flareVolumeSm3: Quantity
  volumeBasis: VolumeBasis
  composition: GasComposition
  dreBasis: DreBasis
  /** Override the destruction & removal efficiency (0..1). */
  dreValue?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

export interface VentEntry {
  id: string
  label: string
  ventReason?: string
  eventType: 'DESIGNED' | 'ABNORMAL'
  /** Gas vented over the period (standard cubic metres). */
  ventVolumeSm3: Quantity
  composition: GasComposition
  /** Vapour-recovery capture fraction (0..1). Residual = (1 - capture). */
  captureFraction?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

export interface FugitiveComponentEntry {
  id: string
  label: string
  /** Component class from COMPONENT_EF_DEFAULTS (e.g. valve_gas). */
  componentCode: string
  serviceType?: string
  count: Quantity
  /** Hours in service over the period. null => default 8760. */
  operatingHoursYr?: Quantity
  ldarMethod: LdarMethod
  /** Override the component leak factor (kg CH4/hr/source) — Tier 2/3 measured. */
  efKgCh4PerHrOverride?: Quantity
  /** Tier 3 directly measured CH4 mass (kg) for this component set. */
  measuredCh4Kg?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

export interface RefrigerantEntry {
  id: string
  label: string
  /** Gas code from the shared gas library (r134a, r410a, ...). */
  gasCode: string
  tier: RefrigerantTier
  /** Tier 1: system charge (kg) and annual leak rate (% per year). */
  chargeCapacityKg?: Quantity
  leakRatePercentYr?: Quantity
  /** Tier 2 mass balance: purchases, disposals, inventory change (closing - opening). */
  purchasesKg?: Quantity
  disposalsKg?: Quantity
  inventoryChangeKg?: Quantity
  gwpOverride?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

export interface ProcessEntry {
  id: string
  label: string
  processType: ProcessType
  /** SMR: hydrogen produced (t) with a tCO2/tH2 EF (grey-H2 benchmark). */
  hydrogenProducedTonnes?: Quantity
  smrEfTco2PerTonneH2?: Quantity
  /** SMR stoichiometric alternative: feedstock + fuel gas volumes. */
  feedstockGasSm3?: Quantity
  feedstockCh4Fraction?: Quantity
  fuelGasSm3?: Quantity
  fuelGasLhvGjPerSm3?: Quantity
  fuelGasCo2EfKgPerGj?: Quantity
  /** FCC catalyst regeneration: coke burned (t) and its carbon fraction. */
  cokeBurnedTonnes?: Quantity
  cokeCarbonFraction?: Quantity
  /** Amine acid-gas vent: acid gas volume and its CO2 mol fraction. */
  acidGasVolumeSm3?: Quantity
  acidGasCo2Fraction?: Quantity
  /** Capture before vent (0..1). CCS permanence accounting is deferred; this
   * only reduces the vented quantity for the period. */
  co2CaptureFraction?: Quantity
  /** Generic: throughput x EF. */
  throughput?: Quantity
  throughputUnit?: string
  efTco2PerUnit?: Quantity
  /** Direct metered process CO2 (t). */
  directCo2Tonnes?: Quantity
  /** Optional process CH4 / N2O (t) attached to this unit. */
  ch4Tonnes?: Quantity
  n2oTonnes?: Quantity
  evidenceReference?: string
  overrideReason?: string
}

export interface OilGasProduction {
  /** Upstream. */
  boeProduced?: Quantity
  oilProductionBbl?: Quantity
  gasProductionMMscf?: Quantity
  /** Mass of gas produced, for the methane-intensity denominator (kg or t). */
  gasProductionMassTonnes?: Quantity
  /** Downstream. */
  crudeProcessedBbl?: Quantity
  lngProducedTonnes?: Quantity
  /** Midstream. */
  throughputMMscf?: Quantity
}

export interface OilGasMassBalance {
  gasInSm3?: Quantity
  salesGasSm3?: Quantity
  fuelGasSm3?: Quantity
  flaredSm3?: Quantity
  ventedSm3?: Quantity
  fugitiveSm3?: Quantity
  inventoryChangeSm3?: Quantity
}

export interface OilGasActivityData {
  production: OilGasProduction
  stationaryCombustion: FuelEntry[]
  mobileCombustion: MobileEntry[]
  flaring: FlareEntry[]
  venting: VentEntry[]
  fugitiveComponents: FugitiveComponentEntry[]
  refrigerants: RefrigerantEntry[]
  process: ProcessEntry[]
  /** Directly-entered disclosed/reported totals (when activity data isn't available). */
  reported: ReportedEntry[]
  /** Supporting Scope 2 (kept out of gross Scope 1). */
  purchasedElectricity: { mwh: Quantity; gridEfTco2PerMwh: Quantity }
  /** Optional hydrocarbon mass-balance reconciliation (V1 §11.5). */
  massBalance?: OilGasMassBalance
  /** Optional disclosed gross Scope 1 (tCO2e) for disclosed-vs-modelled reconciliation. */
  disclosedGrossScope1CO2eTonnes?: Quantity
  /** Optional disclosed Scope 1 CO2 mass (tCO2) for per-gas reconciliation. */
  disclosedScope1CO2Tonnes?: Quantity
  /** Optional disclosed Scope 1 CH4 mass (tCH4) for per-gas reconciliation. */
  disclosedScope1CH4Tonnes?: Quantity
  /** Optional disclosed Scope 1 N2O mass (tN2O) for per-gas reconciliation. */
  disclosedScope1N2OTonnes?: Quantity
  /** Optional disclosed Scope 2 (tCO2e) for supporting-bucket reconciliation. */
  disclosedScope2CO2eTonnes?: Quantity
}

export interface OilGasSourceApplicability {
  stationaryCombustion: boolean
  mobileCombustion: boolean
  flaring: boolean
  venting: boolean
  fugitiveComponents: boolean
  refrigerants: boolean
  process: boolean
  reported: boolean
  purchasedElectricity: boolean
  exclusionReasons?: Record<string, string>
}

export interface OilGasFacilityInput {
  name: string
  segment: OilGasSegment
  facilityType: OilGasFacilityType
  state?: string | null
  city?: string | null
}

export interface OilGasMethodSelections {
  stationaryCombustionMethod: FuelCombustionMethod
  mobileCombustionMethod: MobileCombustionMethod
  electricityMethod: ElectricityMethod
}

export interface OilGasCalculationContext {
  calculationType: 'ANNUAL_INVENTORY' | 'PARTIAL_PERIOD'
  reportingPeriod: ReportingPeriod
  inventoryVersion: string
  gwpSet: OilGasGwpSet
}

export interface OilGasInputPayload {
  calculationContext: OilGasCalculationContext
  organization: OrganizationInput
  facility: OilGasFacilityInput
  organizationBoundary: OrganizationBoundary
  sector: { sectorCode: 'OIL_GAS' }
  methodSelections: OilGasMethodSelections
  sourceApplicability: OilGasSourceApplicability
  activityData: OilGasActivityData
  factorOverrides: Record<string, FactorOverride>
  auditMetadata?: { preparedBy?: string; notes?: string }
}

/* ------------------------------------------------------------------ */
/* Result model                                                        */
/* ------------------------------------------------------------------ */

/** Per-category emission breakdown. CO2e excludes biogenic CO2 (memo). */
export interface GasAmounts {
  co2Tonnes: number
  ch4Tonnes: number
  n2oTonnes: number
  co2eTonnes: number
  biogenicCO2Tonnes: number
}

export type OilGasCategory =
  | 'stationaryCombustion'
  | 'mobileCombustion'
  | 'flaring'
  | 'venting'
  | 'fugitiveComponents'
  | 'refrigerants'
  | 'process'
  | 'reported'

/** One disclosed-vs-modelled comparison (a gas, the gross total, or Scope 2). */
export interface ReconciliationLine {
  metric: 'GROSS_CO2E' | 'CO2' | 'CH4' | 'N2O' | 'SCOPE2' | 'INTENSITY'
  label: string
  unit: string
  disclosed: number | null
  modelled: number
  variancePercent: number | null
  withinThreshold: boolean
}

/** One row in the assumptions & limitations register. */
export interface AssumptionEntry {
  kind: 'DEFAULT' | 'FALLBACK' | 'OVERRIDE' | 'ESTIMATE'
  label: string
  detail: string
}

export interface OilGasCalculationResult {
  calculationId: string | null
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'BLOCKED'
  sectorCode: 'OIL_GAS'
  methodologyPack: string
  gwpSet: OilGasGwpSet
  reportingPeriod: ReportingPeriod
  scope1: {
    grossScope1CO2eTonnes: number
    byCategory: Record<OilGasCategory, GasAmounts>
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
  intensityMetrics: {
    co2ePerBoe: number | null
    co2ePerBblCrude: number | null
    co2ePerTonneLng: number | null
    co2ePerMMscfThroughput: number | null
    methaneIntensityPercent: number | null
  }
  dataQuality: {
    defaultsUsed: string[]
    fallbacksApplied: string[]
    overall: 'PLANT_SPECIFIC' | 'MIXED' | 'DEFAULTS_HEAVY' | 'REPORTED_AGGREGATE'
  }
  /** Auditable register of every default, fallback, override and estimate basis used. */
  assumptions: AssumptionEntry[]
  massBalance: {
    checked: boolean
    imbalancePercent: number | null
    note: string
  }
  /** Disclosed-vs-modelled reconciliation (present when any disclosed figure is supplied). */
  reconciliation: {
    checked: boolean
    /** Gross CO2e line, kept flat for back-compat with earlier consumers. */
    disclosedGrossCO2eTonnes: number | null
    modelledGrossCO2eTonnes: number
    variancePercent: number | null
    note: string
    /** One line per disclosed metric (gross, CO2, CH4, N2O, Scope 2). */
    lines: ReconciliationLine[]
  }
  warnings: ValidationMessage[]
  errors: ValidationMessage[]
  calculationTrace: TraceEntry[]
  factorSnapshots: FactorSnapshot[]
  auditStatus: { workflowStatus: 'DRAFT'; calculatedAt: string }
}
