/**
 * Supporting indirect emissions. These are computed and reported but kept
 * strictly OUT of gross Scope 1 (spec guardrails):
 *   - purchased electricity  -> supporting Scope 2
 *   - bought (external) clinker -> supporting Scope 3
 *   - acquired emission rights -> optional net reporting only
 */

import type { EngineContext } from './context'
import type { ActivityData, MethodSelections } from './types'
import { isMissing, isPresent, orDefault, round } from './util'

export interface SupportingResult {
  purchasedElectricityCO2Tonnes: number
  boughtClinkerCO2Tonnes: number
  acquiredEmissionRightsTonnes: number
}

export function calculateSupporting(
  ctx: EngineContext,
  methods: MethodSelections,
  activity: ActivityData,
): SupportingResult {
  // --- Purchased electricity (Scope 2) ------------------------------------
  let electricityCO2 = 0
  const mwh = activity.purchasedElectricity.mwh
  if (isPresent(mwh)) {
    const ef = orDefault(
      activity.purchasedElectricity.gridEfTco2PerMwh,
      ctx.resolver.constant('INDIA_GRID_EF'),
    )
    if (isMissing(activity.purchasedElectricity.gridEfTco2PerMwh)) {
      ctx.defaultsUsed.add('old_electricity_factor_used')
      ctx.warn('old_electricity_factor_used', `Default grid EF ${ef} tCO2/MWh used for purchased electricity.`)
    }
    electricityCO2 = mwh * ef
    ctx.addTrace({
      step: 'Purchased electricity CO2 (Scope 2 - supporting, excluded from Scope 1)',
      category: 'SUPPORTING_SCOPE2',
      method: methods.electricityMethod,
      formula: 'electricityMWh x gridEF (tCO2/MWh)',
      inputs: { electricityMWh: mwh, gridEfTco2PerMwh: round(ef) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(electricityCO2, 4),
    })
  }

  // --- Bought clinker (Scope 3 / supporting) ------------------------------
  let boughtClinkerCO2 = 0
  if (methods.boughtClinkerMethod === 'CSI_NET_CLINKER_PURCHASES') {
    const bought = activity.boughtClinker.externalClinkerBoughtTonnes
    const sold = activity.boughtClinker.externalClinkerSoldTonnes
    if (isPresent(bought) || isPresent(sold)) {
      const net = orDefault(bought, 0) - orDefault(sold, 0)
      if (isMissing(bought) || isMissing(sold)) {
        ctx.warn(
          'internal_external_clinker_split_missing',
          'External clinker bought/sold partially missing; missing side treated as 0 for the net calculation.',
          'activityData.boughtClinker',
        )
      }
      if (net < 0) {
        ctx.warn(
          'net_clinker_purchases_negative',
          `Sold clinker (${orDefault(sold, 0)} t) exceeds bought clinker (${orDefault(bought, 0)} t). Net purchases are negative - report readers may flag this; confirm intentional or split into bought-only and sold-only lines.`,
          'activityData.boughtClinker',
        )
      }
      const ef = ctx.resolver.constant('BOUGHT_CLINKER_EF') // kgCO2/t
      boughtClinkerCO2 = (net * ef) / 1000
      ctx.addTrace({
        step: 'Bought clinker CO2 (Scope 3 - supporting, excluded from Scope 1)',
        category: 'SUPPORTING_SCOPE3',
        method: 'CSI_NET_CLINKER_PURCHASES',
        formula: '(externalClinkerBought - externalClinkerSold) x boughtClinkerEF / 1000',
        inputs: {
          netExternalClinkerTonnes: round(net, 4),
          boughtClinkerEfKgPerTonne: ef,
        },
        factorSnapshots: ctx.resolver.list(),
        outputTonnesCO2: round(boughtClinkerCO2, 4),
      })
    }
  }

  const acquiredEmissionRights = orDefault(activity.emissionRights.acquiredTonnes, 0)

  return {
    purchasedElectricityCO2Tonnes: electricityCO2,
    boughtClinkerCO2Tonnes: boughtClinkerCO2,
    acquiredEmissionRightsTonnes: acquiredEmissionRights,
  }
}
