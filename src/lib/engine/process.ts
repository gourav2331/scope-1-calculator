/**
 * Cement process emissions (CSI clinker-based method):
 *   - clinker calcination
 *   - bypass dust
 *   - cement kiln dust (CKD)
 *   - raw meal total organic carbon (TOC)
 *
 * Each sub-method has its own fallback so a missing input never aborts the
 * whole calculation; it degrades to the next-best method with a warning.
 */

import { resolveClinkerEf, type ClinkerEfResult } from './clinker'
import type { EngineContext } from './context'
import type { ActivityData, MethodSelections } from './types'
import { isMissing, isPresent, orDefault, round } from './util'

export interface ProcessResult {
  clinkerCalcinationCO2Tonnes: number
  bypassDustCO2Tonnes: number
  ckdCO2Tonnes: number
  rawMealTocCO2Tonnes: number
  clinkerEf: ClinkerEfResult
}

export function calculateProcess(
  ctx: EngineContext,
  methods: MethodSelections,
  activity: ActivityData,
): ProcessResult {
  const clinkerEf = resolveClinkerEf(ctx, methods.clinkerEmissionFactorMethod, activity.clinkerChemistry)
  const efCli = clinkerEf.efTco2PerTonne

  // --- Clinker calcination -------------------------------------------------
  const clinkerProduced = activity.production.clinkerProducedTonnes
  let clinkerCalcinationCO2 = 0
  if (isPresent(clinkerProduced)) {
    clinkerCalcinationCO2 = clinkerProduced * efCli
    ctx.addTrace({
      step: 'Clinker calcination CO2',
      category: 'PROCESS',
      method: clinkerEf.methodUsed,
      formula: 'clinkerProduced (t) x clinkerEF (tCO2/t)',
      inputs: { clinkerProducedTonnes: clinkerProduced, clinkerEfTco2PerTonne: round(efCli) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(clinkerCalcinationCO2, 4),
      fallbackApplied: clinkerEf.fallbackApplied
        ? `clinkerEF ${clinkerEf.requestedMethod} -> ${clinkerEf.methodUsed}`
        : undefined,
    })
  }
  // Missing clinker production is reported by the validation engine
  // (missing_clinker_production_for_csi_method); calcination stays 0 here.

  // --- Dust (CKD + bypass) -------------------------------------------------
  let ckdCO2 = 0
  let bypassDustCO2 = 0

  const applyTwoPercentFallback = (reason: string) => {
    const pct = ctx.resolver.constant('DUST_FALLBACK_PERCENT')
    const value = clinkerCalcinationCO2 * pct
    ctx.defaultsUsed.add('dust_2_percent_fallback_used')
    ctx.warn('dust_2_percent_fallback_used', `Dust CO2 estimated as ${pct * 100}% of calcination CO2 (${reason}).`)
    ctx.addTrace({
      step: 'Dust CO2 (IPCC 2% fallback)',
      category: 'PROCESS',
      method: 'IPCC_2_PERCENT_FALLBACK',
      formula: 'clinkerCalcinationCO2 x dustFallbackPercent',
      inputs: { clinkerCalcinationCO2Tonnes: round(clinkerCalcinationCO2, 4), dustFallbackPercent: pct },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(value, 4),
      fallbackApplied: reason,
    })
    return value
  }

  if (methods.dustMethod === 'NOT_APPLICABLE') {
    // Confirmed no dust leaves the kiln system. Nothing to add.
  } else if (methods.dustMethod === 'IPCC_2_PERCENT_FALLBACK') {
    ckdCO2 = applyTwoPercentFallback('IPCC 2% method selected')
  } else {
    // ACTUAL_DUST_DATA
    const ckdQty = activity.dust.ckdLeavingKilnTonnes
    const bypassQty = activity.dust.bypassDustLeavingKilnTonnes
    const hasCkd = isPresent(ckdQty)
    const hasBypass = isPresent(bypassQty)

    if (!hasCkd && !hasBypass) {
      ctx.fallbacksApplied.add('ACTUAL_DUST_DATA -> IPCC_2_PERCENT_FALLBACK')
      ckdCO2 = applyTwoPercentFallback('actual dust data unavailable')
    } else {
      if (hasCkd) {
        const rate = orDefault(
          activity.dust.ckdCalcinationRate,
          ctx.resolver.constant('CKD_CALCINATION_RATE_DEFAULT'),
        )
        if (isMissing(activity.dust.ckdCalcinationRate)) {
          ctx.defaultsUsed.add('default_ckd_calcination_rate_used')
          ctx.warn('default_ckd_calcination_rate_used', 'Default CKD calcination rate (1) used.')
        }
        if (rate < 0 || rate > 1) {
          ctx.error(
            'ckd_calcination_rate_outside_0_1',
            `CKD calcination rate ${rate} is outside the valid range [0, 1].`,
            'activityData.dust.ckdCalcinationRate',
          )
        }
        const safeRate = Math.min(Math.max(rate, 0), 1)
        const fraction = (efCli / (1 + efCli)) * safeRate
        const ckdEf = fraction / (1 - fraction)
        ckdCO2 = (ckdQty as number) * ckdEf
        ctx.addTrace({
          step: 'CKD CO2',
          category: 'PROCESS',
          method: 'ACTUAL_DUST_DATA',
          formula: 'fraction = (EFcli/(1+EFcli)) x rate ; ckdEF = fraction/(1-fraction) ; CKD CO2 = qty x ckdEF',
          inputs: {
            ckdLeavingKilnTonnes: ckdQty as number,
            ckdCalcinationRate: safeRate,
            clinkerEfTco2PerTonne: round(efCli),
            ckdEf: round(ckdEf),
          },
          factorSnapshots: ctx.resolver.list(),
          outputTonnesCO2: round(ckdCO2, 4),
        })
      }
      if (hasBypass) {
        const bypassRate = orDefault(activity.dust.bypassDustCalcinationRate, 1)
        bypassDustCO2 = (bypassQty as number) * efCli * Math.min(Math.max(bypassRate, 0), 1)
        ctx.addTrace({
          step: 'Bypass dust CO2',
          category: 'PROCESS',
          method: 'ACTUAL_DUST_DATA',
          formula: 'bypassDustLeavingKiln (t) x clinkerEF x bypassCalcinationRate',
          inputs: {
            bypassDustLeavingKilnTonnes: bypassQty as number,
            clinkerEfTco2PerTonne: round(efCli),
            bypassDustCalcinationRate: Math.min(Math.max(bypassRate, 0), 1),
          },
          factorSnapshots: ctx.resolver.list(),
          outputTonnesCO2: round(bypassDustCO2, 4),
        })
      }
    }
  }

  // --- Raw meal TOC --------------------------------------------------------
  let rawMealTocCO2 = 0
  if (methods.tocMethod !== 'NOT_APPLICABLE' && isPresent(clinkerProduced)) {
    const ratioDefault = ctx.resolver.constant('RAW_MEAL_TO_CLINKER_RATIO')
    const tocDefault = ctx.resolver.constant('TOC_FRACTION')
    const co2PerC = ctx.resolver.constant('CO2_PER_C')

    let ratio = ratioDefault
    let toc = tocDefault
    if (methods.tocMethod === 'PLANT_SPECIFIC_TOC') {
      if (isPresent(activity.rawMeal.rawMealToClinkerRatio)) {
        ratio = activity.rawMeal.rawMealToClinkerRatio
      } else {
        ctx.defaultsUsed.add('default_toc_used')
        ctx.warn('default_toc_used', 'Plant-specific TOC requested but raw meal/clinker ratio missing; default 1.55 used.')
      }
      if (isPresent(activity.rawMeal.tocFraction)) {
        toc = activity.rawMeal.tocFraction
        if (toc > 0.01) {
          ctx.warn(
            'high_toc_material_without_lab_data',
            `TOC fraction ${toc} is unusually high (>1%). Confirm with lab data.`,
            'activityData.rawMeal.tocFraction',
          )
        }
      } else {
        ctx.defaultsUsed.add('default_toc_used')
        ctx.warn('default_toc_used', 'Plant-specific TOC requested but TOC fraction missing; default 0.002 used.')
      }
    } else {
      ctx.defaultsUsed.add('default_toc_used')
    }

    rawMealTocCO2 = clinkerProduced * ratio * toc * co2PerC
    ctx.addTrace({
      step: 'Raw meal TOC CO2',
      category: 'PROCESS',
      method: methods.tocMethod,
      formula: 'clinkerProduced x rawMealToClinkerRatio x tocFraction x (44/12)',
      inputs: {
        clinkerProducedTonnes: clinkerProduced,
        rawMealToClinkerRatio: ratio,
        tocFraction: toc,
        co2PerC: round(co2PerC),
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(rawMealTocCO2, 4),
    })
  }

  return {
    clinkerCalcinationCO2Tonnes: clinkerCalcinationCO2,
    bypassDustCO2Tonnes: bypassDustCO2,
    ckdCO2Tonnes: ckdCO2,
    rawMealTocCO2Tonnes: rawMealTocCO2,
    clinkerEf,
  }
}

/**
 * US EPA cement-based fallback (used only when clinker data is unavailable but
 * cement production and a reliable clinker/cement ratio are known).
 */
export function calculateUsEpaFallback(
  ctx: EngineContext,
  activity: ActivityData,
): number {
  const f = activity.usEpaFallback
  if (isMissing(f.cementProducedTonnes) || isMissing(f.clinkerToCementRatio)) {
    ctx.error(
      'missing_cement_production_for_us_epa_fallback',
      'US EPA cement-based fallback requires both cement production and a clinker/cement ratio.',
      'activityData.usEpaFallback',
    )
    return 0
  }
  const clinkerEquivalent = f.cementProducedTonnes * f.clinkerToCementRatio
  const ef = orDefault(f.clinkerEfTco2PerTonne, ctx.resolver.constant('CSI_DEFAULT_CLINKER_EF'))
  const co2 = clinkerEquivalent * ef
  ctx.fallbacksApplied.add('CSI_CLINKER_BASED -> US_EPA_CEMENT_BASED_FALLBACK')
  ctx.warn(
    'default_clinker_ef_used',
    'US EPA cement-based fallback used (clinker production unavailable). Lower data quality.',
  )
  ctx.addTrace({
    step: 'Process CO2 (US EPA cement-based fallback)',
    category: 'PROCESS',
    method: 'US_EPA_CEMENT_BASED_FALLBACK',
    formula: 'cementProduced x clinkerToCementRatio x clinkerEF',
    inputs: {
      cementProducedTonnes: f.cementProducedTonnes,
      clinkerToCementRatio: f.clinkerToCementRatio,
      clinkerEfTco2PerTonne: round(ef),
    },
    factorSnapshots: ctx.resolver.list(),
    outputTonnesCO2: round(co2, 4),
    fallbackApplied: 'clinker data unavailable',
  })
  return co2
}
