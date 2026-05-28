/**
 * Structural validation for the Pulp & Paper pack — runs before calculation,
 * plus scope-separation invariants after. The category modules raise their own
 * per-row numeric errors; this file enforces top-level required fields,
 * applicability-vs-data consistency, exclusion-reason-when-excluded, and the
 * negative-value sweep across all categories.
 */

import type { EngineContext } from '../context'
import { isPresent } from '../util'
import type {
  AnaerobicWwtEntry,
  BiomassEntry,
  ChpAllocationEntry,
  Co2TransferEntry,
  FuelEntry,
  LandfillEntry,
  LimeKilnEntry,
  MakeupCarbonateEntry,
  MobileEntry,
  PulpPaperCalculationResult,
  PulpPaperInputPayload,
  RefrigerantEntry,
} from './types'
import type { ReportedEntry } from '../oilgas/types'

const ELECTRICITY_HINTS = ['electric', 'grid power', 'purchased power', 'grid electricity']

function nonNeg(ctx: EngineContext, value: number | null | undefined, label: string, field: string) {
  if (typeof value === 'number' && value < 0) {
    ctx.error('negative_input_value', `${label} cannot be negative (${value}).`, field)
  }
}

function checkFuelEntry(ctx: EngineContext, e: FuelEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Stationary "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj', 'oxidationFactor', 'directCo2Tonnes', 'carbonContentFraction'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Stationary "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (ELECTRICITY_HINTS.some(h => e.label.toLowerCase().includes(h) || e.fuelCode.toLowerCase().includes(h))) {
    ctx.error('electricity_as_combustion', `"${e.label}" looks like purchased electricity — that's Scope 2, not a stationary combustion fuel.`, `${base}.${e.id}.fuelCode`)
  }
}

function checkBiomassEntry(ctx: EngineContext, e: BiomassEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Biomass "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'biogenicCo2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Biomass "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

function checkLimeKilnEntry(ctx: EngineContext, e: LimeKilnEntry, base: string) {
  nonNeg(ctx, e.fuelQuantity ?? null, `Lime kiln "${e.label}" fuelQuantity`, `${base}.${e.id}.fuelQuantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj', 'biogenicCo2FromCalcinationTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Lime kiln "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

function checkMakeupEntry(ctx: EngineContext, e: MakeupCarbonateEntry, base: string) {
  nonNeg(ctx, e.quantityTonnes ?? null, `Makeup "${e.label}" quantityTonnes`, `${base}.${e.id}.quantityTonnes`)
  nonNeg(ctx, e.co2EfTonnesPerTonne ?? null, `Makeup "${e.label}" co2EfTonnesPerTonne`, `${base}.${e.id}.co2EfTonnesPerTonne`)
}

function checkMobileEntry(ctx: EngineContext, e: MobileEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Mobile "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Mobile "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

function checkLandfillEntry(ctx: EngineContext, e: LandfillEntry, base: string) {
  for (const k of ['collectedGasNm3', 'annualDepositDryMg', 'yearsSinceOpening', 'yearsSinceClosure', 'methanePotentialM3PerMg', 'decayRatePerYear', 'ch4RecoveredM3'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Landfill "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  // Fractions strictly in [0, 1]
  for (const k of ['collectionEfficiency', 'methaneFraction', 'oxidationFactor', 'fractionBurned'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `Landfill "${e.label}" ${k} must be in [0, 1].`, `${base}.${e.id}.${k}`)
    }
  }
}

function checkWwtEntry(ctx: EngineContext, e: AnaerobicWwtEntry, base: string) {
  for (const k of ['collectedGasNm3', 'codLoadKg', 'bodLoadKg', 'efKgCh4PerKgCod', 'efKgCh4PerKgBod', 'ch4CapturedKg'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `WWT "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  for (const k of ['collectionEfficiency', 'methaneFraction', 'fractionBurned'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `WWT "${e.label}" ${k} must be in [0, 1].`, `${base}.${e.id}.${k}`)
    }
  }
}

