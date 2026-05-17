/**
 * Type model for the cement Scope 1 calculation engine.
 *
 * Mirrors the master spec (sections 8 and 9). Two hard rules from the spec
 * are encoded in the types themselves:
 *
 *  - `null` means "missing / unknown", `0` means "confirmed actual zero".
 *    Activity quantities are therefore `number | null`, never coerced.
 *  - Scope 1 / Scope 2 / Scope 3 / biomass memo / net reporting are kept in
 *    separate buckets and never merged into a single hidden total.
 */

export type Quantity = number | null

export type SectorCode = 'CEMENT'

export type BoundaryMethod = 'OPERATIONAL_CONTROL' | 'FINANCIAL_CONTROL' | 'EQUITY_SHARE'

export type ProcessEmissionMethod = 'CSI_CLINKER_BASED' | 'US_EPA_CEMENT_BASED_FALLBACK'

export type ClinkerEmissionFactorMethod = 'PLANT_SPECIFIC_CAO_MGO' | 'CSI_DEFAULT_525' | 'IPCC_DEFAULT_510'

export type DustMethod = 'ACTUAL_DUST_DATA' | 'IPCC_2_PERCENT_FALLBACK' | 'NOT_APPLICABLE'

export type TocMethod = 'PLANT_SPECIFIC_TOC' | 'CSI_DEFAULT_TOC' | 'NOT_APPLICABLE'

export type FuelCombustionMethod = 'ENERGY_BASED' | 'CARBON_CONTENT_BASED' | 'DIRECT_MEASUREMENT'

export type MobileCombustionMethod = 'FUEL_BASED' | 'EQUIPMENT_HOURS_BASED' | 'DISTANCE_BASED'

export type ElectricityMethod = 'LOCATION_BASED_SUPPORTING' | 'MARKET_BASED_SUPPORTING'

export type BoughtClinkerMethod = 'CSI_NET_CLINKER_PURCHASES' | 'NONE'

export type NetReportingMethod = 'NONE' | 'GROSS_MINUS_EMISSION_RIGHTS'

export type FuelCategory =
  | 'CONVENTIONAL_FOSSIL'
  | 'ALTERNATIVE_FOSSIL'
  | 'BIOMASS'
  | 'MIXED'

export type GwpSet = 'AR5' | 'AR6'

export interface ReportingPeriod {
  year: number
  startDate: string
  endDate: string
}

export interface CalculationContext {
  calculationType: 'ANNUAL_INVENTORY' | 'PARTIAL_PERIOD'
  reportingPeriod: ReportingPeriod
  inventoryVersion: string
  gwpSet: GwpSet
}

export interface OrganizationInput {
  name: string
  cin?: string | null
  pan?: string | null
  country: string
}

export interface FacilityInput {
  name: string
  facilityType: 'INTEGRATED_CEMENT' | 'CLINKER_UNIT' | 'GRINDING_UNIT'
  state?: string | null
  city?: string | null
}

export interface OrganizationBoundary {
  boundaryMethod: BoundaryMethod
  ownershipSharePercent: number
  consolidationPercent: number
}

export interface MethodSelections {
  processEmissionMethod: ProcessEmissionMethod
  clinkerEmissionFactorMethod: ClinkerEmissionFactorMethod
  dustMethod: DustMethod
  tocMethod: TocMethod
  fuelCombustionMethod: FuelCombustionMethod
  mobileCombustionMethod: MobileCombustionMethod
  electricityMethod: ElectricityMethod
  boughtClinkerMethod: BoughtClinkerMethod
  netReportingMethod: NetReportingMethod
}

/** A source can be excluded only with a recorded reason (spec validation). */
export interface SourceApplicability {
  clinkerCalcination: boolean
  bypassDust: boolean
  ckd: boolean
  rawMealToc: boolean
  kilnFuels: boolean
  nonKilnFuels: boolean
  mobile: boolean
  fugitive: boolean
  purchasedElectricity: boolean
  boughtClinker: boolean
  exclusionReasons?: Record<string, string>
}

export interface FuelEntry {
  id: string
  label: string
  fuelCode: string
  category: FuelCategory
  /** Quantity in `quantityUnit`. null = unknown. */
  quantity: Quantity
  quantityUnit: string
  /** GJ per quantityUnit. Used by ENERGY_BASED. */
  lhvGjPerUnit?: Quantity
  /** kgCO2 per GJ. Used by ENERGY_BASED. */
  co2EfKgPerGj?: Quantity
  /** tonne C per tonne fuel. Used by CARBON_CONTENT_BASED. */
  carbonContentFraction?: Quantity
  /** Directly metered tonnes CO2. Used by DIRECT_MEASUREMENT. */
  directCo2Tonnes?: Quantity
  /** 0..1 share of carbon that is biogenic. null = unknown split. */
  biomassFraction?: Quantity
  /** kgCH4 per GJ (non-CSI addendum). */
  ch4EfKgPerGj?: Quantity
  /** kgN2O per GJ (non-CSI addendum). */
  n2oEfKgPerGj?: Quantity
}

export interface MobileEntry {
  id: string
  label: string
  ownership: 'OWNED_CONTROLLED' | 'THIRD_PARTY'
  fuelCode: string
  quantity: Quantity
  quantityUnit: string
  lhvGjPerUnit?: Quantity
  co2EfKgPerGj?: Quantity
  /** EQUIPMENT_HOURS_BASED: operating hours and consumption rate (unit/hr). */
  operatingHours?: Quantity
  consumptionRatePerHour?: Quantity
  /** DISTANCE_BASED: distance (km) and economy (unit/km). */
  distanceKm?: Quantity
  fuelPerKm?: Quantity
}

