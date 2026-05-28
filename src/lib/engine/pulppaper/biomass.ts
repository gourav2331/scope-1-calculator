/**
 * Biomass combustion — Section 7.2 of Research Brief.
 *
 * Wood/bark, black liquor, sulphite liquor, biogas, NCG. Carbon-cycle rule:
 *   - Biogenic CO2: MEMO line only — NEVER part of gross Scope 1.
 *   - CH4 and N2O from biomass DO count in gross Scope 1 (those gases are not
 *     part of the short atmospheric carbon cycle).
 *
 *   biogenic CO2 (memo) = energy_GJ × biogenicCo2Ef / 1000
 *   CH4_t = energy_GJ × ch4Ef_tech / 1000
 *   N2O_t = energy_GJ × n2oEf_tech / 1000
 *   CO2e  = ch4 × GWP_CH4_biogenic + n2o × GWP_N2O   (CO2 portion is NOT included)
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { PP_BIOMASS_TECH_DEFAULTS, PULPPAPER_BIOMASS_DEFAULTS, type PpTechFactor } from './constants'
import { ch4ToCO2e, n2oToCO2e, type PulpPaperGwp } from './gwp'
import { emptyGas } from './helpers'
import type { BiomassEntry, GasAmounts } from './types'

function biomassDefault(code: string) {
  return PULPPAPER_BIOMASS_DEFAULTS[code] ?? null
}
function biomassTech(code: string, tech?: string): PpTechFactor | null {
  const map = PP_BIOMASS_TECH_DEFAULTS[code]
  if (!map) return null
  if (tech && map[tech]) return map[tech]
  return Object.values(map)[0] ?? null
}

export function calculateBiomass(
  ctx: EngineContext,
  entries: BiomassEntry[],
  gwp: PulpPaperGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.quantity)) {
      ctx.error('missing_biomass_quantity', `Biomass "${e.label}" has no quantity.`, `biomassCombustion.${e.id}.quantity`)
      continue
    }
    if ((e.quantity as number) < 0) {
      ctx.error('negative_input_value', `Biomass "${e.label}" quantity cannot be negative.`, `biomassCombustion.${e.id}.quantity`)
      continue
    }
    const qty = e.quantity as number
    const bdef = biomassDefault(e.fuelCode)
    const ncv = isPresent(e.ncvGjPerUnit) ? (e.ncvGjPerUnit as number) : bdef?.ncvGjPerUnit ?? null
    if (isMissing(ncv)) {
      ctx.error('missing_ncv', `Biomass "${e.label}": no NCV for fuel ${e.fuelCode}.`)
      continue
    }
    const energyGj = qty * (ncv as number)

    // Biogenic CO2 (memo only)
    const biogenicEf = isPresent(e.biogenicCo2EfKgPerGj) ? (e.biogenicCo2EfKgPerGj as number) : bdef?.biogenicCo2EfKgPerGj ?? 0
    const biogenicCo2T = (energyGj * biogenicEf) / 1000

    // CH4 / N2O — Scope 1, technology-specific
    const tf = biomassTech(e.fuelCode, e.technology)
    const ch4Ef = isPresent(e.ch4EfKgPerGj) ? (e.ch4EfKgPerGj as number) : tf?.ch4EfKgPerGj ?? 0
    const n2oEf = isPresent(e.n2oEfKgPerGj) ? (e.n2oEfKgPerGj as number) : tf?.n2oEfKgPerGj ?? 0
    const ch4T = (energyGj * ch4Ef) / 1000
    const n2oT = (energyGj * n2oEf) / 1000

    // For biogenic CH4 we use the BIOGENIC GWP value (different from fossil under AR5+).
    const ch4eCO2e = ch4ToCO2e(ch4T, gwp, true)
    const n2oeCO2e = n2oToCO2e(n2oT, gwp)
    const co2eT = ch4eCO2e + n2oeCO2e // NOTE: biogenic CO2 NOT added

    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT
    total.biogenicCO2Tonnes += biogenicCo2T

    if (!tf && (isMissing(e.ch4EfKgPerGj) || isMissing(e.n2oEfKgPerGj))) {
      ctx.warn('biomass_default_factors_missing', `Biomass "${e.label}": no tech factors for ${e.fuelCode}/${e.technology ?? '(none)'}; assumed 0.`)
    }

    ctx.addTrace({
      step: `Biomass - ${e.label}`,
      category: 'BIOMASS_COMBUSTION',
      method: `${e.fuelCode} in ${e.technology ?? '(unspecified)'}`,
      formula: 'biogenic CO2 (memo) = E×EFco2/1000; CH4/N2O (Scope 1) = E×EFtech/1000',
      inputs: { quantity: qty, unit: e.quantityUnit, energyGj: round(energyGj, 3), biogenicCO2Tonnes: round(biogenicCo2T, 4), ch4Tonnes: round(ch4T, 6), n2oTonnes: round(n2oT, 6) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
