/**
 * Iron & Steel Scope 1 orchestrator.
 *
 * 1. validate
 * 2. compute each of the 13 categories
 * 3. apply equity-share consolidation if chosen
 * 4. assemble byCategory + byGas + memo + supporting buckets
 * 5. negative-result backstop
 * 6. intensity metrics (kgCO2e per tonne crude steel; per t hot-rolled;
 *    per t hot metal; fossil-only per t crude steel)
 * 7. disclosed-vs-modelled reconciliation
 * 8. assumptions register + basis-aware data-quality tier
 * 9. scope-separation assertion
 *
 * Gross Scope 1 = full CO2e (CO2 + CH4 + N2O + HFCs + SF6).
 * Biogenic CO2 = MEMO only. Biogenic CH4 + N2O DO count in gross.
 */

import { FactorResolver } from '../factors'
import { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { calculateBfBof } from './bfBof'
import { calculateCokeOven } from './cokeOven'
import { calculateStationaryCombustion, calculateMobile } from './combustion'
import { METHODOLOGY_PACK, IRONSTEEL_CONSTANT_FACTORS, sharedGwpSetFor } from './constants'
import { calculateDri } from './dri'
import { calculateEaf } from './eaf'
import { calculateFlaring } from './flaring'
import { calculateFugitiveHFC, calculateFugitiveOther, calculateFugitiveSF6 } from './fugitives'
import { resolveGwp } from './gwp'
import { addGas, emptyGas, roundGas, scaleGas } from './helpers'
import { calculateLimeKiln } from './limeKiln'
import { calculateReported } from './reported'
import { calculateSinter } from './sinter'
import type {
  AssumptionEntry,
  GasAmounts,
  IronSteelCalculationResult,
  IronSteelCategory,
  IronSteelInputPayload,
  ReconciliationLine,
} from './types'
import { assertIronSteelScopeSeparation, validateIronSteelInput } from './validate'

export function calculateIronSteel(
  payload: IronSteelInputPayload,
  calculationId: string | null = null,
): IronSteelCalculationResult {
  const gwpSet = payload.calculationContext?.gwpSet ?? 'AR6_100'

  const overrides: Record<string, { value: number; reason: string; source?: string }> = {}
  for (const [k, v] of Object.entries(payload.factorOverrides ?? {})) {
    overrides[k] = { value: v.value, reason: v.reason ?? '', source: v.source }
  }
  const resolver = new FactorResolver(overrides, IRONSTEEL_CONSTANT_FACTORS)
  const ctx = new EngineContext(resolver, sharedGwpSetFor(gwpSet))
  const gwp = resolveGwp(gwpSet)
  const activity = payload.activityData
  const app = payload.sourceApplicability

  validateIronSteelInput(ctx, payload)

  // --- per-category compute --------------------------------------------------
  const stationary = app?.stationaryCombustion === false ? emptyGas() : calculateStationaryCombustion(ctx, payload.methodSelections.stationaryMethod, activity.stationaryCombustion ?? [], gwp)
  const mobileBucket = app?.mobile === false ? { owned: emptyGas(), thirdParty: emptyGas() } : calculateMobile(ctx, activity.mobile ?? [], gwp)
  const cokeOven = app?.cokeOven === false ? emptyGas() : calculateCokeOven(ctx, activity.cokeOven ?? [], gwp)
  const flaring = app?.flaring === false ? emptyGas() : calculateFlaring(ctx, activity.flaring ?? [], gwp)
  const sinter = app?.sinter === false ? emptyGas() : calculateSinter(ctx, activity.sinter ?? [], gwp)
  const dri = app?.dri === false ? emptyGas() : calculateDri(ctx, activity.dri ?? [], gwp)
  const bfBof = app?.bfBof === false ? emptyGas() : calculateBfBof(ctx, activity.bfBof ?? [], gwp)
  const eaf = app?.eaf === false ? emptyGas() : calculateEaf(ctx, activity.eaf ?? [], gwp)
  const limeKiln = app?.limeKiln === false ? emptyGas() : calculateLimeKiln(ctx, activity.limeKiln ?? [], gwp)
  const fugitiveHFC = app?.fugitiveHFC === false ? emptyGas() : calculateFugitiveHFC(ctx, activity.fugitiveHFC ?? [])
  const fugitiveSF6 = app?.fugitiveSF6 === false ? emptyGas() : calculateFugitiveSF6(ctx, activity.fugitiveSF6 ?? [], gwp)
  const fugitiveOther = app?.fugitiveOther === false ? emptyGas() : calculateFugitiveOther(ctx, activity.fugitiveOther ?? [], gwp)
  const reported = app?.reported === false ? emptyGas() : calculateReported(ctx, activity.reported ?? [], gwp)

  // --- supporting Scope 2 (excluded from gross) -----------------------------
  let electricityCO2 = 0
  if (app?.purchasedElectricity !== false) {
    const mwh = activity.purchasedElectricity?.mwh
    if (isPresent(mwh)) {
      const gridEf = activity.purchasedElectricity?.gridEfTco2PerMwh
      const ef = ctx.resolver.resolveOrSupplied('IS_INDIA_GRID_EF', gridEf)
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
  const byCategory: Record<IronSteelCategory, GasAmounts> = {
    stationaryCombustion: roundGas(scaleGas(stationary, shareFactor)),
    mobile: roundGas(scaleGas(mobileBucket.owned, shareFactor)),
    cokeOven: roundGas(scaleGas(cokeOven, shareFactor)),
    flaring: roundGas(scaleGas(flaring, shareFactor)),
    sinter: roundGas(scaleGas(sinter, shareFactor)),
    dri: roundGas(scaleGas(dri, shareFactor)),
    bfBof: roundGas(scaleGas(bfBof, shareFactor)),
    eaf: roundGas(scaleGas(eaf, shareFactor)),
    limeKiln: roundGas(scaleGas(limeKiln, shareFactor)),
    fugitiveHFC: roundGas(scaleGas(fugitiveHFC, shareFactor)),
    fugitiveSF6: roundGas(scaleGas(fugitiveSF6, shareFactor)),
    fugitiveOther: roundGas(scaleGas(fugitiveOther, shareFactor)),
    reported: roundGas(scaleGas(reported, shareFactor)),
  }
  const grossScope1 = round(Object.values(byCategory).reduce((a, g) => a + g.co2eTonnes, 0), 4)

  // --- negative-result backstop ---------------------------------------------
  if (grossScope1 < 0) {
    ctx.error('negative_scope1_result', `Gross Scope 1 is negative (${grossScope1} tCO2e). Check inputs.`)
  }
  for (const [k, g] of Object.entries(byCategory)) {
    if (g.co2eTonnes < 0) {
      ctx.error('negative_category_result', `Category "${k}" is negative (${g.co2eTonnes} tCO2e).`, `activityData.${k}`)
    }
  }

  // --- by-gas decomposition --------------------------------------------------
  const scaledForGas: GasAmounts[] = [stationary, mobileBucket.owned, cokeOven, flaring, sinter, dri, bfBof, eaf, limeKiln, fugitiveOther, reported].map((g) => scaleGas(g, shareFactor))
  const sumGas = scaledForGas.reduce<GasAmounts>((acc, g) => { addGas(acc, g); return acc }, emptyGas())
  const scaledHfc = scaleGas(fugitiveHFC, shareFactor)
  const scaledSf6 = scaleGas(fugitiveSF6, shareFactor)
  const byGas = {
    co2Tonnes: round(sumGas.co2Tonnes, 4),
    ch4Tonnes: round(sumGas.ch4Tonnes, 4),
    ch4CO2eTonnes: round(sumGas.ch4Tonnes * gwp.CH4_FOSSIL, 4),
    n2oTonnes: round(sumGas.n2oTonnes, 4),
    n2oCO2eTonnes: round(sumGas.n2oTonnes * gwp.N2O, 4),
    hfcCO2eTonnes: round(scaledHfc.co2eTonnes, 4),
    sf6CO2eTonnes: round(scaledSf6.co2eTonnes, 4),
  }

  // --- biogenic memo (excluded from Scope 1) --------------------------------
  const biogenicMemo = round(scaledForGas.reduce((a, g) => a + g.biogenicCO2Tonnes, 0), 4)
  const electricityScoped = round(electricityCO2 * shareFactor, 4)
  const thirdPartyMobileScoped = round(mobileBucket.thirdParty.co2eTonnes * shareFactor, 4)

  // --- intensity metrics ----------------------------------------------------
  const prod = activity.production
  const denom = (q: number | null | undefined) => (isPresent(q) && (q as number) > 0 ? (q as number) * shareFactor : 0)
  const fossilCO2 = byGas.co2Tonnes
  const intensityMetrics = {
    co2ePerTonneCrudeSteel: denom(prod.crudeSteelTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.crudeSteelTonnes), 3) : undefined,
    co2ePerTonneHotRolled: denom(prod.hotRolledTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.hotRolledTonnes), 3) : undefined,
    co2ePerTonneHotMetal: denom(prod.hotMetalTonnes) > 0 ? round((grossScope1 * 1000) / denom(prod.hotMetalTonnes), 3) : undefined,
    fossilCo2PerTonneCrudeSteel: denom(prod.crudeSteelTonnes) > 0 ? round((fossilCO2 * 1000) / denom(prod.crudeSteelTonnes), 3) : undefined,
  }

  // --- disclosed-vs-modelled reconciliation ---------------------------------
  // Reconcile each disclosed figure independently — gross can match while the
  // gas mix is wrong, or the corporate aggregate could include sites that the
  // engine model excludes. By-gas + Scope 2 + intensity reconciliation is the
  // standard public-disclosure cross-check (BRSR, ETS verified statements,
  // worldsteel returns all break down to these dimensions).
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
  addReconLine('CO2', 'CO2 (gross)', 'tCO2', activity.disclosedScope1CO2Tonnes, byGas.co2Tonnes)
  addReconLine('CH4', 'CH4 (gross, mass)', 'tCH4', activity.disclosedScope1CH4Tonnes, byGas.ch4Tonnes)
  addReconLine('N2O', 'N2O (gross, mass)', 'tN2O', activity.disclosedScope1N2OTonnes, byGas.n2oTonnes)
  addReconLine('SCOPE2', 'Supporting Scope 2', 'tCO2e', activity.disclosedScope2CO2eTonnes, electricityScoped)
  // Intensity reconciliation — kg CO2e per tonne crude steel (canonical steel KPI)
  const csForIntensity = isPresent(prod.crudeSteelTonnes) && (prod.crudeSteelTonnes as number) > 0 ? (prod.crudeSteelTonnes as number) * shareFactor : 0
  if (csForIntensity > 0 && isPresent(activity.disclosedIntensityKgPerTcrudeSteel) && (activity.disclosedIntensityKgPerTcrudeSteel as number) > 0) {
    const modelledIntensity = (grossScope1 * 1000) / csForIntensity
    addReconLine('INTENSITY', 'Intensity per t crude steel', 'kgCO2e/t', activity.disclosedIntensityKgPerTcrudeSteel, modelledIntensity)
  }

  // Nudge: a disclosed by-gas figure was supplied but the model carries no
  // mass for that gas — typical of a gross-only reported entry. Steer to
  // by-gas reported entry to enable each-gas reconciliation.
  const gasSplitMissing = lines.some(
    (l) => (l.metric === 'CO2' || l.metric === 'CH4' || l.metric === 'N2O') && l.modelled === 0 && (l.disclosed ?? 0) > 0,
  )
  if (gasSplitMissing) {
    ctx.warn(
      'reported_gas_split_missing',
      'A disclosed by-gas figure (CO2 / CH4 / N2O) was provided but the modelled inventory has no mass for that gas — likely because the total was entered as a single gross CO2e. Enter the reported figure by gas instead to enable per-gas reconciliation.',
      'activityData.reported',
    )
  }

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
    ...(activity.mobile ?? []),
    ...(activity.cokeOven ?? []),
    ...(activity.sinter ?? []),
    ...(activity.dri ?? []),
    ...(activity.bfBof ?? []),
    ...(activity.eaf ?? []),
    ...(activity.limeKiln ?? []),
    ...(activity.flaring ?? []),
    ...(activity.fugitiveHFC ?? []),
    ...(activity.fugitiveSF6 ?? []),
    ...(activity.fugitiveOther ?? []),
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

  const reportedShare = grossScope1 > 0 ? byCategory.reported.co2eTonnes / grossScope1 : 0
  const overall =
    reportedShare >= 0.5
      ? 'REPORTED_AGGREGATE'
      : fallbacksApplied.length > 0 || defaultsUsed.length >= 3
        ? 'DEFAULTS_HEAVY'
        : defaultsUsed.length === 0
          ? 'PLANT_SPECIFIC'
          : 'MIXED'

  const result: IronSteelCalculationResult = {
    calculationId,
    status: 'SUCCESS',
    sectorCode: 'IRON_STEEL',
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
    reconciliation,
    assumptions,
    dataQuality: { defaultsUsed, fallbacksApplied, overall },
    warnings: ctx.warnings,
    errors: ctx.errors,
    calculationTrace: ctx.trace,
    factorSnapshots: ctx.resolver.list(),
    auditStatus: { workflowStatus: 'DRAFT', calculatedAt: new Date().toISOString() },
  }

  assertIronSteelScopeSeparation(ctx, result)
  result.errors = ctx.errors
  result.warnings = ctx.warnings
  result.status = ctx.errors.length > 0 ? 'BLOCKED' : ctx.warnings.length > 0 ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS'
  return result
}
