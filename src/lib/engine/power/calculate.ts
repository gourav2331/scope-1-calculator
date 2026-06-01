/**
 * Power Sector Scope 1 calculation orchestrator.
 *
 *   1. validate (range checks + applicability + disclosure boundary)
 *   2. compute every bucket (stationary main + auxiliary + biomass + mobile +
 *      FGD + SCR + SF6 + HFC + other CH4 + CCUS deduction + reported)
 *   3. assemble byCategory + byGas + gross Scope 1
 *   4. equity-share consolidation
 *   5. intensity metrics (kg CO2e / MWh net is the canonical KPI)
 *   6. reconciliation against disclosed figures (gross + per-gas + Scope 2 +
 *      intensity per MWh net)
 *   7. assumptions register + data quality
 *   8. scope separation assertion
 */

import { EngineContext } from '../context'
import { FactorResolver } from '../factors'
import type { FactorOverride } from '../types'
import { isPresent, round } from '../util'

import {
  METHODOLOGY_PACK,
  POWER_CONSTANT_FACTORS,
  sharedGwpSetFor,
} from './constants'
import { calculateCcus } from './ccus'
import { calculateStationary } from './combustion'
import {
  calculateHFC,
  calculateOtherCH4,
  calculateSF6,
} from './fugitives'
import { ch4ToCO2e, n2oToCO2e, type PowerGwp } from './gwp'
import { addGas, emptyGas, roundGas, scaleGas } from './helpers'
import { calculateMobile } from './mobile'
import { calculateFgd, calculateScrSncr } from './process'
import { calculateReported } from './reported'
import type {
  AssumptionEntry,
  ByCategory,
  GasAmounts,
  PowerCalculationResult,
  PowerInputPayload,
  ReconciliationLine,
} from './types'
import { validatePowerInput } from './validate'

