/**
 * Calculation orchestrator: validate -> resolve effective methods (with
 * automatic fallback) -> calculate every bucket separately -> assemble the
 * spec result model -> assert scope separation. Pure and deterministic so it
 * can be unit-tested exhaustively (the correctness requirement).
 */

import { calculateCombustion } from './combustion'
import { calculateFugitive } from './fugitive'
import { METHODOLOGY_PACK } from './constants'
import { EngineContext } from './context'
import { FactorResolver } from './factors'
import { calculateMobile } from './mobile'
import { calculateProcess, calculateUsEpaFallback } from './process'
import { calculateSupporting } from './supporting'
import type { CalculationResult, InputPayload, ProcessEmissionMethod } from './types'
import { isMissing, isPresent, round } from './util'
import { assertScopeSeparation, validateInput } from './validate'

export function calculate(payload: InputPayload, calculationId: string | null = null): CalculationResult {
  const resolver = new FactorResolver(payload.factorOverrides ?? {})
  const ctx = new EngineContext(resolver, payload.calculationContext?.gwpSet ?? 'AR6')
  const activity = payload.activityData
  const applicability = payload.sourceApplicability

  // --- effective process method (auto fallback) ---------------------------
  let effectiveProcessMethod: ProcessEmissionMethod = payload.methodSelections.processEmissionMethod
  const clinkerPresent = isPresent(activity.production.clinkerProducedTonnes)
  const usEpaComplete =
    isPresent(activity.usEpaFallback.cementProducedTonnes) &&
    isPresent(activity.usEpaFallback.clinkerToCementRatio)
  if (effectiveProcessMethod === 'CSI_CLINKER_BASED' && !clinkerPresent && usEpaComplete) {
    effectiveProcessMethod = 'US_EPA_CEMENT_BASED_FALLBACK'
    ctx.fallbacksApplied.add('CSI_CLINKER_BASED -> US_EPA_CEMENT_BASED_FALLBACK (clinker production missing)')
    ctx.warn(
      'default_clinker_ef_used',
      'Clinker production missing; automatically using the US EPA cement-based fallback.',
    )
  }

  const effectivePayload: InputPayload = {
    ...payload,
    methodSelections: { ...payload.methodSelections, processEmissionMethod: effectiveProcessMethod },
  }
  validateInput(ctx, effectivePayload)

  // --- process emissions --------------------------------------------------
  let clinkerCalcinationCO2 = 0
  let bypassDustCO2 = 0
  let ckdCO2 = 0
  let rawMealTocCO2 = 0

  if (applicability.clinkerCalcination !== false) {
    if (effectiveProcessMethod === 'US_EPA_CEMENT_BASED_FALLBACK') {
      clinkerCalcinationCO2 = calculateUsEpaFallback(ctx, activity)
    } else {
      const proc = calculateProcess(ctx, effectivePayload.methodSelections, activity)
      clinkerCalcinationCO2 = proc.clinkerCalcinationCO2Tonnes
      bypassDustCO2 = applicability.bypassDust === false ? 0 : proc.bypassDustCO2Tonnes
      ckdCO2 = applicability.ckd === false ? 0 : proc.ckdCO2Tonnes
      rawMealTocCO2 = applicability.rawMealToc === false ? 0 : proc.rawMealTocCO2Tonnes
    }
  }

  // --- combustion ---------------------------------------------------------
  const kilnFuels = applicability.kilnFuels === false ? [] : activity.kilnFuels ?? []
  const nonKilnFuels = applicability.nonKilnFuels === false ? [] : activity.nonKilnFuels ?? []
  const combustion = calculateCombustion(
    ctx,
    payload.methodSelections.fuelCombustionMethod,
    kilnFuels,
    nonKilnFuels,
  )

  // --- mobile -------------------------------------------------------------
  const mobile =
    applicability.mobile === false
      ? { ownedControlledCO2Tonnes: 0, thirdPartyCO2Tonnes: 0, ch4N2oCO2eTonnes: 0 }
      : calculateMobile(ctx, payload.methodSelections, activity.mobile ?? [])

  // --- fugitive -----------------------------------------------------------
  const fugitiveCO2e =
    applicability.fugitive === false ? 0 : calculateFugitive(ctx, activity.fugitive ?? [])

  // --- supporting ---------------------------------------------------------
  const supporting = calculateSupporting(
    ctx,
    {
      ...payload.methodSelections,
      boughtClinkerMethod:
        applicability.boughtClinker === false ? 'NONE' : payload.methodSelections.boughtClinkerMethod,
    },
    applicability.purchasedElectricity === false
      ? { ...activity, purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null } }
      : activity,
  )

  // --- assemble -----------------------------------------------------------
  const components = {
    clinkerCalcinationCO2Tonnes: round(clinkerCalcinationCO2, 4),
    bypassDustCO2Tonnes: round(bypassDustCO2, 4),
    ckdCO2Tonnes: round(ckdCO2, 4),
    rawMealTocCO2Tonnes: round(rawMealTocCO2, 4),
    conventionalKilnFuelCO2Tonnes: round(combustion.conventionalKilnFossilCO2Tonnes, 4),
    alternativeFossilKilnFuelCO2Tonnes: round(combustion.alternativeFossilKilnCO2Tonnes, 4),
    nonKilnFossilCO2Tonnes: round(combustion.nonKilnFossilCO2Tonnes, 4),
    mobileCombustionCO2Tonnes: round(mobile.ownedControlledCO2Tonnes, 4),
    fugitiveCO2eTonnes: round(fugitiveCO2e, 4),
  }
  const grossScope1 = round(
    Object.values(components).reduce((a, b) => a + b, 0),
    4,
  )

  const biomassMemo = round(combustion.biomassCO2Tonnes, 4)
  const electricityCO2 = round(supporting.purchasedElectricityCO2Tonnes, 4)
  const boughtClinkerCO2 = round(supporting.boughtClinkerCO2Tonnes, 4)
  const acquiredRights = round(supporting.acquiredEmissionRightsTonnes, 4)

  const clinkerProduced = activity.production.clinkerProducedTonnes
  const cementitious = activity.production.cementitiousProductTonnes
  const netMethod = payload.methodSelections.netReportingMethod
  const netCO2 =
    netMethod === 'GROSS_MINUS_EMISSION_RIGHTS' ? round(grossScope1 - acquiredRights, 4) : null

  const ch4n2o = round(combustion.ch4N2oCO2eTonnes + mobile.ch4N2oCO2eTonnes, 4)

  const defaultsUsed = Array.from(ctx.defaultsUsed)
  const fallbacksApplied = Array.from(ctx.fallbacksApplied)
  const overall: CalculationResult['dataQuality']['overall'] =
    fallbacksApplied.length > 0 || defaultsUsed.length >= 3
      ? 'DEFAULTS_HEAVY'
      : defaultsUsed.length === 0
        ? 'PLANT_SPECIFIC'
        : 'MIXED'

  const result: CalculationResult = {
    calculationId,
    status: 'SUCCESS',
    sectorCode: 'CEMENT',
    methodologyPack: METHODOLOGY_PACK,
    reportingPeriod: payload.calculationContext.reportingPeriod,
    scope1: {
      grossScope1CO2Tonnes: grossScope1,
      components,
      excludedFromGrossScope1: {
        biomassCO2MemoTonnes: biomassMemo,
        purchasedElectricityCO2Tonnes: electricityCO2,
        boughtClinkerCO2Tonnes: boughtClinkerCO2,
        emissionRightsTonnes: acquiredRights,
      },
    },
    nonCsiCombustionGhg: {
      ch4N2oCO2eTonnes: ch4n2o,
      gwpSet: ctx.gwpSet,
      note: 'Combustion CH4 and N2O as CO2e. The CSI Cement Protocol is CO2-only; this line is kept separate from the CSI gross Scope 1 CO2 total and must not be merged into it.',
    },
    memoItems: { biomassCO2Tonnes: biomassMemo },
    supportingScope2: { purchasedElectricityCO2Tonnes: electricityCO2 },
    supportingScope3: { boughtClinkerCO2Tonnes: boughtClinkerCO2 },
    optionalNetReporting: {
      method: netMethod,
      acquiredEmissionRightsTonnes: acquiredRights,
      netCO2Tonnes: netCO2,
    },
    intensityMetrics: {
      grossCO2PerTonneClinker:
        isPresent(clinkerProduced) && clinkerProduced > 0
          ? round((grossScope1 * 1000) / clinkerProduced, 3)
          : null,
      grossCO2PerTonneCementitious:
        isPresent(cementitious) && cementitious > 0
          ? round((grossScope1 * 1000) / cementitious, 3)
          : null,
    },
    dataQuality: { defaultsUsed, fallbacksApplied, overall },
    warnings: ctx.warnings,
    errors: ctx.errors,
    calculationTrace: ctx.trace,
    factorSnapshots: ctx.resolver.list(),
    auditStatus: { workflowStatus: 'DRAFT', calculatedAt: new Date().toISOString() },
  }

  assertScopeSeparation(ctx, result)
  result.errors = ctx.errors
  result.warnings = ctx.warnings
  result.status = ctx.errors.length > 0 ? 'BLOCKED' : ctx.warnings.length > 0 ? 'SUCCESS_WITH_WARNINGS' : 'SUCCESS'

  return result
}

export { isMissing }
