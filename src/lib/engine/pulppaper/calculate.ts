/**
 * Pulp & Paper Scope 1 orchestrator.
 *
 * 1. validate
 * 2. compute each of the 10 categories (+ reported) separately
 * 3. apply equity-share consolidation if chosen
 * 4. assemble byCategory + byGas + memo + supporting buckets
 * 5. negative-result backstop (defence in depth)
 * 6. intensity metrics (kg CO2e per ADt pulp / t paper / t board)
 * 7. disclosed-vs-modelled reconciliation (gross only; per-gas left as future work)
 * 8. assumptions register + basis-aware data-quality tier
 * 9. scope-separation assertion (biogenic CO2 must NEVER leak into gross)
 *
 * Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + refrigerants).
 * Biogenic CO2 = MEMO only. Biogenic CH4 and N2O DO count in gross Scope 1.
 */

import { FactorResolver } from '../factors'
import { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { calculateBiomass } from './biomass'
import { calculateChpAllocation } from './chpAllocation'
import { calculateCo2Transfers } from './co2Transfers'
import { calculateStationaryCombustion } from './combustion'
import { METHODOLOGY_PACK, PULPPAPER_CONSTANT_FACTORS, sharedGwpSetFor } from './constants'
import { resolveGwp } from './gwp'
import { addGas, emptyGas, roundGas, scaleGas } from './helpers'
import { calculateLandfills } from './landfills'
import { calculateLimeKilns } from './limeKilns'
import { calculateMakeupCarbonates } from './makeupCarbonates'
import { calculateMobile } from './mobile'
import { calculateAnaerobicWwt } from './anaerobicWwt'
import { calculateRefrigerants } from './refrigerants'
import { calculateReported } from './reported'
import type {
  AssumptionEntry,
  GasAmounts,
  PulpPaperCalculationResult,
  PulpPaperCategory,
  PulpPaperInputPayload,
  ReconciliationLine,
} from './types'
import { assertPulpPaperScopeSeparation, validatePulpPaperInput } from './validate'

export function calculatePulpPaper(
  payload: PulpPaperInputPayload,
  calculationId: string | null = null,
): PulpPaperCalculationResult {
  const gwpSet = payload.calculationContext?.gwpSet ?? 'AR6_100'
  // Convert override map shape ({code: {value, source?, reason?}}) into the FactorOverride
  // shape FactorResolver expects (reason is required there; default to '' if user omitted).
  const overrides: Record<string, { value: number; reason: string; source?: string }> = {}
  for (const [k, v] of Object.entries(payload.factorOverrides ?? {})) {
    overrides[k] = { value: v.value, reason: v.reason ?? '', source: v.source }
  }
  const resolver = new FactorResolver(overrides, PULPPAPER_CONSTANT_FACTORS)
  const ctx = new EngineContext(resolver, sharedGwpSetFor(gwpSet))
  const gwp = resolveGwp(gwpSet)
  const activity = payload.activityData
  const app = payload.sourceApplicability

  validatePulpPaperInput(ctx, payload)

  // --- per-category compute --------------------------------------------------
  const stationary = app?.stationaryCombustion === false ? emptyGas() : calculateStationaryCombustion(ctx, payload.methodSelections.stationaryMethod, activity.stationaryCombustion ?? [], gwp)
  const biomass = app?.biomassCombustion === false ? emptyGas() : calculateBiomass(ctx, activity.biomassCombustion ?? [], gwp)
  const limeKilns = app?.limeKilns === false ? emptyGas() : calculateLimeKilns(ctx, activity.limeKilns ?? [], gwp)
  const makeup = app?.makeupCarbonates === false ? emptyGas() : calculateMakeupCarbonates(ctx, activity.makeupCarbonates ?? [])
  const mobileBucket = app?.mobile === false ? { owned: emptyGas(), thirdParty: emptyGas() } : calculateMobile(ctx, activity.mobile ?? [], gwp)
  const landfills = app?.landfills === false ? emptyGas() : calculateLandfills(ctx, activity.landfills ?? [], gwp)
  const wwt = app?.anaerobicWwt === false ? emptyGas() : calculateAnaerobicWwt(ctx, activity.anaerobicWwt ?? [], gwp)
  const refrigerants = app?.refrigerants === false ? emptyGas() : calculateRefrigerants(ctx, activity.refrigerants ?? [])
  const transfers = app?.co2Transfers === false ? emptyGas() : calculateCo2Transfers(ctx, activity.co2Transfers ?? [])
  const reported = app?.reported === false ? emptyGas() : calculateReported(ctx, activity.reported ?? [], gwp)

  // CHP allocation is an analytical breakdown (not gross-changing).
  const chpAllocations = app?.chpAllocation === false ? [] : calculateChpAllocation(ctx, activity.chpAllocation ?? [])

  // --- supporting Scope 2 (excluded from gross) -----------------------------
  let electricityCO2 = 0
  if (app?.purchasedElectricity !== false) {
    const mwh = activity.purchasedElectricity?.mwh
    if (isPresent(mwh)) {
      const gridEf = activity.purchasedElectricity?.gridEfTco2PerMwh
      const ef = ctx.resolver.resolveOrSupplied('PP_INDIA_GRID_EF', gridEf)
      if (isMissing(gridEf)) {
        ctx.defaultsUsed.add('default_grid_ef_used')
        ctx.warn('default_grid_ef_used', `Default grid EF ${ef} tCO2/MWh used for purchased electricity.`)
      }
      electricityCO2 = (mwh as number) * ef
      ctx.addTrace({
        step: 'Purchased electricity CO2 (supporting Scope 2, excluded from Scope 1)',
        category: 'SUPPORTING_SCOPE2',
        method: payload.methodSelections.electricityMethod,
        formula: 'electricityMWh × gridEF (tCO2/MWh)',
        inputs: { electricityMWh: mwh as number, gridEfTco2PerMwh: round(ef, 4) },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(electricityCO2, 4),
      })
    }
  }

  // --- equity-share consolidation -------------------------------------------
  const isEquityShare = payload.organizationBoundary?.boundaryMethod === 'EQUITY_SHARE'
  const sharePercent = payload.organizationBoundary?.consolidationPercent ?? payload.organizationBoundary?.ownershipSharePercent ?? 100
  const shareFactor = isEquityShare ? Math.min(Math.max((sharePercent ?? 100) / 100, 0), 1) : 1
  if (isEquityShare) {
    ctx.fallbacksApplied.add(`Equity share consolidation applied (${(shareFactor * 100).toFixed(2)}%)`)
    ctx.addTrace({
      step: `Equity share consolidation × ${(shareFactor * 100).toFixed(2)}%`,
      category: 'CONSOLIDATION',
      method: 'EQUITY_SHARE',
      formula: 'each Scope 1 bucket × consolidationPercent / 100',
      inputs: { consolidationPercent: sharePercent ?? 100 },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: 0,
    })
  }

  // --- assemble byCategory (scaled + rounded) -------------------------------
  const byCategory: Record<PulpPaperCategory, GasAmounts> = {
    stationaryCombustion: roundGas(scaleGas(stationary, shareFactor)),
    biomassCombustion: roundGas(scaleGas(biomass, shareFactor)),
    limeKilns: roundGas(scaleGas(limeKilns, shareFactor)),
    makeupCarbonates: roundGas(scaleGas(makeup, shareFactor)),
    mobile: roundGas(scaleGas(mobileBucket.owned, shareFactor)),
    landfills: roundGas(scaleGas(landfills, shareFactor)),
    anaerobicWwt: roundGas(scaleGas(wwt, shareFactor)),
    refrigerants: roundGas(scaleGas(refrigerants, shareFactor)),
    chpAllocation: emptyGas(), // analytical only — not gross-changing
    co2Transfers: roundGas(scaleGas(transfers, shareFactor)),
    reported: roundGas(scaleGas(reported, shareFactor)),
  }
  const grossScope1 = round(Object.values(byCategory).reduce((a, g) => a + g.co2eTonnes, 0), 4)

  // --- negative-result backstop ---------------------------------------------
  if (grossScope1 < 0) {
    ctx.error('negative_scope1_result', `Gross Scope 1 is negative (${grossScope1} tCO2e). Check inputs — negative emissions are not valid (CO2 export adjustments are allowed via co2Transfers but cannot exceed gross).`)
  }
  for (const [k, g] of Object.entries(byCategory)) {
    if (k === 'co2Transfers') continue // exports legitimately negative
    if (g.co2eTonnes < 0) {
      ctx.error('negative_category_result', `Category "${k}" is negative (${g.co2eTonnes} tCO2e).`, `activityData.${k}`)
    }
  }

  // --- by-gas decomposition (excluding refrigerants) ------------------------
  const scaledForGas: GasAmounts[] = [stationary, biomass, limeKilns, makeup, mobileBucket.owned, landfills, wwt, transfers, reported].map((g) => scaleGas(g, shareFactor))
  const sumGas = scaledForGas.reduce<GasAmounts>((acc, g) => { addGas(acc, g); return acc }, emptyGas())
  const scaledRefrigerants = scaleGas(refrigerants, shareFactor)
  const byGas = {
    co2Tonnes: round(sumGas.co2Tonnes, 4),
    ch4Tonnes: round(sumGas.ch4Tonnes, 4),
    ch4CO2eTonnes: round(sumGas.ch4Tonnes * gwp.CH4_FOSSIL, 4),
    n2oTonnes: round(sumGas.n2oTonnes, 4),
    n2oCO2eTonnes: round(sumGas.n2oTonnes * gwp.N2O, 4),
    refrigerantCO2eTonnes: round(scaledRefrigerants.co2eTonnes, 4),
  }

  // --- biogenic memo (excluded from Scope 1) --------------------------------
  const biogenicMemo = round(scaledForGas.reduce((a, g) => a + g.biogenicCO2Tonnes, 0), 4)
  const electricityScoped = round(electricityCO2 * shareFactor, 4)
  const thirdPartyMobileScoped = round(mobileBucket.thirdParty.co2eTonnes * shareFactor, 4)

  // --- intensity metrics ----------------------------------------------------
  const prod = activity.production
  const denom = (q: number | null | undefined) => (isPresent(q) && (q as number) > 0 ? (q as number) * shareFactor : 0)
  const fossilCO2 = byGas.co2Tonnes // gross fossil CO2 (excludes biogenic)
  // For biomass-share-of-primary-energy we'd need an energy bookkeeper; skip for now (future work).
  const intensityMetrics = {
    co2ePerAdtPulp: denom(prod.airDryPulpTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.airDryPulpTonnes), 3) : undefined,
    co2ePerTonnePaper: denom(prod.paperProducedTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.paperProducedTonnes), 3) : undefined,
    co2ePerTonneBoard: denom(prod.boardProducedTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.boardProducedTonnes), 3) : undefined,
    fossilCo2PerAdtPulp: denom(prod.airDryPulpTonnes) > 0 ? round((fossilCO2 * 1000) / denom(prod.airDryPulpTonnes), 3) : undefined,
  }

  // --- disclosed-vs-modelled reconciliation ---------------------------------
  const RECON_THRESHOLD = 5
  const lines: ReconciliationLine[] = []
  const addReconLine = (metric: ReconciliationLine['metric'], label: string, unit: string, disclosedVal: number | null | undefined, modelledVal: number) => {
    if (!isPresent(disclosedVal) || (disclosedVal as number) <= 0) return
    const d = disclosedVal as number
    const variancePercent = round(((modelledVal - d) / d) * 100, 2)
    lines.push({
      metric, label, unit,
      disclosed: round(d, 4),
      modelled: round(modelledVal, 4),
      variancePercent,
      withinThreshold: Math.abs(variancePercent) <= RECON_THRESHOLD,
    })
  }
  addReconLine('GROSS_CO2E', 'Gross Scope 1', 'tCO2e', activity.disclosedGrossScope1CO2eTonnes, grossScope1)

  const exceedingLines = lines.filter((l) => !l.withinThreshold)
  if (exceedingLines.length > 0) {
    ctx.warn(
      'reconciliation_variance_exceeds_5pct',
      `${exceedingLines.length} disclosed metric(s) differ from the modelled inventory by more than ${RECON_THRESHOLD}%: ${exceedingLines.map((l) => `${l.label} ${l.variancePercent}%`).join(', ')}.`,
      'activityData.disclosedGrossScope1CO2eTonnes',
    )
  }
  const grossLine = lines.find((l) => l.metric === 'GROSS_CO2E')
  const reconciliation = {
    checked: lines.length > 0,
    disclosedGrossCO2eTonnes: grossLine ? grossLine.disclosed : null,
    modelledGrossCO2eTonnes: grossScope1,
    variancePercent: grossLine ? grossLine.variancePercent : null,
    note: lines.length === 0
      ? 'No disclosed figures provided.'
      : exceedingLines.length > 0
        ? `${exceedingLines.length} of ${lines.length} disclosed metric(s) exceed the ${RECON_THRESHOLD}% threshold; review before sign-off.`
        : `All ${lines.length} disclosed metric(s) within the ${RECON_THRESHOLD}% threshold.`,
    lines,
  }

  // --- assumptions register --------------------------------------------------
  const defaultsUsed = Array.from(ctx.defaultsUsed)
  const fallbacksApplied = Array.from(ctx.fallbacksApplied)
  const assumptions: AssumptionEntry[] = []
  for (const f of fallbacksApplied) assumptions.push({ kind: 'FALLBACK', label: 'Fallback applied', detail: f })
  const seenDefaultCodes = new Set<string>()
  for (const w of ctx.warnings) {
    if (defaultsUsed.includes(w.code)) {
      assumptions.push({ kind: 'DEFAULT', label: w.code, detail: w.message })
      seenDefaultCodes.add(w.code)
    }
  }
  for (const code of defaultsUsed) {
    if (!seenDefaultCodes.has(code)) assumptions.push({ kind: 'DEFAULT', label: code, detail: `Default value used (${code}).` })
  }
  const overrideRows: Array<{ label?: string; overrideReason?: string }> = [
    ...(activity.stationaryCombustion ?? []),
    ...(activity.biomassCombustion ?? []),
    ...(activity.limeKilns ?? []),
    ...(activity.makeupCarbonates ?? []),
    ...(activity.mobile ?? []),
    ...(activity.refrigerants ?? []),
  ]
  for (const r of overrideRows) {
    if (r.overrideReason && r.overrideReason.trim()) {
      assumptions.push({ kind: 'OVERRIDE', label: r.label ?? '(row)', detail: r.overrideReason.trim() })
    }
  }
  for (const e of activity.reported ?? []) {
    if (e.basis === 'ESTIMATED' || e.basis === 'INFERRED' || e.basis === 'RESIDUAL') {
      assumptions.push({
        kind: 'ESTIMATE',
        label: e.label,
        detail: `${e.basis.toLowerCase()} basis${e.note ? ` — ${e.note}` : ''}${e.source ? ` (source: ${e.source})` : ''}`,
      })
    }
  }

  // --- data-quality tier ----------------------------------------------------
  const reportedShare = grossScope1 > 0 ? byCategory.reported.co2eTonnes / grossScope1 : 0
  const overall =
    reportedShare >= 0.5
      ? 'REPORTED_AGGREGATE'
      : fallbacksApplied.length > 0 || defaultsUsed.length >= 3
        ? 'DEFAULTS_HEAVY'
        : defaultsUsed.length === 0
          ? 'PLANT_SPECIFIC'
          : 'MIXED'

  const result: PulpPaperCalculationResult = {
    calculationId,
    status: 'SUCCESS',
    sectorCode: 'PULP_PAPER',
    methodologyPack: METHODOLOGY_PACK,
    gwpSet,
    reportingPeriod: payload.calculationContext.reportingPeriod,
    scope1: {
      grossScope1CO2eTonnes: grossScope1,
      byCategory,
      byGas,
      excludedFromGrossScope1: {
        biogenicCO2MemoTonnes: biogenicMemo,
        purchasedElectricityCO2eTonnes: electricityScoped,
        thirdPartyMobileCO2eTonnes: thirdPartyMobileScoped,
      },
    },
    memoItems: { biogenicCO2Tonnes: biogenicMemo },
    supportingScope2: { purchasedElectricityCO2eTonnes: electricityScoped },
    supportingScope3: { thirdPartyMobileCO2eTonnes: thirdPartyMobileScoped },
    intensityMetrics,
    chpAllocations,
    reconciliation,
    assumptions,
    dataQuality: { defaultsUsed, fallbacksApplied, overall },
    warnings: ctx.warnings,
    errors: ctx.errors,
    calculationTrace: ctx.trace,
    factorSnapshots: ctx.resolver.list(),
    auditStatus: { workflowStatus: 'DRAFT', calculatedAt: new Date().toISOString() },
  }

  assertPulpPaperScopeSeparation(ctx, result)
  result.errors = ctx.errors
  result.warnings = ctx.warnings
  result.status = ctx.errors.length > 0 ? 'BLOCKED' : ctx.warnings.length > 0 ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS'
  return result
}