export interface FugitiveEntry {
  id: string
  label: string
  /** Gas code from the gas library (refrigerants, SF6, ...). */
  gasCode: string
  /** Mass of gas released over the period. null = unknown. */
  leakedKg: Quantity
  /** Override the library GWP for this gas (e.g. supplier blend GWP). */
  gwpOverride?: Quantity
}

export interface ActivityData {
  production: {
    clinkerProducedTonnes: Quantity
    cementProducedTonnes: Quantity
    cementitiousProductTonnes: Quantity
  }
  clinkerChemistry: {
    caoPercent: Quantity
    caoNonCarbonatePercent: Quantity
    mgoPercent: Quantity
    mgoNonCarbonatePercent: Quantity
  }
  dust: {
    ckdLeavingKilnTonnes: Quantity
    ckdCalcinationRate: Quantity
    bypassDustLeavingKilnTonnes: Quantity
    bypassDustCalcinationRate: Quantity
  }
  rawMeal: {
    rawMealToClinkerRatio: Quantity
    tocFraction: Quantity
  }
  kilnFuels: FuelEntry[]
  nonKilnFuels: FuelEntry[]
  mobile: MobileEntry[]
  fugitive: FugitiveEntry[]
  purchasedElectricity: {
    mwh: Quantity
    gridEfTco2PerMwh: Quantity
  }
  boughtClinker: {
    externalClinkerBoughtTonnes: Quantity
    externalClinkerSoldTonnes: Quantity
  }
  emissionRights: {
    acquiredTonnes: Quantity
  }
  /** US_EPA fallback inputs (used only when clinker data is unavailable). */
  usEpaFallback: {
    cementProducedTonnes: Quantity
    clinkerToCementRatio: Quantity
    clinkerEfTco2PerTonne: Quantity
  }
}

/** User customisation: override any seed factor/constant with a reason. */
export interface FactorOverride {
  value: number
  reason: string
  source?: string
}

export interface InputPayload {
  calculationContext: CalculationContext
  organization: OrganizationInput
  facility: FacilityInput
  organizationBoundary: OrganizationBoundary
  sector: { sectorCode: SectorCode }
  methodSelections: MethodSelections
  sourceApplicability: SourceApplicability
  activityData: ActivityData
  factorOverrides: Record<string, FactorOverride>
  auditMetadata?: { preparedBy?: string; notes?: string }
}

/* ------------------------------------------------------------------ */
/* Result model (spec section 9)                                       */
/* ------------------------------------------------------------------ */

export type Severity = 'ERROR' | 'WARNING'

export interface ValidationMessage {
  code: string
  severity: Severity
  message: string
  fieldPath?: string
}

export interface FactorSnapshot {
  factorCode: string
  factorName: string
  value: number
  unit: string
  source: string
  sourceVersion: string
  factorYear: number | null
  priorityRank: number
  isDefault: boolean
  overridden: boolean
  overrideReason?: string
}

export interface TraceEntry {
  step: string
  category: string
  method?: string
  formula: string
  inputs: Record<string, number | string | null>
  factorSnapshots: FactorSnapshot[]
  outputTonnesCO2: number
  fallbackApplied?: string
}

export interface CalculationResult {
  calculationId: string | null
  status: 'SUCCESS' | 'SUCCESS_WITH_WARNINGS' | 'BLOCKED'
  sectorCode: SectorCode
  methodologyPack: string
  reportingPeriod: ReportingPeriod
  scope1: {
    grossScope1CO2Tonnes: number
    components: {
      clinkerCalcinationCO2Tonnes: number
      bypassDustCO2Tonnes: number
      ckdCO2Tonnes: number
      rawMealTocCO2Tonnes: number
      conventionalKilnFuelCO2Tonnes: number
      alternativeFossilKilnFuelCO2Tonnes: number
      nonKilnFossilCO2Tonnes: number
      mobileCombustionCO2Tonnes: number
      fugitiveCO2eTonnes: number
    }
    excludedFromGrossScope1: {
      biomassCO2MemoTonnes: number
      purchasedElectricityCO2Tonnes: number
      boughtClinkerCO2Tonnes: number
      emissionRightsTonnes: number
    }
  }
  /** Non-CSI addendum: combustion CH4/N2O as CO2e, kept separate from the CSI CO2 total. */
  nonCsiCombustionGhg: {
    ch4N2oCO2eTonnes: number
    gwpSet: GwpSet
    note: string
  }
  memoItems: {
    biomassCO2Tonnes: number
  }
  supportingScope2: {
    purchasedElectricityCO2Tonnes: number
  }
  supportingScope3: {
    boughtClinkerCO2Tonnes: number
  }
  optionalNetReporting: {
    method: NetReportingMethod
    acquiredEmissionRightsTonnes: number
    netCO2Tonnes: number | null
  }
  intensityMetrics: {
    grossCO2PerTonneClinker: number | null
    grossCO2PerTonneCementitious: number | null
  }
  dataQuality: {
    defaultsUsed: string[]
    fallbacksApplied: string[]
    overall: 'PLANT_SPECIFIC' | 'MIXED' | 'DEFAULTS_HEAVY'
  }
  warnings: ValidationMessage[]
  errors: ValidationMessage[]
  calculationTrace: TraceEntry[]
  factorSnapshots: FactorSnapshot[]
  auditStatus: {
    workflowStatus: 'DRAFT'
    calculatedAt: string
  }
}
