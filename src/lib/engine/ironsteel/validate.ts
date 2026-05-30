/**
 * Iron & Steel structural validation — runs before calculation. The category
 * modules raise their own per-row numeric errors; this file enforces top-
 * level required fields, applicability-vs-data consistency, negative input
 * sweep, EF override justification gate, and assurance-grade audit rules.
 */

import type { EngineContext } from '../context'
import { isPresent } from '../util'
import type {
  BfBofEntry,
  CokeOvenEntry,
  DriEntry,
  EafEntry,
  FlaringEntry,
  FuelEntry,
  IronSteelCalculationResult,
  IronSteelInputPayload,
  LimeKilnEntry,
  MobileEntry,
  OtherFugitiveEntry,
  RefrigerantEntry,
  Sf6Entry,
  SinterEntry,
} from './types'
import type { ReportedEntry } from '../oilgas/types'

const ELECTRICITY_HINTS = ['electric', 'grid power', 'purchased power', 'grid electricity']

function nonNeg(ctx: EngineContext, value: number | null | undefined, label: string, field: string) {
  if (typeof value === 'number' && value < 0) {
    ctx.error('negative_input_value', `${label} cannot be negative (${value}).`, field)
  }
}

function checkOverride(
  ctx: EngineContext,
  category: string,
  id: string,
  rowLabel: string,
  factorValues: Array<number | null | undefined>,
  reason: string | undefined,
) {
  const overridden = factorValues.some((v) => typeof v === 'number')
  if (overridden && (!reason || !reason.trim())) {
    ctx.error(
      'override_without_reason',
      `"${rowLabel}" overrides a factor (NCV / EF / fraction) without an Evidence note / override reason. Add a reason to the row before submitting.`,
      `${category}.${id}.overrideReason`,
    )
  }
}

function checkFuel(ctx: EngineContext, e: FuelEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Stationary "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj', 'oxidationFactor', 'directCo2Tonnes', 'carbonContentFraction'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Stationary "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (ELECTRICITY_HINTS.some((h) => e.label.toLowerCase().includes(h) || e.fuelCode.toLowerCase().includes(h))) {
    ctx.error('electricity_as_combustion', `"${e.label}" looks like purchased electricity — that's Scope 2, not stationary combustion.`, `${base}.${e.id}.fuelCode`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.ncvGjPerUnit, e.co2EfKgPerGj, e.ch4EfKgPerGj, e.n2oEfKgPerGj, e.carbonContentFraction, e.oxidationFactor], e.overrideReason)
}

