/**
 * Process emissions (V1 §4.6 / §8.5). CO2 from chemical reactions that are not
 * combustion. MVP covers the dominant O&G process units:
 *   SMR_HYDROGEN    grey-H2 benchmark (tCO2/tH2) OR stoichiometric feed+fuel
 *   FCC_REGEN       coke carbon burned off the catalyst → CO2
 *   AMINE_ACID_GAS  CO2 separated from sour gas and vented
 *   GENERIC_EF      throughput × EF
 *   DIRECT_CO2      directly metered process CO2
 *
 * CCS permanence accounting (capture/transport/storage/reversal) is deferred;
 * a capture fraction on the amine unit only reduces the vented quantity for the
 * period, with a warning.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, orDefault, round } from '../util'
import { ch4ToCO2e, n2oToCO2e, type OilGasGwp } from './gwp'
import { emptyGas } from './helpers'
import type { GasAmounts, ProcessEntry } from './types'

function smrCO2(ctx: EngineContext, e: ProcessEntry): number | null {
  // Benchmark method: hydrogen produced × tCO2/tH2.
  if (isPresent(e.hydrogenProducedTonnes)) {
    if ((e.hydrogenProducedTonnes as number) < 0) {
      ctx.error('negative_input_value', `Process "${e.label}" hydrogen produced cannot be negative.`, `process.${e.id}.hydrogenProducedTonnes`)
      return null
    }
    const ef = isPresent(e.smrEfTco2PerTonneH2)
      ? (e.smrEfTco2PerTonneH2 as number)
      : ctx.resolver.constant('SMR_GREY_H2_EF')
    if (isMissing(e.smrEfTco2PerTonneH2)) ctx.defaultsUsed.add('default_smr_ef_used')
    return (e.hydrogenProducedTonnes as number) * ef
  }
  // Stoichiometric method: process feedstock CH4 → CO2, plus fuel combustion.
  if (isPresent(e.feedstockGasSm3)) {
    const molPerSm3 = ctx.resolver.constant('MOL_PER_SM3')
    const mCO2 = ctx.resolver.constant('MOL_CO2_MASS')
    const ch4Frac = orDefault(e.feedstockCh4Fraction, 1)
    const processCO2 = ((e.feedstockGasSm3 as number) * ch4Frac * molPerSm3 * mCO2) / 1e6
    let fuelCO2 = 0
    if (isPresent(e.fuelGasSm3) && isPresent(e.fuelGasLhvGjPerSm3) && isPresent(e.fuelGasCo2EfKgPerGj)) {
      fuelCO2 = ((e.fuelGasSm3 as number) * (e.fuelGasLhvGjPerSm3 as number) * (e.fuelGasCo2EfKgPerGj as number)) / 1000
    }
    return processCO2 + fuelCO2
  }
  ctx.error('missing_smr_inputs', `Process "${e.label}" (SMR) needs either hydrogen produced or a feedstock gas volume.`, `process.${e.id}`)
  return null
}

export function calculateProcess(ctx: EngineContext, entries: ProcessEntry[], gwp: OilGasGwp): GasAmounts {
  const total = emptyGas()

  for (const e of entries) {
    let co2T: number | null = null
    let method = e.processType as string

    switch (e.processType) {
      case 'SMR_HYDROGEN':
        co2T = smrCO2(ctx, e)
        method = isPresent(e.hydrogenProducedTonnes) ? 'SMR benchmark (tCO2/tH2)' : 'SMR stoichiometric (feed + fuel)'
        break
      case 'FCC_REGEN': {
        if (isMissing(e.cokeBurnedTonnes)) {
          ctx.error('missing_fcc_inputs', `Process "${e.label}" (FCC) needs coke burned (tonnes).`, `process.${e.id}.cokeBurnedTonnes`)
          break
        }
        if ((e.cokeBurnedTonnes as number) < 0) {
          ctx.error('negative_input_value', `Process "${e.label}" coke burned cannot be negative.`, `process.${e.id}.cokeBurnedTonnes`)
          break
        }
        const carbonFrac = isPresent(e.cokeCarbonFraction)
          ? (e.cokeCarbonFraction as number)
          : ctx.resolver.constant('FCC_COKE_CARBON_FRACTION')
        if (isMissing(e.cokeCarbonFraction)) ctx.defaultsUsed.add('default_fcc_carbon_fraction_used')
        const co2PerC = ctx.resolver.constant('CO2_PER_C')
        co2T = (e.cokeBurnedTonnes as number) * carbonFrac * co2PerC
        break
      }
      case 'AMINE_ACID_GAS': {
        if (isMissing(e.acidGasVolumeSm3) || isMissing(e.acidGasCo2Fraction)) {
          ctx.error('missing_amine_inputs', `Process "${e.label}" (amine acid gas) needs acid-gas volume and CO2 fraction.`, `process.${e.id}`)
          break
        }
        const co2Density = ctx.resolver.constant('CO2_DENSITY_SM3')
        let capture = orDefault(e.co2CaptureFraction, 0)
        if (capture < 0 || capture > 1) {
          ctx.warn('co2_capture_outside_0_1', `Process "${e.label}" CO2 capture fraction ${capture} outside [0, 1]; clamped.`, `process.${e.id}.co2CaptureFraction`)
          capture = Math.min(Math.max(capture, 0), 1)
        }
        if (capture > 0) {
          ctx.warn('ccs_permanence_not_modelled', `Process "${e.label}" applies ${(capture * 100).toFixed(0)}% capture; CCS storage permanence/reversal is not modelled (deferred). Captured CO2 is assumed stored for the period.`, `process.${e.id}.co2CaptureFraction`)
        }
        co2T = ((e.acidGasVolumeSm3 as number) * (e.acidGasCo2Fraction as number) * co2Density * (1 - capture)) / 1000
        break
      }
      case 'GENERIC_EF': {
        if (isMissing(e.throughput) || isMissing(e.efTco2PerUnit)) {
          ctx.error('missing_generic_process_inputs', `Process "${e.label}" (generic) needs throughput and an EF (tCO2/unit).`, `process.${e.id}`)
          break
        }
        co2T = (e.throughput as number) * (e.efTco2PerUnit as number)
        break
      }
      case 'DIRECT_CO2': {
        if (isMissing(e.directCo2Tonnes)) {
          ctx.error('missing_direct_co2', `Process "${e.label}" (direct) needs metered CO2 (tonnes).`, `process.${e.id}.directCo2Tonnes`)
          break
        }
        co2T = e.directCo2Tonnes as number
        break
      }
    }

    if (co2T === null) continue
    if (co2T < 0) {
      ctx.error('negative_process_co2', `Process "${e.label}" produced negative CO2 (${round(co2T, 2)}). Check inputs.`, `process.${e.id}`)
      continue
    }

    const ch4T = orDefault(e.ch4Tonnes, 0)
    const n2oT = orDefault(e.n2oTonnes, 0)
    const co2eT = co2T + ch4ToCO2e(ch4T, gwp) + n2oToCO2e(n2oT, gwp)

    total.co2Tonnes += co2T
    total.ch4Tonnes += ch4T
    total.n2oTonnes += n2oT
    total.co2eTonnes += co2eT

    const inputs: Record<string, number | string | null> = { processType: e.processType, co2Tonnes: round(co2T, 4) }
    if (ch4T > 0) inputs.ch4Tonnes = round(ch4T, 4)
    if (n2oT > 0) inputs.n2oTonnes = round(n2oT, 4)
    if (e.evidenceReference) inputs.evidenceReference = e.evidenceReference
    ctx.addTrace({
      step: `Process - ${e.label}`,
      category: 'PROCESS',
      method,
      formula: 'process-specific CO2 (+ optional CH4/N2O) → CO2e',
      inputs,
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2eT, 4),
    })
  }

  return total
}