export function calculatePower(
  payload: PowerInputPayload,
  calculationId: string | null = null,
): PowerCalculationResult {
  // FactorOverride.reason is required by the shared type — coerce here.
  const overrides: Record<string, FactorOverride> = {}
  for (const [k, v] of Object.entries(payload.factorOverrides ?? {})) {
    overrides[k] = { value: v.value, source: v.source, reason: v.reason ?? '' }
  }
  const resolver = new FactorResolver(overrides, POWER_CONSTANT_FACTORS)
  const gwp: PowerGwp = payload.calculationContext?.gwpSet ?? 'AR6_100'
  const ctx = new EngineContext(resolver, sharedGwpSetFor(gwp))
  const activity = payload.activityData
  const applicability = payload.sourceApplicability

  validatePowerInput(ctx, payload)

  // ---- Stationary main / aux / biomass --------------------------------
  const stationaryMain = applicability.stationaryMain === false
    ? emptyGas()
    : calculateStationary(
        ctx,
        payload.methodSelections.stationaryMethod,
        activity.stationaryMain ?? [],
        gwp,
        'STATIONARY_MAIN',
      )
  const stationaryAuxiliary = applicability.stationaryAuxiliary === false
    ? emptyGas()
    : calculateStationary(
        ctx,
        payload.methodSelections.stationaryMethod,
        activity.stationaryAuxiliary ?? [],
        gwp,
        'STATIONARY_AUXILIARY',
      )
  const biomassCofiring = applicability.biomassCofiring === false
    ? emptyGas()
    : calculateStationary(
        ctx,
        payload.methodSelections.stationaryMethod,
        activity.biomassCofiring ?? [],
        gwp,
        'BIOMASS_COFIRING',
      )

  // ---- Mobile --------------------------------------------------------
  const mobileTotals = applicability.mobile === false
    ? { ownedScope1: emptyGas(), thirdPartyScope3CO2eTonnes: 0 }
    : calculateMobile(ctx, activity.mobile ?? [], gwp)

  // ---- Process: FGD + SCR/SNCR ---------------------------------------
  const fgdLimestone = applicability.fgdLimestone === false
    ? emptyGas()
    : calculateFgd(ctx, activity.fgd ?? [])
  const scrUrea = applicability.scrUrea === false
    ? emptyGas()
    : calculateScrSncr(ctx, activity.scr ?? [], gwp)

  // ---- Fugitive: SF6 + HFC + other CH4 -------------------------------
  const fugitiveSF6 = applicability.fugitiveSF6 === false
    ? emptyGas()
    : calculateSF6(ctx, activity.fugitiveSF6 ?? [], gwp)
  const fugitiveHFC = applicability.fugitiveHFC === false
    ? emptyGas()
    : calculateHFC(ctx, activity.fugitiveHFC ?? [])
  const fugitiveOtherCH4 = applicability.fugitiveOtherCH4 === false
    ? emptyGas()
    : calculateOtherCH4(ctx, activity.fugitiveOtherCH4 ?? [], gwp)

  // ---- CCUS netting (storage credit) ---------------------------------
  const ccs = applicability.ccus === false
    ? { capturedAndStoredTonnes: 0, processVentTonnes: 0 }
    : calculateCcus(ctx, activity.ccus ?? [])

  // ---- Reported / direct-entry ---------------------------------------
  const reported = applicability.reported === false
    ? emptyGas()
    : calculateReported(ctx, activity.reported ?? [], gwp)

  // ---- byCategory + byGas + gross ------------------------------------
  let byCategory: ByCategory = {
    stationaryMain,
    stationaryAuxiliary,
    biomassCofiring,
    mobile: mobileTotals.ownedScope1,
    fgdLimestone,
    scrUrea,
    fugitiveSF6,
    fugitiveHFC,
    fugitiveOtherCH4,
    ccusVenting: emptyGas(),
    reported,
  }

  let byGas: GasAmounts = emptyGas()
  for (const g of Object.values(byCategory) as GasAmounts[]) {
    byGas = addGas(byGas, g)
  }

  // Gross Scope 1 = byGas.co2eTonnes - CCS deduction
  let grossScope1 = byGas.co2eTonnes - ccs.capturedAndStoredTonnes

  // ---- Equity-share consolidation ------------------------------------
  const isEquityShare = payload.organizationBoundary?.boundaryMethod === 'EQUITY_SHARE'
  const sharePercent =
    payload.organizationBoundary?.consolidationPercent ??
    payload.organizationBoundary?.ownershipSharePercent ?? 100
  const shareFactor = isEquityShare
    ? Math.min(Math.max((sharePercent ?? 100) / 100, 0), 1) : 1
  if (isEquityShare) {
    ctx.fallbacksApplied.add(`Equity share consolidation applied (${(shareFactor * 100).toFixed(2)}%)`)
    if (sharePercent < 0 || sharePercent > 100) {
      ctx.error('consolidation_share_out_of_range',
        `Consolidation share ${sharePercent}% is outside [0, 100].`,
        'organizationBoundary.consolidationPercent')
    }
    const scale = (g: GasAmounts) => scaleGas(g, shareFactor)
    byCategory = {
      stationaryMain: scale(byCategory.stationaryMain),
      stationaryAuxiliary: scale(byCategory.stationaryAuxiliary),
      biomassCofiring: scale(byCategory.biomassCofiring),
      mobile: scale(byCategory.mobile),
      fgdLimestone: scale(byCategory.fgdLimestone),
      scrUrea: scale(byCategory.scrUrea),
      fugitiveSF6: scale(byCategory.fugitiveSF6),
      fugitiveHFC: scale(byCategory.fugitiveHFC),
      fugitiveOtherCH4: scale(byCategory.fugitiveOtherCH4),
      ccusVenting: emptyGas(),
      reported: scale(byCategory.reported),
    }
    byGas = scaleGas(byGas, shareFactor)
    grossScope1 *= shareFactor
    ccs.capturedAndStoredTonnes *= shareFactor
    ccs.processVentTonnes *= shareFactor
  }

  // ---- Supporting Scope 2 (purchased electricity) --------------------
  const electricityScoped = applicability.purchasedElectricity === false
    ? 0
    : (() => {
        const mwh = activity.purchasedElectricity?.mwh ?? 0
        if (typeof mwh !== 'number' || mwh <= 0) return 0
        let ef = activity.purchasedElectricity?.gridEfTco2PerMwh
        if (!isPresent(ef) || (ef as number) <= 0) {
          ef = ctx.resolver.constant('POWER_INDIA_GRID_EF')
          ctx.defaultsUsed.add('default_grid_ef_used')
          ctx.warn(
            'default_grid_ef_used',
            `Default grid EF ${ef} tCO2/MWh (India CEA v21) used for purchased electricity.`,
            'activityData.purchasedElectricity.gridEfTco2PerMwh',
          )
        }
        const scoped = mwh * (ef as number) * shareFactor
        ctx.addTrace({
          step: 'Supporting Scope 2 — purchased electricity',
          category: 'SUPPORTING_SCOPE_2',
          method: 'LOCATION_BASED',
          formula: 'mwh × gridEF',
          inputs: { mwh, gridEf: ef, scoped: round(scoped, 4) },
          factorSnapshots: ctx.resolver.list(),
          outputTonnesCO2: round(scoped, 4),
        })
        return scoped
      })()

  // ---- Intensity metrics --------------------------------------------
  const grossMwh = activity.production.grossGenerationMwh ?? 0
  const netMwh = activity.production.netGenerationMwh ?? 0
  const denom = (v: number | null | undefined) => (typeof v === 'number' ? v * shareFactor : 0)
  const intensityMetrics = {
    co2ePerMwhNet: denom(netMwh) > 0 ? round((grossScope1 * 1000) / denom(netMwh), 3) : undefined,
    co2ePerMwhGross: denom(grossMwh) > 0 ? round((grossScope1 * 1000) / denom(grossMwh), 3) : undefined,
    fossilCo2PerMwhNet: denom(netMwh) > 0 ? round((byGas.co2Tonnes * 1000) / denom(netMwh), 3) : undefined,
    co2ePerGjHeatInput: undefined,
  }

  // ---- Reconciliation -----------------------------------------------
  const RECON_THRESHOLD = 5
  const lines: ReconciliationLine[] = []
  const addRecon = (metric: ReconciliationLine['metric'], label: string, unit: string,
                    disclosed: number | null | undefined, modelled: number) => {
    if (!isPresent(disclosed) || (disclosed as number) <= 0) return
    const d = disclosed as number
    const v = round(((modelled - d) / d) * 100, 2)
    lines.push({
      metric, label, unit,
      disclosed: round(d, 4),
      modelled: round(modelled, 4),
      variancePercent: v,
      withinThreshold: Math.abs(v) <= RECON_THRESHOLD,
    })
  }
  addRecon('GROSS_CO2E', 'Gross Scope 1', 'tCO2e', activity.disclosedGrossScope1CO2eTonnes, grossScope1)
  addRecon('CO2', 'CO2 (gross)', 'tCO2', activity.disclosedScope1CO2Tonnes, byGas.co2Tonnes)
  addRecon('CH4', 'CH4 (gross, mass)', 'tCH4', activity.disclosedScope1CH4Tonnes, byGas.ch4Tonnes)
  addRecon('N2O', 'N2O (gross, mass)', 'tN2O', activity.disclosedScope1N2OTonnes, byGas.n2oTonnes)
  addRecon('SCOPE2', 'Supporting Scope 2', 'tCO2e', activity.disclosedScope2CO2eTonnes, electricityScoped)
  if (denom(netMwh) > 0 && isPresent(activity.disclosedIntensityKgPerMwhNet)
      && (activity.disclosedIntensityKgPerMwhNet as number) > 0) {
    const modelled = (grossScope1 * 1000) / denom(netMwh)
    addRecon('INTENSITY', 'Intensity per MWh net', 'kgCO2e/MWh',
      activity.disclosedIntensityKgPerMwhNet, modelled)
  }
  const gasSplitMissing = lines.some(
    (l) => (l.metric === 'CO2' || l.metric === 'CH4' || l.metric === 'N2O')
        && l.modelled === 0 && (l.disclosed ?? 0) > 0,
  )
  if (gasSplitMissing) {
    ctx.warn(
      'reported_gas_split_missing',
      'A disclosed by-gas figure was provided but the modelled inventory has no mass for that gas. Add the reported entry by gas to enable per-gas reconciliation.',
    )
  }
  const exceeding = lines.filter((l) => !l.withinThreshold)
  if (exceeding.length > 0) {
    ctx.warn(
      'reconciliation_variance_exceeds_5pct',
      `${exceeding.length} disclosed metric(s) differ from the modelled inventory by more than ${RECON_THRESHOLD}%: ${exceeding.map((l) => `${l.label} ${l.variancePercent}%`).join(', ')}.`,
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
      : exceeding.length > 0
        ? `${exceeding.length} of ${lines.length} disclosed metric(s) exceed the ${RECON_THRESHOLD}% threshold; review before sign-off.`
        : `All ${lines.length} disclosed metric(s) within the ${RECON_THRESHOLD}% threshold.`,
    lines,
  }

  // ---- Assumptions register -----------------------------------------
  const defaultsUsed = Array.from(ctx.defaultsUsed)
  const fallbacksApplied = Array.from(ctx.fallbacksApplied)
  const assumptions: AssumptionEntry[] = []
  for (const d of defaultsUsed) assumptions.push({ kind: 'DEFAULT', label: d, detail: 'Default factor / value used; supply plant-specific data to upgrade tier.' })
  for (const f of fallbacksApplied) assumptions.push({ kind: 'FALLBACK', label: f, detail: 'Automatic fallback applied; recorded in audit trail.' })

  // ---- Data quality (basis-aware) -----------------------------------
  const totalRows = (activity.stationaryMain?.length ?? 0)
    + (activity.stationaryAuxiliary?.length ?? 0)
    + (activity.biomassCofiring?.length ?? 0)
    + (activity.mobile?.length ?? 0)
    + (activity.fgd?.length ?? 0)
    + (activity.scr?.length ?? 0)
    + (activity.fugitiveSF6?.length ?? 0)
    + (activity.fugitiveHFC?.length ?? 0)
    + (activity.fugitiveOtherCH4?.length ?? 0)
  const overall = (() => {
    if (totalRows === 0) return 'NO_DATA'
    const defaultCount = defaultsUsed.length
    if (defaultCount === 0) return 'HIGH'
    if (defaultCount <= 3) return 'GOOD'
    if (defaultCount <= 8) return 'MEDIUM'
    return 'DEFAULTS_HEAVY'
  })()

  // ---- Round outputs ------------------------------------------------
  byGas = roundGas(byGas)
  const roundedByCategory: ByCategory = {
    stationaryMain: roundGas(byCategory.stationaryMain),
    stationaryAuxiliary: roundGas(byCategory.stationaryAuxiliary),
    biomassCofiring: roundGas(byCategory.biomassCofiring),
    mobile: roundGas(byCategory.mobile),
    fgdLimestone: roundGas(byCategory.fgdLimestone),
    scrUrea: roundGas(byCategory.scrUrea),
    fugitiveSF6: roundGas(byCategory.fugitiveSF6),
    fugitiveHFC: roundGas(byCategory.fugitiveHFC),
    fugitiveOtherCH4: roundGas(byCategory.fugitiveOtherCH4),
    ccusVenting: emptyGas(),
    reported: roundGas(byCategory.reported),
  }

  const status: PowerCalculationResult['status'] =
    ctx.errors.length > 0 ? 'BLOCKED'
    : ctx.warnings.length > 0 ? 'SUCCESS_WITH_WARNINGS'
    : 'SUCCESS'

  return {
    calculationId: calculationId ?? '',
    methodologyPack: METHODOLOGY_PACK,
    status,
    gwpSet: gwp,
    reportingPeriod: payload.calculationContext.reportingPeriod,
    ccsCapturedAndStoredTonnes: round(ccs.capturedAndStoredTonnes, 4),
    scope1: {
      byCategory: roundedByCategory,
      byGas,
      grossScope1CO2eTonnes: round(grossScope1, 4),
    },
    memoItems: {
      biogenicCO2Tonnes: round(byGas.biogenicCO2Tonnes, 4),
      ccsProcessVentTonnes: round(ccs.processVentTonnes, 4),
    },
    supportingScope2: { purchasedElectricityCO2eTonnes: round(electricityScoped, 4) },
    supportingScope3: { thirdPartyMobileCO2eTonnes: round(mobileTotals.thirdPartyScope3CO2eTonnes * shareFactor, 4) },
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
}

/* CH4 / N2O helpers re-exported for external test code if needed. */
export { ch4ToCO2e, n2oToCO2e }