function checkMobile(ctx: EngineContext, e: MobileEntry, base: string) {
  nonNeg(ctx, e.quantity ?? null, `Mobile "${e.label}" quantity`, `${base}.${e.id}.quantity`)
  for (const k of ['ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Mobile "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.ncvGjPerUnit, e.co2EfKgPerGj, e.ch4EfKgPerGj, e.n2oEfKgPerGj], e.overrideReason)
}

function checkCoke(ctx: EngineContext, e: CokeOvenEntry, base: string) {
  for (const k of ['cokeProducedTonnes', 'ef', 'cokingCoalChargedTonnes', 'cokeOutTonnes', 'cogProducedNm3', 'tarBtxProducedTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Coke "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  for (const k of ['cokingCoalCarbonFraction', 'cokeCarbonFraction', 'tarCarbonFraction'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `Coke "${e.label}" ${k} must be in [0,1].`, `${base}.${e.id}.${k}`)
    }
  }
  checkOverride(ctx, base, e.id, e.label, [e.ef, e.cokingCoalCarbonFraction, e.cokeCarbonFraction, e.cogCarbonKgPerNm3, e.tarCarbonFraction], e.overrideReason)
}

function checkSinter(ctx: EngineContext, e: SinterEntry, base: string) {
  for (const k of ['sinterProducedTonnes', 'ef', 'cokeBreezeConsumedTonnes', 'fluxLimestoneTonnes', 'fluxDolomiteTonnes', 'naturalGasConsumedGj', 'sinterCh4EfKgPerTonne', 'sinterN2oEfKgPerTonne'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Sinter "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (e.cokeBreezeCarbonFraction != null && (e.cokeBreezeCarbonFraction < 0 || e.cokeBreezeCarbonFraction > 1)) {
    ctx.error('fraction_out_of_range', `Sinter "${e.label}" cokeBreezeCarbonFraction must be in [0,1].`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.ef, e.cokeBreezeCarbonFraction, e.sinterCh4EfKgPerTonne, e.sinterN2oEfKgPerTonne], e.overrideReason)
}

function checkDri(ctx: EngineContext, e: DriEntry, base: string) {
  for (const k of ['driProducedTonnes', 'ef', 'reductantConsumed', 'reductantNcvGjPerUnit', 'ironOreConsumedTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `DRI "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  for (const k of ['reductantCarbonFraction', 'driCarbonFraction'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `DRI "${e.label}" ${k} must be in [0,1].`)
    }
  }
  checkOverride(ctx, base, e.id, e.label, [e.ef, e.reductantCarbonFraction, e.driCarbonFraction], e.overrideReason)
}

function checkBfBof(ctx: EngineContext, e: BfBofEntry, base: string) {
  for (const k of ['crudeSteelProducedTonnes', 'bfEf', 'bofEf', 'cokeChargedTonnes', 'pciCoalTonnes', 'naturalGasInjectedGj', 'limestoneChargedTonnes', 'dolomiteChargedTonnes', 'hotMetalProducedTonnes', 'bfgExportedNm3', 'scrapChargedToBof', 'bofSlagTonnes', 'bofgExportedNm3'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `BF/BOF "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  for (const k of ['cokeCarbonFraction', 'pciCarbonFraction', 'hotMetalCarbonFraction', 'bofSlagCarbonFraction'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `BF/BOF "${e.label}" ${k} must be in [0,1].`)
    }
  }
  checkOverride(ctx, base, e.id, e.label, [e.bfEf, e.bofEf, e.cokeCarbonFraction, e.pciCarbonFraction, e.hotMetalCarbonFraction, e.bfgCarbonKgPerNm3, e.bofSlagCarbonFraction], e.overrideReason)
}

function checkEaf(ctx: EngineContext, e: EafEntry, base: string) {
  for (const k of ['crudeSteelProducedTonnes', 'ef', 'electrodeConsumedTonnes', 'chargeCarbonTonnes', 'driChargedTonnes', 'scrapChargedTonnes', 'limeChargedTonnes', 'dolomiteChargedTonnes', 'oxyFuelNaturalGasGj'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `EAF "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  for (const k of ['electrodeCarbonFraction', 'chargeCarbonFraction', 'driCarbonFraction', 'scrapCarbonFraction'] as const) {
    const v = (e as unknown as Record<string, unknown>)[k] as number | null | undefined
    if (typeof v === 'number' && (v < 0 || v > 1)) {
      ctx.error('fraction_out_of_range', `EAF "${e.label}" ${k} must be in [0,1].`)
    }
  }
  checkOverride(ctx, base, e.id, e.label, [e.ef, e.electrodeCarbonFraction, e.chargeCarbonFraction, e.driCarbonFraction, e.scrapCarbonFraction], e.overrideReason)
}

function checkLimeKiln(ctx: EngineContext, e: LimeKilnEntry, base: string) {
  for (const k of ['fuelQuantity', 'ncvGjPerUnit', 'co2EfKgPerGj', 'ch4EfKgPerGj', 'n2oEfKgPerGj', 'limestoneChargedTonnes', 'dolomiteChargedTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Lime kiln "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (e.calcinationFraction != null && (e.calcinationFraction < 0 || e.calcinationFraction > 1)) {
    ctx.error('fraction_out_of_range', `Lime kiln "${e.label}" calcinationFraction must be in [0,1].`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.ncvGjPerUnit, e.co2EfKgPerGj, e.ch4EfKgPerGj, e.n2oEfKgPerGj, e.calcinationFraction], e.overrideReason)
}

function checkFlaring(ctx: EngineContext, e: FlaringEntry, base: string) {
  nonNeg(ctx, e.flaredVolumeNm3 ?? null, `Flare "${e.label}" flaredVolumeNm3`, `${base}.${e.id}.flaredVolumeNm3`)
  for (const k of ['carbonKgPerNm3', 'ch4SlipKgPerNm3'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Flare "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (e.combustionEfficiency != null && (e.combustionEfficiency < 0 || e.combustionEfficiency > 1)) {
    ctx.error('fraction_out_of_range', `Flare "${e.label}" combustionEfficiency must be in [0,1].`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.carbonKgPerNm3, e.combustionEfficiency, e.ch4SlipKgPerNm3], e.overrideReason)
}

function checkHfc(ctx: EngineContext, e: RefrigerantEntry, base: string) {
  for (const k of ['inventoryStartKg', 'inventoryEndKg', 'purchasedKg', 'soldKg', 'recoveredForRecycleKg', 'chargeKg', 'gwpOverride'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Refrigerant "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (e.annualLeakRate != null && (e.annualLeakRate < 0 || e.annualLeakRate > 1)) {
    ctx.error('fraction_out_of_range', `Refrigerant "${e.label}" annualLeakRate must be in [0,1].`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.gwpOverride], e.overrideReason)
}

function checkSf6(ctx: EngineContext, e: Sf6Entry, base: string) {
  for (const k of ['nameplateInventoryKg', 'leakedMassKg', 'gwpOverride'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `SF6 "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  if (e.annualLeakRate != null && (e.annualLeakRate < 0 || e.annualLeakRate > 1)) {
    ctx.error('fraction_out_of_range', `SF6 "${e.label}" annualLeakRate must be in [0,1].`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.gwpOverride], e.overrideReason)
}

function checkOther(ctx: EngineContext, e: OtherFugitiveEntry, base: string) {
  for (const k of ['ch4MassKg', 'activityTonnes', 'efKgCh4PerTonne'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Other fugitive "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
  checkOverride(ctx, base, e.id, e.label, [e.efKgCh4PerTonne], e.overrideReason)
}

function checkReported(ctx: EngineContext, e: ReportedEntry, base: string) {
  for (const k of ['co2eTonnes', 'co2Tonnes', 'ch4Tonnes', 'n2oTonnes'] as const) {
    nonNeg(ctx, (e as unknown as Record<string, unknown>)[k] as number | null | undefined, `Reported "${e.label}" ${k}`, `${base}.${e.id}.${k}`)
  }
}

export function validateIronSteelInput(ctx: EngineContext, payload: IronSteelInputPayload): void {
  const { sector, calculationContext, facility, organizationBoundary, sourceApplicability, activityData } = payload

  if (!sector?.sectorCode) {
    ctx.error('missing_sector_code', 'Sector code is required.')
  } else if (sector.sectorCode !== 'IRON_STEEL') {
    ctx.error('unsupported_sector', `This engine handles IRON_STEEL; received "${sector.sectorCode}".`)
  }
  if (!calculationContext?.reportingPeriod?.year) {
    ctx.error('missing_reporting_period', 'Reporting period (year + dates) is required.')
  }
  if (!facility?.name?.trim()) {
    ctx.error('missing_facility_name', 'Facility / plant name is required.')
  }
  if (!facility?.processRoute) {
    ctx.error('missing_process_route', 'Process route is required (BF-BOF / EAF / DRI-EAF / etc.).')
  }
  if (organizationBoundary?.consolidationPercent != null && (organizationBoundary.consolidationPercent < 0 || organizationBoundary.consolidationPercent > 100)) {
    ctx.error('consolidation_out_of_range', `Consolidation percent must be in [0, 100]; got ${organizationBoundary.consolidationPercent}.`)
  }
  if (isPresent(activityData?.disclosedGrossScope1CO2eTonnes) && (activityData!.disclosedGrossScope1CO2eTonnes as number) < 0) {
    ctx.error('negative_input_value', `Disclosed gross Scope 1 cannot be negative.`, 'activityData.disclosedGrossScope1CO2eTonnes')
  }

  if (activityData) {
    activityData.stationaryCombustion?.forEach((e) => checkFuel(ctx, e, 'activityData.stationaryCombustion'))
    activityData.mobile?.forEach((e) => checkMobile(ctx, e, 'activityData.mobile'))
    activityData.cokeOven?.forEach((e) => checkCoke(ctx, e, 'activityData.cokeOven'))
    activityData.flaring?.forEach((e) => checkFlaring(ctx, e, 'activityData.flaring'))
    activityData.sinter?.forEach((e) => checkSinter(ctx, e, 'activityData.sinter'))
    activityData.dri?.forEach((e) => checkDri(ctx, e, 'activityData.dri'))
    activityData.bfBof?.forEach((e) => checkBfBof(ctx, e, 'activityData.bfBof'))
    activityData.eaf?.forEach((e) => checkEaf(ctx, e, 'activityData.eaf'))
    activityData.limeKiln?.forEach((e) => checkLimeKiln(ctx, e, 'activityData.limeKiln'))
    activityData.fugitiveHFC?.forEach((e) => checkHfc(ctx, e, 'activityData.fugitiveHFC'))
    activityData.fugitiveSF6?.forEach((e) => checkSf6(ctx, e, 'activityData.fugitiveSF6'))
    activityData.fugitiveOther?.forEach((e) => checkOther(ctx, e, 'activityData.fugitiveOther'))
    activityData.reported?.forEach((e) => checkReported(ctx, e, 'activityData.reported'))

    const mwh = activityData.purchasedElectricity?.mwh
    if (typeof mwh === 'number' && mwh < 0) {
      ctx.error('negative_input_value', `Purchased electricity MWh cannot be negative.`, 'activityData.purchasedElectricity.mwh')
    }
  }

  /* ------------------------- ASSURANCE GATES ----------------------------- */

  // (#3) Double-counting: BF/BOF Tier 1 integrated (1.46 tCO2/t CS) ALREADY
  // includes upstream coke + sinter + BF + BOF combined per IPCC 2006 Vol 3
  // Ch 4 Table 4.1. Adding separate coke/sinter entries on Tier 1 is a real
  // bug — blocked.
  const bfBofRowsTier1 = (activityData?.bfBof ?? []).filter((e) => e.method === 'TIER1_INTEGRATED' && (e.crudeSteelProducedTonnes ?? 0) > 0)
  const cokeRows = (activityData?.cokeOven ?? []).filter((e) => (e.cokeProducedTonnes ?? e.cokeOutTonnes ?? 0) > 0)
  const sinterRows = (activityData?.sinter ?? []).filter((e) => (e.sinterProducedTonnes ?? 0) > 0)
  if (bfBofRowsTier1.length > 0 && (cokeRows.length > 0 || sinterRows.length > 0)) {
    ctx.error(
      'double_counting_bfbof_tier1_includes_coke_sinter',
      'BF/BOF Tier 1 integrated default (1.46 tCO2/t crude steel) already includes upstream coke ovens, sinter plant, BF and BOF combined per IPCC 2006 Vol 3 Ch 4 Table 4.1. Adding separate Tier-1 coke / sinter entries on top double-counts. Either (a) switch BF/BOF to Tier 2 carbon balance and keep separate coke / sinter entries, or (b) remove the separate coke / sinter entries while keeping BF/BOF Tier 1 integrated.',
      'activityData.bfBof',
    )
  }

  // (#6) EAF partial coverage: Tier 1 electrodes-only (0.08 tCO2/t) covers
  // ONLY electrode oxidation; it does NOT include charge carbon, DRI/HBI C,
  // lime calcination, scrap-preheat NG, oxy-fuel burners. Public EAF
  // benchmarks (worldsteel 0.3–0.5 incl. Scope 2) are higher.
  const eafTier1Material = (activityData?.eaf ?? []).some((e) => e.method === 'TIER1_ELECTRODES_ONLY' && (e.crudeSteelProducedTonnes ?? 0) > 10_000)
  const hasOtherEafCoverage = (activityData?.stationaryCombustion ?? []).length > 0 || (activityData?.limeKiln ?? []).length > 0 || (activityData?.dri ?? []).length > 0
  if (eafTier1Material && !hasOtherEafCoverage) {
    ctx.warn(
      'eaf_tier1_electrodes_only_partial_coverage',
      'EAF Tier 1 (0.08 tCO2/t) covers electrode oxidation only — IPCC 2006 Vol 3 Ch 4. It does NOT include charge carbon, DRI/HBI carbon oxidation, lime calcination, scrap-preheat NG, or oxy-fuel burner fuels. Public EAF Scope 1 benchmarks include these. Either switch to Tier 2 full balance OR add the supporting fuel / lime / DRI rows. Otherwise this row materially under-counts EAF Scope 1.',
      'activityData.eaf',
    )
  }

  // (#5) Implausible-zero check: any meaningful crude-steel production must
  // produce some Scope 1 (auxiliary fuel, refrigerants, mobile, etc.). The
  // post-calc backstop handles this but a pre-calc heuristic catches the
  // "induction with nothing entered" pattern early.
  const crudeSteel = activityData?.production?.crudeSteelTonnes ?? 0
  if (typeof crudeSteel === 'number' && crudeSteel > 1_000) {
    const anyEntry = ['stationaryCombustion', 'mobile', 'cokeOven', 'flaring', 'sinter', 'dri', 'bfBof', 'eaf', 'limeKiln', 'fugitiveHFC', 'fugitiveSF6', 'fugitiveOther', 'reported'].some((k) => ((activityData as unknown as Record<string, unknown[]>)[k] ?? []).length > 0)
    if (!anyEntry) {
      ctx.error(
        'implausible_zero_scope1_for_production',
        `Crude steel production is ${crudeSteel} t but NO activity entries have been provided. Every steelmaking route (including induction) has some Scope 1 (auxiliary fuel, refrigerants, mobile equipment). Add the applicable categories or provide a reported / disclosed figure with a boundary basis.`,
        'activityData',
      )
    }
  }

  // (#4) Process-gas allocation honesty: the selector is captured in the audit
  // trail but the engine currently emits at the point of combustion. Non-default
  // selections need to be flagged so the verifier knows what was applied.
  const allocation = payload.methodSelections?.processGasAllocation
  if (allocation && allocation !== 'POINT_OF_EMISSION') {
    ctx.warn(
      'process_gas_allocation_advisory_only',
      `Process-gas allocation = "${allocation}" — selection is recorded in the audit trail, but in the current engine version COG / BFG / BOFG combustion is always emitted at the point of combustion (POINT_OF_EMISSION). Upstream / energy-based CHP allocation is a methodology fork that will be wired in a follow-up. Disclose the chosen convention in the report narrative.`,
      'methodSelections.processGasAllocation',
    )
  }

  // (#1) Disclosure boundary basis: when reported entries are material
  // (≥10% of disclosed gross, or any reported entry uses corporate-aggregate
  // basis), the user MUST declare which boundary the figures describe.
  const reportedTotal = (activityData?.reported ?? []).reduce<number>((a, e) => a + (e.co2eTonnes ?? ((e.co2Tonnes ?? 0) + (e.ch4Tonnes ?? 0) * 30 + (e.n2oTonnes ?? 0) * 273)), 0)
  const hasMaterialReported = reportedTotal > 0 && (activityData?.disclosedGrossScope1CO2eTonnes == null || reportedTotal >= 0.1 * (activityData!.disclosedGrossScope1CO2eTonnes as number))
  if (hasMaterialReported && !payload.disclosure?.boundaryBasis) {
    ctx.error(
      'missing_disclosure_boundary_basis',
      'Reported / direct entries are material (≥10% of disclosed gross). The verifier needs to know WHICH boundary the disclosed totals describe — steelmaking sites only, all sites, WSA Scope 1+1a, BRSR, EU ETS, CBAM, corporate aggregate, or other. Set disclosure.boundaryBasis before submitting.',
      'disclosure.boundaryBasis',
    )
  }
  if (payload.disclosure?.boundaryBasis === 'OTHER' && !payload.disclosure?.boundaryNote?.trim()) {
    ctx.error(
      'boundary_basis_other_requires_note',
      'disclosure.boundaryBasis = "OTHER" requires a note explaining what the boundary covers.',
      'disclosure.boundaryNote',
    )
  }

  // Applicability vs data: warn when user disabled a category but supplied data
  const app = sourceApplicability
  if (app) {
    const pairs: Array<[keyof typeof app, unknown[]]> = [
      ['stationaryCombustion', activityData?.stationaryCombustion ?? []],
      ['mobile', activityData?.mobile ?? []],
      ['cokeOven', activityData?.cokeOven ?? []],
      ['flaring', activityData?.flaring ?? []],
      ['sinter', activityData?.sinter ?? []],
      ['dri', activityData?.dri ?? []],
      ['bfBof', activityData?.bfBof ?? []],
      ['eaf', activityData?.eaf ?? []],
      ['limeKiln', activityData?.limeKiln ?? []],
      ['fugitiveHFC', activityData?.fugitiveHFC ?? []],
      ['fugitiveSF6', activityData?.fugitiveSF6 ?? []],
      ['fugitiveOther', activityData?.fugitiveOther ?? []],
      ['reported', activityData?.reported ?? []],
    ]
    for (const [k, arr] of pairs) {
      if (app[k] === false && arr.length > 0) {
        ctx.warn('excluded_with_data', `Category "${k}" is marked excluded but has ${arr.length} entries; data will be ignored.`)
      }
    }
  }
}

export function assertIronSteelScopeSeparation(ctx: EngineContext, result: IronSteelCalculationResult): void {
  // Biogenic CO2 must NEVER appear in stationaryCombustion fossil CO2 (we route
  // biomass CO2 to biogenicCO2Tonnes inside that category). No assertion
  // needed — guard against accidental future regressions.
  const sum = Object.values(result.scope1.byCategory).reduce((a, g) => a + (g?.co2eTonnes ?? 0), 0)
  if (Math.abs(sum - result.scope1.grossScope1CO2eTonnes) > 1) {
    ctx.warn('scope1_sum_drift', `Gross Scope 1 ${result.scope1.grossScope1CO2eTonnes.toFixed(2)} vs sum of categories ${sum.toFixed(2)} differs by >1 t.`)
  }
  if (result.scope1.grossScope1CO2eTonnes < 0) {
    ctx.error('negative_scope1_result', `Gross Scope 1 cannot be negative (got ${result.scope1.grossScope1CO2eTonnes}).`)
  }
}
