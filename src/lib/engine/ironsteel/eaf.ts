/**
 * Electric Arc Furnace (EAF) — scrap or DRI feedstock.
 *
 *   TIER1_ELECTRODES_ONLY: E_CO2 = crude_steel × 0.08 tCO2/t (IPCC 2006)
 *
 *   TIER2_FULL_BALANCE:
 *     E_CO2 = [electrode × 0.99 + charge_C × C_frac + DRI × C_DRI + scrap × C_scrap
 *              − crude_steel × C_CS] × 44/12
 *           + limestone × 0.440 + dolomite × 0.477
 *           + NG × 56.1 / 1000   (oxy-fuel burners)
 *
 * Charge carbon = anthracite, coke breeze, plastics added for foamy slag.
 * Lime / dolomitic lime calcination CO2 is process-side, separate from EAF
 * electrode oxidation.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { CARBONATE_CALCINATION_FACTORS, IRONSTEEL_FUEL_DEFAULTS, MATERIAL_CARBON_FRAC, PROCESS_TIER1_EF } from './constants'
import { type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { EafEntry, GasAmounts } from './types'

const C_TO_CO2 = 44 / 12

export function calculateEaf(
  ctx: EngineContext,
  entries: EafEntry[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.crudeSteelProducedTonnes)) {
      ctx.error('missing_crude_steel', `EAF "${e.label}" needs crudeSteelProducedTonnes.`)
      continue
    }
    if ((e.crudeSteelProducedTonnes as number) < 0) {
      ctx.error('negative_input_value', `EAF "${e.label}" crudeSteelProducedTonnes cannot be negative.`)
      continue
    }
    const cs = e.crudeSteelProducedTonnes as number

    let co2T = 0
    let methodNote = ''

    if (e.method === 'TIER1_ELECTRODES_ONLY') {
      const ef = isPresent(e.ef) ? (e.ef as number) : PROCESS_TIER1_EF.EAF_ELECTRODES
      if (ef < 0) {
        ctx.error('negative_input_value', `EAF "${e.label}" EF cannot be negative.`)
        continue
      }
      co2T = cs * ef
      methodNote = `Tier 1 electrodes-only ${ef} tCO2/t crude steel (IPCC 2006)`
      if (isMissing(e.ef)) ctx.defaultsUsed.add('default_eaf_electrodes_tier1_ef')
    } else {
      // TIER2_FULL_BALANCE
      const electrode = isPresent(e.electrodeConsumedTonnes) ? (e.electrodeConsumedTonnes as number) : 0
      const electrodeC = isPresent(e.electrodeCarbonFraction) ? (e.electrodeCarbonFraction as number) : MATERIAL_CARBON_FRAC.graphite_electrodes
      const chargeC = isPresent(e.chargeCarbonTonnes) ? (e.chargeCarbonTonnes as number) : 0
      const chargeCFrac = isPresent(e.chargeCarbonFraction) ? (e.chargeCarbonFraction as number) : MATERIAL_CARBON_FRAC.anthracite_charge_c
      const dri = isPresent(e.driChargedTonnes) ? (e.driChargedTonnes as number) : 0
      const driCFrac = isPresent(e.driCarbonFraction) ? (e.driCarbonFraction as number) : MATERIAL_CARBON_FRAC.dri_gas
      const scrap = isPresent(e.scrapChargedTonnes) ? (e.scrapChargedTonnes as number) : 0
      const scrapCFrac = isPresent(e.scrapCarbonFraction) ? (e.scrapCarbonFraction as number) : MATERIAL_CARBON_FRAC.steel_scrap
      const lime = isPresent(e.limeChargedTonnes) ? (e.limeChargedTonnes as number) : 0
      const dolomite = isPresent(e.dolomiteChargedTonnes) ? (e.dolomiteChargedTonnes as number) : 0
      const oxyFuelGj = isPresent(e.oxyFuelNaturalGasGj) ? (e.oxyFuelNaturalGasGj as number) : 0

      for (const [k, v] of [
        ['electrodeConsumedTonnes', electrode], ['chargeCarbonTonnes', chargeC],
        ['driChargedTonnes', dri], ['scrapChargedTonnes', scrap],
        ['limeChargedTonnes', lime], ['dolomiteChargedTonnes', dolomite],
        ['oxyFuelNaturalGasGj', oxyFuelGj],
      ] as Array<[string, number]>) {
        if (v < 0) ctx.error('negative_input_value', `EAF "${e.label}" ${k} cannot be negative.`, `eaf.${e.id}.${k}`)
      }
      if ([electrodeC, chargeCFrac, driCFrac, scrapCFrac].some((v) => v < 0 || v > 1)) {
        ctx.error('negative_input_value', `EAF "${e.label}" carbon fractions must be in [0,1].`)
        continue
      }

      // Carbon balance: in − out (crude steel C retained)
      const cIn = electrode * electrodeC + chargeC * chargeCFrac + dri * driCFrac + scrap * scrapCFrac
      const cOut = cs * MATERIAL_CARBON_FRAC.crude_steel
      const cNet = Math.max(0, cIn - cOut)
      const balanceCo2 = cNet * C_TO_CO2

      // Calcination of fluxes (lime is already calcined, but dolomitic lime
      // may still have residual carbonate; the user should enter CaCO3 not
      // CaO. We charge fully here.)
      const calcCo2 = lime * CARBONATE_CALCINATION_FACTORS.CACO3 + dolomite * CARBONATE_CALCINATION_FACTORS.DOLOMITE

      // Oxy-fuel burner NG combustion
      const ngEf = IRONSTEEL_FUEL_DEFAULTS.natural_gas?.co2EfKgPerGj ?? 56.1
      const ngCo2 = (oxyFuelGj * ngEf) / 1000

      co2T = balanceCo2 + calcCo2 + ngCo2
      methodNote = 'Tier 2 carbon balance + flux calcination + oxy-fuel NG combustion'
    }

    total.co2Tonnes += co2T
    total.co2eTonnes += co2T

    ctx.addTrace({
      step: `EAF - ${e.label}`,
      category: 'EAF',
      method: methodNote,
      formula: e.method === 'TIER1_ELECTRODES_ONLY'
        ? 'CO2 = crude_steel × 0.08 (electrodes only)'
        : 'CO2 = [(electrode 0.99 + charge C + DRI C + scrap C) − CS C] × 44/12 + lime × 0.440 + dolomite × 0.477 + NG × EFng / 1000',
      inputs: { crudeSteelTonnes: cs, co2Tonnes: round(co2T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }

  return total
}