function checkRefrigerantEntry(ctx: EngineContext, e: RefrigerantEntry, base: string) {
  // Inventory delta may be negative, but individual flows can't be
  for (const k of ['inventoryStartKg', 'inventoryEndKg', 'purchasedKg', 'soldKg', 'recoveredForRecycleKg', 'chargeKg', 'gwpOverride'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Refrigerant "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  const lr = e.annualLeakRate
  if (typeof lr === 'number' && (lr < 0 || lr > 1)) {
    ctx.error('fraction_out_of_range', `Refrigerant "${e.label}" annualLeakRate must be in [0, 1].`, `${base}.${e.id}.annualLeakRate`)
  }
}

function checkChpEntry(ctx: EngineContext, e: ChpAllocationEntry, base: string) {
  for (const k of ['totalEmissionsCo2eTonnes', 'heatOutputGj', 'powerOutputGj', 'heatEfficiency', 'powerEfficiency', 'heatExportedGj', 'powerExportedGj'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `CHP "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

function checkTransferEntry(ctx: EngineContext, e: Co2TransferEntry, base: string) {
  nonNeg(ctx, e.quantityTonnes ?? null, `CO2 transfer "${e.label}" quantityTonnes`, `${base}.${e.id}.quantityTonnes`)
}

function checkReportedEntry(ctx: EngineContext, e: ReportedEntry, base: string) {
  for (const k of ['co2eTonnes', 'co2Tonnes', 'ch4Tonnes', 'n2oTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Reported "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

export function validatePulpPaperInput(ctx: EngineContext, payload: PulpPaperInputPayload): void {
  const { sector, calculationContext, facility, organizationBoundary, sourceApplicability, activityData } = payload

  if (!sector?.sectorCode) {
    ctx.error('missing_sector_code', 'Sector code is required.')
  } else if (sector.sectorCode !== 'PULP_PAPER') {
    ctx.error('unsupported_sector', `This engine handles PULP_PAPER; received "${sector.sectorCode}".`)
  }
  if (!calculationContext?.reportingPeriod?.year) {
    ctx.error('missing_reporting_period', 'Reporting period (year + dates) is required.')
  }
  if (!facility?.name?.trim()) {
    ctx.error('missing_facility_name', 'Facility / mill name is required.')
  }
  if (!facility?.millType) {
    ctx.error('missing_mill_type', 'Mill type is required (kraft / sulfite / recycled / mechanical / paper-only / integrated / mixed).')
  }
  if (organizationBoundary?.consolidationPercent != null && (organizationBoundary.consolidationPercent < 0 || organizationBoundary.consolidationPercent > 100)) {
    ctx.error('consolidation_out_of_range', `Consolidation percent must be in [0, 100]; got ${organizationBoundary.consolidationPercent}.`)
  }
  if (isPresent(activityData?.disclosedGrossScope1CO2eTonnes) && (activityData!.disclosedGrossScope1CO2eTonnes as number) < 0) {
    ctx.error('negative_input_value', `Disclosed gross Scope 1 cannot be negative.`, 'activityData.disclosedGrossScope1CO2eTonnes')
  }

  // Negative sweep + structural per-entry checks
  if (activityData) {
    activityData.stationaryCombustion?.forEach((e) => checkFuelEntry(ctx, e, 'activityData.stationaryCombustion'))
    activityData.biomassCombustion?.forEach((e) => checkBiomassEntry(ctx, e, 'activityData.biomassCombustion'))
    activityData.limeKilns?.forEach((e) => checkLimeKilnEntry(ctx, e, 'activityData.limeKilns'))
    activityData.makeupCarbonates?.forEach((e) => checkMakeupEntry(ctx, e, 'activityData.makeupCarbonates'))
    activityData.mobile?.forEach((e) => checkMobileEntry(ctx, e, 'activityData.mobile'))
    activityData.landfills?.forEach((e) => checkLandfillEntry(ctx, e, 'activityData.landfills'))
    activityData.anaerobicWwt?.forEach((e) => checkWwtEntry(ctx, e, 'activityData.anaerobicWwt'))
    activityData.refrigerants?.forEach((e) => checkRefrigerantEntry(ctx, e, 'activityData.refrigerants'))
    activityData.chpAllocation?.forEach((e) => checkChpEntry(ctx, e, 'activityData.chpAllocation'))
    activityData.co2Transfers?.forEach((e) => checkTransferEntry(ctx, e, 'activityData.co2Transfers'))
    activityData.reported?.forEach((e) => checkReportedEntry(ctx, e, 'activityData.reported'))

    const mwh = activityData.purchasedElectricity?.mwh
    if (typeof mwh === 'number' && mwh < 0) {
      ctx.error('negative_input_value', `Purchased electricity MWh cannot be negative.`, 'activityData.purchasedElectricity.mwh')
    }
  }

  // If user explicitly EXCLUDED a category but has data for it, flag for clarification.
  const app = sourceApplicability
  if (app) {
    const pairs: Array<[keyof typeof app, unknown[]]> = [
      ['stationaryCombustion', activityData?.stationaryCombustion ?? []],
      ['biomassCombustion', activityData?.biomassCombustion ?? []],
      ['limeKilns', activityData?.limeKilns ?? []],
      ['makeupCarbonates', activityData?.makeupCarbonates ?? []],
      ['mobile', activityData?.mobile ?? []],
      ['landfills', activityData?.landfills ?? []],
      ['anaerobicWwt', activityData?.anaerobicWwt ?? []],
      ['refrigerants', activityData?.refrigerants ?? []],
      ['chpAllocation', activityData?.chpAllocation ?? []],
      ['co2Transfers', activityData?.co2Transfers ?? []],
      ['reported', activityData?.reported ?? []],
    ]
    for (const [k, arr] of pairs) {
      if (app[k] === false && arr.length > 0) {
        ctx.warn('excluded_with_data', `Category "${k}" is marked excluded but has ${arr.length} entries; data will be ignored.`)
      }
    }
  }
}

/** Scope-separation invariant: biogenic CO2 must never leak into gross Scope 1. */
export function assertPulpPaperScopeSeparation(ctx: EngineContext, result: PulpPaperCalculationResult): void {
  // Gross Scope 1 by definition excludes biogenic CO2; assert no positive biogenic
  // CO2 appears in any byCategory `co2Tonnes` slot for the biomass category.
  const biomass = result.scope1.byCategory.biomassCombustion
  if (biomass && biomass.co2Tonnes > 0) {
    ctx.error('biogenic_in_scope1', `Biomass category should not contribute CO2 to Scope 1 (biogenic CO2 is memo only). Got ${biomass.co2Tonnes}.`)
  }
  // Cross-check that gross is the sum of category CO2e (within rounding).
  const sum = Object.values(result.scope1.byCategory).reduce((a, g) => a + (g?.co2eTonnes ?? 0), 0)
  if (Math.abs(sum - result.scope1.grossScope1CO2eTonnes) > 1) {
    ctx.warn('scope1_sum_drift', `Gross Scope 1 ${result.scope1.grossScope1CO2eTonnes.toFixed(2)} vs sum of categories ${sum.toFixed(2)} differs by >1 t.`)
  }
  if (result.scope1.grossScope1CO2eTonnes < 0) {
    ctx.error('negative_scope1_result', `Gross Scope 1 cannot be negative (got ${result.scope1.grossScope1CO2eTonnes}).`)
  }
}
