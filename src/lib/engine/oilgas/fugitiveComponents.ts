/**
 * Fugitive emissions via component counts (V1 §4.5 / §8.4). Unintentional leaks
 * from valves, flanges, connectors, pump seals, pressure-relief devices and
 * compressor seals. Three tiers:
 *   Tier 1  count × default leak factor (EPA Subpart W) × hours
 *   Tier 2  count × site/LDAR leak factor × hours (factor overridden)
 *   Tier 3  directly measured CH4 mass
 *
 * Component-count methods are known to under-count (heavy-tailed super-emitter
 * distribution); the top-down reconciliation workflow is deferred to a later
 * release, but a warning flags the Tier-1 limitation.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { COMPONENT_EF_DEFAULTS, DEFAULT_OPERATING_HOURS_YR } from './constants'
import { ch4ToCO2e, type OilGasGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FugitiveComponentEntry, GasAmounts } from './types'

export function calculateFugitiveComponents(
  ctx: EngineContext,
  entries: FugitiveComponentEntry[],
  gwp: OilGasGwp,
): GasAmounts {
  const total = emptyGas()
  let usedTier1 = false

  for (const entry of entries) {
    let ch4Kg: number

    if (entry.ldarMethod === 'TIER3_MEASURED') {
      if (isMissing(entry.measuredCh4Kg)) {
        ctx.error('missing_measured_ch4', `Fugitive "${entry.label}" is Tier 3 (measured) but no measured CH4 mass was provided.`, `fugitiveComponents.${entry.id}.measuredCh4Kg`)
        continue
      }
      if ((entry.measuredCh4Kg as number) < 0) {
        ctx.error('negative_input_value', `Fugitive "${entry.label}" measured CH4 cannot be negative.`, `fugitiveComponents.${entry.id}.measuredCh4Kg`)
        continue
      }
      ch4Kg = entry.measuredCh4Kg as number
    } else {
      if (isMissing(entry.count)) {
        ctx.error('missing_component_count', `Fugitive "${entry.label}" has no component count.`, `fugitiveComponents.${entry.id}.count`)
        continue
      }
      if ((entry.count as number) < 0) {
        ctx.error('negative_input_value', `Fugitive "${entry.label}" count cannot be negative.`, `fugitiveComponents.${entry.id}.count`)
        continue
      }
      const def = COMPONENT_EF_DEFAULTS[entry.componentCode]
      let ef = entry.efKgCh4PerHrOverride
      const overridden = isPresent(ef)
      if (isMissing(ef)) {
        if (!def) {
          ctx.error('unknown_component_class', `Fugitive "${entry.label}" uses unknown component "${entry.componentCode}" and no leak-factor override.`, `fugitiveComponents.${entry.id}.componentCode`)
          continue
        }
        ef = def.kgCh4PerHrPerSource
        if (entry.ldarMethod === 'TIER1_COUNT') usedTier1 = true
      }
      if ((ef as number) < 0) {
        ctx.error('negative_input_value', `Fugitive "${entry.label}" leak factor cannot be negative.`, `fugitiveComponents.${entry.id}.efKgCh4PerHrOverride`)
        continue
      }
      const hours = orDefault(entry.operatingHoursYr, DEFAULT_OPERATING_HOURS_YR)
      if (isMissing(entry.operatingHoursYr)) ctx.defaultsUsed.add('default_operating_hours_used')
      ch4Kg = (entry.count as number) * (ef as number) * hours

      ctx.resolver.record({
        factorCode: `FUGITIVE_EF_${entry.componentCode}_${entry.id}`,
        factorName: `${def?.name ?? entry.componentCode} leak factor`,
        value: ef as number,
        unit: 'kgCH4/hr/source',
        source: overridden ? 'Site/LDAR measurement' : def?.source ?? 'EPA Subpart W',
        sourceVersion: overridden ? 'site' : def?.sourceVersion ?? '40 CFR 98',
        factorYear: null,
        priorityRank: overridden ? 2 : 5,
        isDefault: !overridden,
        overridden,
        overrideReason: entry.overrideReason,
      })
    }

    const ch4T = ch4Kg / 1000
    const co2eT = ch4ToCO2e(ch4T, gwp)
    total.ch4Tonnes += ch4T
    total.co2eTonnes += co2eT

    ctx.addTrace({
      step: `Fugitive (component-count) - ${entry.label}`,
      category: 'FUGITIVE_COMPONENTS',
      method: entry.ldarMethod,
      formula: entry.ldarMethod === 'TIER3_MEASURED' ? 'measured CH4 mass' : 'count × leakFactor(kgCH4/hr) × hours',
      inputs: {
        componentCode: entry.componentCode,
        count: orDefault(entry.count, 0),
        ch4Tonnes: round(ch4T, 4),
      },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  if (usedTier1 && entries.length > 0) {
    ctx.warn(
      'tier1_fugitive_likely_underestimate',
      'Tier-1 component-count fugitives typically under-count real methane by 2-5× (heavy-tailed super-emitters). Reconcile with measurement (OGMP 2.0 L4/L5) where possible.',
    )
  }

  return total
}
