/**
 * Clinker emission factor with the spec's tiered fallback chain:
 *
 *   PLANT_SPECIFIC_CAO_MGO  ->  CSI_DEFAULT_525  ->  IPCC_DEFAULT_510
 *
 * If the requested method cannot be evaluated (e.g. plant chemistry missing)
 * the engine automatically steps down the chain and records both a warning
 * and a `fallbackApplied` marker, so a calculation never silently fails — it
 * degrades transparently. This is the "multiple fallback options" requirement.
 */

import type { EngineContext } from './context'
import type { ActivityData, ClinkerEmissionFactorMethod } from './types'
import { isMissing, isPresent } from './util'

export interface ClinkerEfResult {
  efTco2PerTonne: number
  methodUsed: ClinkerEmissionFactorMethod
  requestedMethod: ClinkerEmissionFactorMethod
  fallbackApplied: boolean
}

function csiDefault(ctx: EngineContext): number {
  const ef = ctx.resolver.constant('CSI_DEFAULT_CLINKER_EF')
  ctx.defaultsUsed.add('default_clinker_ef_used')
  ctx.warn('default_clinker_ef_used', `CSI default clinker EF ${ef} tCO2/t used (no plant-specific chemistry).`)
  return ef
}

function ipccDefault(ctx: EngineContext): number {
  const ef = ctx.resolver.constant('IPCC_DEFAULT_CLINKER_EF')
  ctx.defaultsUsed.add('default_clinker_ef_used')
  ctx.warn('default_clinker_ef_used', `IPCC default clinker EF ${ef} tCO2/t used.`)
  return ef
}

export function resolveClinkerEf(
  ctx: EngineContext,
  requested: ClinkerEmissionFactorMethod,
  chem: ActivityData['clinkerChemistry'],
): ClinkerEfResult {
  if (requested === 'PLANT_SPECIFIC_CAO_MGO') {
    if (isMissing(chem.caoPercent)) {
      ctx.warn(
        'default_clinker_ef_used',
        'Plant-specific clinker EF requested but CaO % is missing. Falling back to CSI default 0.525.',
        'activityData.clinkerChemistry.caoPercent',
      )
      ctx.fallbacksApplied.add('plant_specific_clinker_ef -> CSI_DEFAULT_525')
      return {
        efTco2PerTonne: csiDefault(ctx),
        methodUsed: 'CSI_DEFAULT_525',
        requestedMethod: requested,
        fallbackApplied: true,
      }
    }

    const caoNonCarb = isPresent(chem.caoNonCarbonatePercent) ? chem.caoNonCarbonatePercent : 0
    if (isMissing(chem.caoNonCarbonatePercent)) {
      ctx.warn(
        'high_toc_material_without_lab_data',
        'Non-carbonate CaO % missing; assumed 0 (all CaO treated as carbonate-derived). This is conservative (over-estimates).',
        'activityData.clinkerChemistry.caoNonCarbonatePercent',
      )
    }
    const correctedCao = (chem.caoPercent - caoNonCarb) / 100
    if (correctedCao < 0) {
      ctx.error(
        'negative_corrected_cao',
        `Corrected CaO fraction is negative (${correctedCao.toFixed(4)}). Non-carbonate CaO cannot exceed total CaO.`,
        'activityData.clinkerChemistry',
      )
    }

    let correctedMgo = 0
    if (isPresent(chem.mgoPercent)) {
      const mgoNonCarb = isPresent(chem.mgoNonCarbonatePercent) ? chem.mgoNonCarbonatePercent : 0
      correctedMgo = (chem.mgoPercent - mgoNonCarb) / 100
      if (correctedMgo < 0) {
        ctx.error(
          'negative_corrected_mgo',
          `Corrected MgO fraction is negative (${correctedMgo.toFixed(4)}).`,
          'activityData.clinkerChemistry',
        )
      }
    } else {
      ctx.warn(
        'default_clinker_ef_used',
        'MgO % not provided; MgO contribution to clinker EF treated as 0.',
        'activityData.clinkerChemistry.mgoPercent',
      )
    }

    const co2PerCao = ctx.resolver.constant('CO2_PER_CAO')
    const co2PerMgo = ctx.resolver.constant('CO2_PER_MGO')
    const ef = Math.max(correctedCao, 0) * co2PerCao + Math.max(correctedMgo, 0) * co2PerMgo

    return {
      efTco2PerTonne: ef,
      methodUsed: 'PLANT_SPECIFIC_CAO_MGO',
      requestedMethod: requested,
      fallbackApplied: false,
    }
  }

  if (requested === 'IPCC_DEFAULT_510') {
    return {
      efTco2PerTonne: ipccDefault(ctx),
      methodUsed: 'IPCC_DEFAULT_510',
      requestedMethod: requested,
      fallbackApplied: false,
    }
  }

  // CSI_DEFAULT_525
  return {
    efTco2PerTonne: csiDefault(ctx),
    methodUsed: 'CSI_DEFAULT_525',
    requestedMethod: requested,
    fallbackApplied: false,
  }
}
