/**
 * Oil & Gas calculation orchestrator: validate -> compute each of the six
 * IPIECA categories (+ refrigerants) separately -> apply equity-share
 * consolidation -> assemble the gas-level result -> assert scope separation.
 * Pure and deterministic, so it can be unit-tested exhaustively against the
 * worked examples in the methodology document.
 *
 * Unlike CSI cement (CO2-only), gross Scope 1 here is full CO2e across
 * CO2 + CH4 + N2O. Biogenic CO2 is a memo, purchased electricity is supporting
 * Scope 2, and third-party mobile is supporting Scope 3.
 */

import { FactorResolver } from '../factors'
import { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { calculateMobileCombustion, calculateStationaryCombustion } from './combustion'
import { METHODOLOGY_PACK, OILGAS_CONSTANT_FACTORS, PROCESS_FACTORS, sharedGwpSetFor } from './constants'
import { calculateFlaring } from './flaring'
import { calculateFugitiveComponents } from './fugitiveComponents'
import { resolveGwp } from './gwp'
import { addGas, emptyGas, roundGas, scaleGas } from './helpers'
import { calculateProcess } from './process'
import { calculateRefrigerants } from './refrigerants'
import { calculateReported } from './reported'
import { calculateVenting } from './venting'
import { assertOilGasScopeSeparation, validateOilGasInput } from './validate'
import type { AssumptionEntry, GasAmounts, OilGasCalculationResult, OilGasInputPayload, ReconciliationLine } from './types'

export function calculateOilGas(
  payload: OilGasInputPayload,
  calculationId: string | null = null,
): OilGasCalculationResult {
  const gwpSet = payload.calculationContext?.gwpSet ?? 'AR6_100'
  const resolver = new FactorResolver(payload.factorOverrides ?? {}, {
    ...OILGAS_CONSTANT_FACTORS,
    ...PROCESS_FACTORS,
  })
  const ctx = new EngineContext(resolver, sharedGwpSetFor(gwpSet))
  const gwp = resolveGwp(gwpSet)
  const activity = payload.activityData
  const app = payload.sourceApplicability

  validateOilGasInput(ctx, payload)

  // --- categories (raw, pre-consolidation) --------------------------------
  const stationary =
    app.stationaryCombustion === false
      ? emptyGas()
      : calculateStationaryCombustion(ctx, payload.methodSelections.stationaryCombustionMethod, activity.stationaryCombustion ?? [], gwp)

  const mobile =
    app.mobileCombustion === false
      ? { owned: emptyGas(), thirdParty: emptyGas() }
      : calculateMobileCombustion(ctx, payload.methodSelections, activity.mobileCombustion ?? [], gwp)

  const flaring = app.flaring === false ? emptyGas() : calculateFlaring(ctx, activity.flaring ?? [], gwp)
  const venting = app.venting === false ? emptyGas() : calculateVenting(ctx, activity.venting ?? [], gwp)
  const fugitive =
    app.fugitiveComponents === false ? emptyGas() : calculateFugitiveComponents(ctx, activity.fugitiveComponents ?? [], gwp)
  const refrigerants =
    app.refrigerants === false ? emptyGas() : calculateRefrigerants(ctx, activity.refrigerants ?? [], gwpSet)
  const process = app.process === false ? emptyGas() : calculateProcess(ctx, activity.process ?? [], gwp)
  const reported = app.reported === false ? emptyGas() : calculateReported(ctx, activity.reported ?? [], gwp)

  // --- supporting Scope 2: purchased electricity --------------------------
  let electricityCO2 = 0
  if (app.purchasedElectricity !== false) {
    const mwh = activity.purchasedElectricity?.mwh
    if (isPresent(mwh)) {
      const gridEf = activity.purchasedElectricity?.gridEfTco2PerMwh
      // Records the supplied factor when present, the library default otherwise
      // (no eager recording of an unused default).
      const ef = ctx.resolver.resolveOrSupplied('INDIA_GRID_EF', gridEf)
      if (isMissing(gridEf)) {
        ctx.defaultsUsed.add('default_grid_ef_used')
        ctx.warn('default_grid_ef_used', `Default grid EF ${ef} tCO2/MWh used for purchased electricity.`)
      }
      electricityCO2 = mwh * ef
      ctx.addTrace({
        step: 'Purchased electricity CO2 (supporting Scope 2, excluded from Scope 1)',
        category: 'SUPPORTING_SCOPE2',
        method: payload.methodSelections.electricityMethod,
        formula: 'electricityMWh × gridEF (tCO2/MWh)',
        inputs: { electricityMWh: mwh, gridEfTco2PerMwh: round(ef) },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(electricityCO2, 4),
      })
    }
  }

  // --- equity-share consolidation -----------------------------------------
  const isEquityShare = payload.organizationBoundary?.boundaryMethod === 'EQUITY_SHARE'
  const sharePercent =
    payload.organizationBoundary?.consolidationPercent ?? payload.organizationBoundary?.ownershipSharePercent ?? 100
  const shareFactor = isEquityShare ? Math.min(Math.max((sharePercent ?? 100) / 100, 0), 1) : 1
  if (isEquityShare) {
    if (sharePercent < 0 || sharePercent > 100) {
      ctx.error('consolidation_share_out_of_range', `Consolidation share ${sharePercent}% is outside [0, 100].`, 'organizationBoundary.consolidationPercent')
    }
    ctx.fallbacksApplied.add(`Equity share consolidation applied (${(shareFactor * 100).toFixed(2)}%)`)
    ctx.addTrace({
      step: `Equity share consolidation x ${(shareFactor * 100).toFixed(2)}%`,
      category: 'CONSOLIDATION',
      method: 'EQUITY_SHARE',
      formula: 'each Scope 1 bucket x consolidationPercent / 100',
      inputs: { consolidationPercent: sharePercent ?? 100 },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: 0,
    })
  }

  // --- assemble byCategory (scaled + rounded) -----------------------------
  const byCategory = {
    stationaryCombustion: roundGas(scaleGas(stationary, shareFactor)),
    mobileCombustion: roundGas(scaleGas(mobile.owned, shareFactor)),
    flaring: roundGas(scaleGas(flaring, shareFactor)),
    venting: roundGas(scaleGas(venting, shareFactor)),
    fugitiveComponents: roundGas(scaleGas(fugitive, shareFactor)),
    refrigerants: roundGas(scaleGas(refrigerants, shareFactor)),
    process: roundGas(scaleGas(process, shareFactor)),
    reported: roundGas(scaleGas(reported, shareFactor)),
  }
  const grossScope1 = round(
    Object.values(byCategory).reduce((a, g) => a + g.co2eTonnes, 0),
    4,
  )

  // --- negative-result backstop -------------------------------------------
  // Defence in depth: even if a negative input slipped past validation, a
  // negative gross or category total is never a valid Scope 1 result.
  if (grossScope1 < 0) {
    ctx.error('negative_scope1_result', `Gross Scope 1 is negative (${grossScope1} tCO2e). Check for negative inputs — negative emissions are not valid.`)
  }
  for (const [k, g] of Object.entries(byCategory)) {
    if (g.co2eTonnes < 0) {
      ctx.error('negative_category_result', `Category "${k}" is negative (${g.co2eTonnes} tCO2e). Check for negative inputs.`, `activityData.${k}`)
    }
  }

  // --- by-gas rollup (informational decomposition) ------------------------
  const scaledOwned: GasAmounts[] = [stationary, mobile.owned, flaring, venting, fugitive, process, reported].map((g) =>
    scaleGas(g, shareFactor),
  )
  const sumOwned = scaledOwned.reduce<GasAmounts>((acc, g) => {
    addGas(acc, g)
    return acc
  }, emptyGas())
  const scaledRefrigerants = scaleGas(refrigerants, shareFactor)
  const byGas = {
    co2Tonnes: round(sumOwned.co2Tonnes, 4),
    ch4Tonnes: round(sumOwned.ch4Tonnes, 4),
    ch4CO2eTonnes: round(sumOwned.ch4Tonnes * gwp.CH4_FOSSIL, 4),
    n2oTonnes: round(sumOwned.n2oTonnes, 4),
    n2oCO2eTonnes: round(sumOwned.n2oTonnes * gwp.N2O, 4),
    refrigerantCO2eTonnes: round(scaledRefrigerants.co2eTonnes, 4),
  }

  const biogenicMemo = round(sumOwned.biogenicCO2Tonnes, 4)
  const electricityScoped = round(electricityCO2 * shareFactor, 4)
  const thirdPartyMobileScoped = round(mobile.thirdParty.co2eTonnes * shareFactor, 4)

  // --- intensity metrics (numerator and denominator at same share) --------
  const prod = activity.production
  const denom = (q: number | null | undefined) => (isPresent(q) && q > 0 ? q * shareFactor : 0)
  const intensityMetrics = {
    co2ePerBoe: denom(prod.boeProduced) > 0 ? round((grossScope1 * 1000) / denom(prod.boeProduced), 3) : null,
    co2ePerBblCrude: denom(prod.crudeProcessedBbl) > 0 ? round((grossScope1 * 1000) / denom(prod.crudeProcessedBbl), 3) : null,
    co2ePerTonneLng: denom(prod.lngProducedTonnes) > 0 ? round(grossScope1 / denom(prod.lngProducedTonnes), 4) : null,
    co2ePerMMscfThroughput: denom(prod.throughputMMscf) > 0 ? round(grossScope1 / denom(prod.throughputMMscf), 4) : null,
    methaneIntensityPercent:
      denom(prod.gasProductionMassTonnes) > 0
        ? round((byGas.ch4Tonnes / denom(prod.gasProductionMassTonnes)) * 100, 4)
        : null,
  }

  // --- mass balance reconciliation (V1 §11.5) -----------------------------
  const mb = activity.massBalance
  let massBalance: OilGasCalculationResult['massBalance'] = {
    checked: false,
    imbalancePercent: null,
    note: 'No hydrocarbon mass-balance inputs provided.',
  }
  if (mb && isPresent(mb.gasInSm3) && (mb.gasInSm3 as number) > 0) {
    const outs =
      orDefault(mb.salesGasSm3, 0) +
      orDefault(mb.fuelGasSm3, 0) +
      orDefault(mb.flaredSm3, 0) +
      orDefault(mb.ventedSm3, 0) +
      orDefault(mb.fugitiveSm3, 0) +
      orDefault(mb.inventoryChangeSm3, 0)
    const imbalance = ((mb.gasInSm3 as number) - outs) / (mb.gasInSm3 as number)
    const imbalancePercent = round(imbalance * 100, 2)
    const over = Math.abs(imbalance) > 0.03
    if (over) {
      ctx.warn(
        'mass_balance_imbalance_exceeds_3pct',
        `Hydrocarbon mass balance imbalance is ${imbalancePercent}% (> 3%). Unaccounted gas is usually under-estimated fugitives/venting — attribute the gap before finalising.`,
        'activityData.massBalance',
      )
    }
    massBalance = {
      checked: true,
      imbalancePercent,
      note: over
        ? 'Imbalance exceeds the 3% threshold; reconcile before period close.'
        : 'Within the 3% reconciliation threshold.',
    }
  }

  // --- disclosed-vs-modelled reconciliation -------------------------------
  // Compare each disclosed figure (gross CO2e, per-gas masses, Scope 2) against
  // the modelled inventory independently. Gross can reconcile while the gas mix
  // is wrong, so methane/CO2 are checked on their own — the way O&G assurers
  // increasingly disclose (OGMP 2.0 separates methane from CO2).
  const RECON_THRESHOLD = 5 // percent
  const reconLines: ReconciliationLine[] = []
  const addReconLine = (
    metric: ReconciliationLine['metric'],
    label: string,
    unit: string,
    disclosedVal: number | null | undefined,
    modelledVal: number,
  ) => {
    if (!isPresent(disclosedVal) || (disclosedVal as number) <= 0) return
    const d = disclosedVal as number
    const variancePercent = round(((modelledVal - d) / d) * 100, 2)
    reconLines.push({
      metric,
      label,
      unit,
      disclosed: round(d, 4),
      modelled: round(modelledVal, 4),
      variancePercent,
      withinThreshold: Math.abs(variancePercent) <= RECON_THRESHOLD,
    })
  }
  addReconLine('GROSS_CO2E', 'Gross Scope 1', 'tCO2e', activity.disclosedGrossScope1CO2eTonnes, grossScope1)
  addReconLine('CO2', 'CO2', 'tCO2', activity.disclosedScope1CO2Tonnes, byGas.co2Tonnes)
  addReconLine('CH4', 'CH4', 'tCH4', activity.disclosedScope1CH4Tonnes, byGas.ch4Tonnes)
  addReconLine('N2O', 'N2O', 'tN2O', activity.disclosedScope1N2OTonnes, byGas.n2oTonnes)
  addReconLine('SCOPE2', 'Supporting Scope 2', 'tCO2e', activity.disclosedScope2CO2eTonnes, electricityScoped)

  // Nudge: a disclosed gas mass was supplied but the model carries no mass for
  // that gas (typical of a gross-only reported entry) — steer to by-gas entry.
  const gasSplitMissing = reconLines.some(
    (l) => (l.metric === 'CO2' || l.metric === 'CH4' || l.metric === 'N2O') && l.modelled === 0 && (l.disclosed ?? 0) > 0,
  )
  if (gasSplitMissing) {
    ctx.warn(
      'reported_gas_split_missing',
      'A disclosed by-gas figure (CO2/CH4/N2O) was provided but the modelled inventory has no mass for that gas — likely because the total was entered as a single gross CO2e. Enter the reported figure by gas (CO2/CH4/N2O) to reconcile each gas independently.',
      'activityData.reported',
    )
  }

  const exceedingLines = reconLines.filter((l) => !l.withinThreshold)
  if (exceedingLines.length > 0) {
    ctx.warn(
      'reconciliation_variance_exceeds_5pct',
      `${exceedingLines.length} disclosed metric(s) differ from the modelled inventory by more than ${RECON_THRESHOLD}%: ${exceedingLines
        .map((l) => `${l.label} ${l.variancePercent}%`)
        .join(', ')}. Review assumptions / disclosure mapping.`,
      'activityData.disclosedGrossScope1CO2eTonnes',
    )
  }

  const grossLine = reconLines.find((l) => l.metric === 'GROSS_CO2E')
  const reconciliation: OilGasCalculationResult['reconciliation'] = {
    checked: reconLines.length > 0,
    disclosedGrossCO2eTonnes: grossLine ? grossLine.disclosed : null,
    modelledGrossCO2eTonnes: grossScope1,
    variancePercent: grossLine ? grossLine.variancePercent : null,
    note:
      reconLines.length === 0
        ? 'No disclosed figures provided.'
        : exceedingLines.length > 0
          ? `${exceedingLines.length} of ${reconLines.length} disclosed metric(s) exceed the ${RECON_THRESHOLD}% threshold; review before sign-off.`
          : `All ${reconLines.length} disclosed metric(s) within the ${RECON_THRESHOLD}% threshold.`,
    lines: reconLines,
  }

  const defaultsUsed = Array.from(ctx.defaultsUsed)
  const fallbacksApplied = Array.from(ctx.fallbacksApplied)

  // --- assumptions & limitations register ---------------------------------
  // One auditable list of every place the inventory leaned on a default, a
  // fallback, an explicit per-row override, or an estimated/inferred basis.
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
    ...activity.stationaryCombustion,
    ...activity.mobileCombustion,
    ...activity.flaring,
    ...activity.venting,
    ...activity.fugitiveComponents,
    ...activity.refrigerants,
    ...activity.process,
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

  // --- data-quality tier (basis-aware) ------------------------------------
  // A disclosed corporate aggregate is the LEAST granular data there is, so it
  // must not read as "plant specific" just because it triggered no defaults.
  const reportedShare = grossScope1 > 0 ? byCategory.reported.co2eTonnes / grossScope1 : 0
  const overall: OilGasCalculationResult['dataQuality']['overall'] =
    reportedShare >= 0.5
      ? 'REPORTED_AGGREGATE'
      : fallbacksApplied.length > 0 || defaultsUsed.length >= 3
        ? 'DEFAULTS_HEAVY'
        : defaultsUsed.length === 0
          ? 'PLANT_SPECIFIC'
          : 'MIXED'

  const result: OilGasCalculationResult = {
    calculationId,
    status: 'SUCCESS',
    sectorCode: 'OIL_GAS',
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
    dataQuality: { defaultsUsed, fallbacksApplied, overall },
    assumptions,
    massBalance,
    reconciliation,
    warnings: ctx.warnings,
    errors: ctx.errors,
    calculationTrace: ctx.trace,
    factorSnapshots: ctx.resolver.list(),
    auditStatus: { workflowStatus: 'DRAFT', calculatedAt: new Date().toISOString() },
  }

  assertOilGasScopeSeparation(ctx, result)
  result.errors = ctx.errors
  result.warnings = ctx.warnings
  result.status = ctx.errors.length > 0 ? 'BLOCKED' : ctx.warnings.length > 0 ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS'

  return result
}
