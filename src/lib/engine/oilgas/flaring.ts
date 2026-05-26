/**
 * Flaring (V1 §4.3 / §8.2). Combustion of waste hydrocarbon gas at a flare tip
 * produces CO2 (the bulk) plus residual CH4 from incomplete combustion. The
 * destruction & removal efficiency (DRE) is the most important input the
 * operator usually does not measure: default 98% (lit, in spec), but lower for
 * unassisted/smoking flares and 0% for an unlit flare (which is really venting).
 *
 *   Combustion CO2 = Σ(molfrac_i × nC_i over hydrocarbons) × molPerSm3 × volume
 *                    × DRE × M_CO2
 *   Inert CO2 in the feed gas passes through uncombusted (not subject to DRE).
 *   Methane slip  = molfrac_CH4 × volume × (1 − DRE) × ρ_CH4
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { FLARE_DRE_BY_TYPE } from './constants'
import { ch4ToCO2e, type OilGasGwp } from './gwp'
import { emptyGas } from './helpers'
import type { FlareEntry, GasAmounts } from './types'

/** Carbon atoms per molecule for each hydrocarbon component. */
const CARBON_NUMBER = { ch4: 1, c2h6: 2, c3h8: 3, c4plus: 4 } as const

function frac(percent: number | null | undefined): number {
  return isPresent(percent) ? (percent as number) / 100 : 0
}

function resolveDre(ctx: EngineContext, entry: FlareEntry): number {
  if (entry.operatingStatus === 'unlit' || entry.flareType === 'unlit') {
    ctx.warn(
      'unlit_flare_counted_as_venting',
      `Flare "${entry.label}" is unlit; all gas is counted as venting (0% destruction), not combustion.`,
      `flaring.${entry.id}.operatingStatus`,
    )
    return 0
  }
  let dre: number
  if ((entry.dreBasis === 'MEASURED' || entry.dreBasis === 'ENGINEERING_ESTIMATE') && isPresent(entry.dreValue)) {
    dre = entry.dreValue as number
  } else {
    dre = FLARE_DRE_BY_TYPE[entry.flareType] ?? ctx.resolver.constant('FLARE_DRE_DEFAULT')
    if (isMissing(entry.dreValue)) ctx.defaultsUsed.add('default_flare_dre_used')
  }
  if (dre > 1 || dre < 0) {
    ctx.error('flare_dre_out_of_range', `Flare "${entry.label}" DRE ${dre} must be in [0, 1].`, `flaring.${entry.id}.dreValue`)
    return Math.min(Math.max(dre, 0), 1)
  }
  if (dre === 1) {
    ctx.warn('flare_dre_100_percent', `Flare "${entry.label}" DRE is 100% — methane slip is ignored. Confirm this is intended.`, `flaring.${entry.id}.dreValue`)
  } else if (dre < 0.6) {
    ctx.warn('flare_dre_below_default_range', `Flare "${entry.label}" DRE ${dre} is below the 60% floor; provide sensor evidence or justification.`, `flaring.${entry.id}.dreValue`)
  }
  return dre
}

export function calculateFlaring(ctx: EngineContext, entries: FlareEntry[], gwp: OilGasGwp): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total // don't record flare constants when unused
  const molPerSm3 = ctx.resolver.constant('MOL_PER_SM3')
  const mCO2 = ctx.resolver.constant('MOL_CO2_MASS')
  const ch4Density = ctx.resolver.constant('CH4_DENSITY_SM3')
  const co2Density = ctx.resolver.constant('CO2_DENSITY_SM3')

  for (const entry of entries) {
    if (isMissing(entry.flareVolumeSm3)) {
      ctx.error('missing_flare_volume', `Flare "${entry.label}" has no flared volume.`, `flaring.${entry.id}.flareVolumeSm3`)
      continue
    }
    if ((entry.flareVolumeSm3 as number) < 0) {
      ctx.error('negative_input_value', `Flare "${entry.label}" volume cannot be negative.`, `flaring.${entry.id}.flareVolumeSm3`)
      continue
    }
    const volume = entry.flareVolumeSm3 as number
    const c = entry.composition
    const ch4 = frac(c.ch4Percent)
    const co2In = frac(c.co2Percent)
    const dre = resolveDre(ctx, entry)

    // Hydrocarbon carbon moles per Sm3 (CO2 is inert and handled separately).
    const hcCarbonPerSm3 =
      ch4 * CARBON_NUMBER.ch4 +
      frac(c.c2h6Percent) * CARBON_NUMBER.c2h6 +
      frac(c.c3h8Percent) * CARBON_NUMBER.c3h8 +
      frac(c.c4PlusPercent) * CARBON_NUMBER.c4plus

    const combustedCarbonMol = hcCarbonPerSm3 * molPerSm3 * volume * dre
    const combustionCO2T = (combustedCarbonMol * mCO2) / 1e6 // g -> t
    const inertCO2T = (co2In * volume * co2Density) / 1000 // kg -> t
    const ch4SlipT = (ch4 * volume * (1 - dre) * ch4Density) / 1000 // kg -> t

    const co2T = combustionCO2T + inertCO2T
    const ch4eCO2e = ch4ToCO2e(ch4SlipT, gwp)
    const co2eT = co2T + ch4eCO2e

    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4SlipT
    total.co2eTonnes += co2eT

    ctx.resolver.record({
      factorCode: `FLARE_DRE_${entry.id}`,
      factorName: `Flare DRE (${entry.flareType})`,
      value: dre,
      unit: 'fraction',
      source: isPresent(entry.dreValue) && entry.dreBasis !== 'DEFAULT' ? `Site ${entry.dreBasis}` : 'IPIECA/API default by flare type',
      sourceVersion: entry.dreBasis === 'DEFAULT' ? '2021/2023' : 'site',
      factorYear: null,
      priorityRank: entry.dreBasis === 'DEFAULT' ? 4 : 2,
      isDefault: entry.dreBasis === 'DEFAULT',
      overridden: entry.dreBasis !== 'DEFAULT' && isPresent(entry.dreValue),
      overrideReason: entry.overrideReason,
    })
    const inputs: Record<string, number | string | null> = {
      flareVolumeSm3: volume,
      ch4Percent: orDefault(c.ch4Percent, 0),
      co2Percent: orDefault(c.co2Percent, 0),
      dre,
      combustionCO2Tonnes: round(combustionCO2T, 4),
      inertCO2Tonnes: round(inertCO2T, 4),
      ch4SlipTonnes: round(ch4SlipT, 4),
    }
    if (entry.evidenceReference) inputs.evidenceReference = entry.evidenceReference
    ctx.addTrace({
      step: `Flaring - ${entry.label}`,
      category: 'FLARING',
      method: `${entry.volumeBasis} volume, DRE ${entry.dreBasis}`,
      formula: 'CO2 = Σ(molfrac×nC)·molPerSm3·V·DRE·M_CO2 + inertCO2 ; CH4 slip = CH4·V·(1−DRE)·ρ_CH4',
      inputs,
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
