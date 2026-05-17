/**
 * Structural validation run BEFORE calculation. Method-level numeric errors
 * (negative corrected CaO, missing LHV, CKD rate out of range, ...) are
 * raised by the calculation modules themselves; this file covers required
 * inputs, sector/boundary, the null-vs-zero rule and scope-separation
 * guardrails (spec section 11 + section 18).
 */

import type { EngineContext } from './context'
import type { CalculationResult, InputPayload } from './types'
import { isMissing, isPresent } from './util'

export function validateInput(ctx: EngineContext, payload: InputPayload): void {
  const { sector, calculationContext, facility, organizationBoundary, methodSelections, activityData, sourceApplicability } =
    payload

  if (!sector?.sectorCode) {
    ctx.error('missing_sector_code', 'Sector code is required before any calculation.')
  } else if (sector.sectorCode !== 'CEMENT') {
    ctx.error('unsupported_sector', `Sector "${sector.sectorCode}" is not yet supported. Only CEMENT is active.`)
  }

  const rp = calculationContext?.reportingPeriod
  if (!rp || !rp.year || !rp.startDate || !rp.endDate) {
    ctx.error('missing_reporting_period', 'A reporting period (year, start, end) is required.')
  }

  if (!facility?.name) {
    ctx.error('missing_facility', 'A facility must be selected.')
  }

  if (!organizationBoundary?.boundaryMethod) {
    ctx.error('missing_boundary_method', 'An organisational boundary method is required.')
  }

  // --- production values ---------------------------------------------------
  const clinker = activityData.production.clinkerProducedTonnes
  const cement = activityData.production.cementProducedTonnes
  if (isPresent(clinker) && clinker < 0) {
    ctx.error('negative_production_value', 'Clinker production cannot be negative.', 'activityData.production.clinkerProducedTonnes')
  }
  if (isPresent(cement) && cement < 0) {
    ctx.error('negative_production_value', 'Cement production cannot be negative.', 'activityData.production.cementProducedTonnes')
  }

  // --- process method requirements ----------------------------------------
  if (methodSelections.processEmissionMethod === 'CSI_CLINKER_BASED') {
    if (isMissing(clinker)) {
      ctx.error(
        'missing_clinker_production_for_csi_method',
        'CSI clinker-based method requires clinker production. Provide it, or switch to the US EPA cement-based fallback.',
        'activityData.production.clinkerProducedTonnes',
      )
    }
  } else if (methodSelections.processEmissionMethod === 'US_EPA_CEMENT_BASED_FALLBACK') {
    const f = activityData.usEpaFallback
    if (isMissing(f.cementProducedTonnes) || isMissing(f.clinkerToCementRatio)) {
      ctx.error(
        'missing_cement_production_for_us_epa_fallback',
        'US EPA fallback requires cement production and a clinker/cement ratio.',
        'activityData.usEpaFallback',
      )
    }
  }

  // --- source exclusion must carry a reason -------------------------------
  const flags: Array<[keyof typeof sourceApplicability, string]> = [
    ['clinkerCalcination', 'Clinker calcination'],
    ['bypassDust', 'Bypass dust'],
    ['ckd', 'CKD'],
    ['rawMealToc', 'Raw meal TOC'],
    ['kilnFuels', 'Kiln fuels'],
    ['nonKilnFuels', 'Non-kiln fuels'],
    ['mobile', 'Mobile combustion'],
    ['fugitive', 'Fugitive emissions'],
    ['purchasedElectricity', 'Purchased electricity'],
    ['boughtClinker', 'Bought clinker'],
  ]
  for (const [key, label] of flags) {
    if (sourceApplicability[key] === false) {
      const reason = sourceApplicability.exclusionReasons?.[key as string]
      if (!reason || !reason.trim()) {
        ctx.error(
          'source_exclusion_without_reason',
          `Source "${label}" is excluded but no exclusion reason was recorded.`,
          `sourceApplicability.exclusionReasons.${String(key)}`,
        )
      }
    }
  }

  // --- region sanity warning ----------------------------------------------
  if (payload.organization.country && payload.organization.country.toUpperCase() === 'IN') {
    const gridOverride = activityData.purchasedElectricity.gridEfTco2PerMwh
    if (isPresent(payload.activityData.purchasedElectricity.mwh) && isMissing(gridOverride)) {
      ctx.warn(
        'non_india_factor_used_for_india_facility',
        'India facility using a default grid factor. Confirm the latest CEA India grid EF for the reporting year.',
      )
    }
  }
}

/**
 * Post-calculation invariants. The engine architecture already keeps the
 * buckets separate; these assertions fail loudly if that ever regresses,
 * which is exactly what the spec's scope-separation tests require.
 */
export function assertScopeSeparation(ctx: EngineContext, result: CalculationResult): void {
  const gross = result.scope1.grossScope1CO2Tonnes
  const sumComponents = Object.values(result.scope1.components).reduce((a, b) => a + b, 0)
  if (Math.abs(gross - sumComponents) > 1e-6) {
    ctx.error(
      'gross_scope1_total_mismatch',
      `Gross Scope 1 (${gross}) does not equal the sum of its components (${sumComponents}).`,
    )
  }
  if (
    result.scope1.excludedFromGrossScope1.biomassCO2MemoTonnes !== result.memoItems.biomassCO2Tonnes
  ) {
    ctx.error(
      'biomass_co2_included_in_gross_scope1',
      'Biomass CO2 memo must match the excluded biomass bucket (biomass is never inside gross Scope 1).',
    )
  }
  if (
    result.scope1.excludedFromGrossScope1.purchasedElectricityCO2Tonnes !==
    result.supportingScope2.purchasedElectricityCO2Tonnes
  ) {
    ctx.error('purchased_electricity_included_in_scope1', 'Purchased electricity must stay in supporting Scope 2.')
  }
  if (
    result.scope1.excludedFromGrossScope1.boughtClinkerCO2Tonnes !==
    result.supportingScope3.boughtClinkerCO2Tonnes
  ) {
    ctx.error('bought_clinker_included_in_scope1', 'Bought clinker must stay in supporting Scope 3.')
  }
}
