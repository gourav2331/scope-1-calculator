/**
 * Blast Furnace + BOF — the dominant Scope 1 source for integrated mills
 * (~70% of an integrated mill's CO2).
 *
 *   TIER1_INTEGRATED:  E_CO2 = crude_steel × 1.46 tCO2/t (combined IPCC 2006)
 *
 *   TIER2_CARBON_BALANCE (BF + BOF together):
 *     BF carbon balance:
 *       C_in_BF  = coke × C + PCI × C + NG × C + limestone × 12% + dolomite × 13%
 *       C_out_BF = hot metal × C_HM + BFG_exported × C/Nm3 + dust × C
 *       E_CO2_BF = (C_in_BF − C_out_BF) × 44/12
 *
 *     BOF carbon balance:
 *       C_in_BOF  = hot metal × C_HM + scrap × C_scrap + carbon additions
 *       C_out_BOF = crude steel × C_CS + slag × C_slag + BOFG_exported × C/Nm3
 *       E_CO2_BOF = (C_in_BOF − C_out_BOF) × 44/12
 *
 * Limestone/dolomite are added directly to the BF; their calcination CO2 is
 * included in the BF carbon balance (limestone C is 12% × 44/12 = 0.44).
 *
 * If the user supplies neither hotMetalProducedTonnes nor BFG-export data,
 * the balance approximates with `crudeSteelProducedTonnes × IPCC defaults`.
 */

import type { EngineContext } from '../context'
import { isMissing, isPresent, round } from '../util'
import { CARBONATE_CALCINATION_FACTORS, IRONSTEEL_FUEL_DEFAULTS, MATERIAL_CARBON_FRAC, PROCESS_GAS_CARBON, PROCESS_TIER1_EF } from './constants'
import { type IronSteelGwp } from './gwp'
import { emptyGas } from './helpers'
import type { BfBofEntry, GasAmounts } from './types'

const C_TO_CO2 = 44 / 12

export function calculateBfBof(
  ctx: EngineContext,
  entries: BfBofEntry[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _gwp: IronSteelGwp,
): GasAmounts {
  const total = emptyGas()
  if (entries.length === 0) return total

  for (const e of entries) {
    if (isMissing(e.crudeSteelProducedTonnes)) {
      ctx.error('missing_crude_steel', `BF/BOF "${e.label}" needs crudeSteelProducedTonnes.`)
      continue
    }
    if ((e.crudeSteelProducedTonnes as number) < 0) {
      ctx.error('negative_input_value', `BF/BOF "${e.label}" crudeSteelProducedTonnes cannot be negative.`)
      continue
    }
    const crudeSteel = e.crudeSteelProducedTonnes as number

    let co2T = 0
    let methodNote = ''

    if (e.method === 'TIER1_INTEGRATED') {
      const ef = isPresent(e.bofEf) ? (e.bofEf as number) : PROCESS_TIER1_EF.BOF_INTEGRATED
      if (ef < 0) {
        ctx.error('negative_input_value', `BF/BOF "${e.label}" bofEf cannot be negative.`)
        continue
      }
      co2T = crudeSteel * ef
      methodNote = `Tier 1 integrated ${ef} tCO2/t crude steel (IPCC 2006 BF+BOF combined)`
      if (isMissing(e.bofEf)) ctx.defaultsUsed.add('default_bof_integrated_tier1_ef')
    } else {
      // TIER2_CARBON_BALANCE

      // --- BF carbon inputs
      const coke = isPresent(e.cokeChargedTonnes) ? (e.cokeChargedTonnes as number) : 0
      const cokeC = isPresent(e.cokeCarbonFraction) ? (e.cokeCarbonFraction as number) : MATERIAL_CARBON_FRAC.coke_oven_coke
      const pci = isPresent(e.pciCoalTonnes) ? (e.pciCoalTonnes as number) : 0
      const pciC = isPresent(e.pciCarbonFraction) ? (e.pciCarbonFraction as number) : MATERIAL_CARBON_FRAC.coking_coal
      const ngGj = isPresent(e.naturalGasInjectedGj) ? (e.naturalGasInjectedGj as number) : 0
      const limestone = isPresent(e.limestoneChargedTonnes) ? (e.limestoneChargedTonnes as number) : 0
      const dolomite = isPresent(e.dolomiteChargedTonnes) ? (e.dolomiteChargedTonnes as number) : 0

      // --- BF carbon outputs
      const hm = isPresent(e.hotMetalProducedTonnes) ? (e.hotMetalProducedTonnes as number) : crudeSteel * 0.95 // typical 0.93–0.96 t HM / t CS
      const hmC = isPresent(e.hotMetalCarbonFraction) ? (e.hotMetalCarbonFraction as number) : MATERIAL_CARBON_FRAC.pig_iron_hot_metal
      const bfgExported = isPresent(e.bfgExportedNm3) ? (e.bfgExportedNm3 as number) : 0
      const bfgC = isPresent(e.bfgCarbonKgPerNm3) ? (e.bfgCarbonKgPerNm3 as number) : PROCESS_GAS_CARBON.BFG.co2EfKgPerNm3 / C_TO_CO2

      // --- BOF carbon inputs
      const scrap = isPresent(e.scrapChargedToBof) ? (e.scrapChargedToBof as number) : 0
      const scrapC = MATERIAL_CARBON_FRAC.steel_scrap

      // --- BOF carbon outputs
      const csC = MATERIAL_CARBON_FRAC.crude_steel
      const bofSlag = isPresent(e.bofSlagTonnes) ? (e.bofSlagTonnes as number) : 0
      const bofSlagC = isPresent(e.bofSlagCarbonFraction) ? (e.bofSlagCarbonFraction as number) : MATERIAL_CARBON_FRAC.bof_slag
      const bofgExported = isPresent(e.bofgExportedNm3) ? (e.bofgExportedNm3 as number) : 0
      const bofgC = PROCESS_GAS_CARBON.BOFG.co2EfKgPerNm3 / C_TO_CO2

      // Negative input sweep
      for (const [k, v] of [['cokeChargedTonnes', coke], ['pciCoalTonnes', pci], ['naturalGasInjectedGj', ngGj], ['limestoneChargedTonnes', limestone], ['dolomiteChargedTonnes', dolomite], ['hotMetalProducedTonnes', hm], ['bfgExportedNm3', bfgExported], ['scrapChargedToBof', scrap], ['bofSlagTonnes', bofSlag], ['bofgExportedNm3', bofgExported]] as Array<[string, number]>) {
        if (v < 0) ctx.error('negative_input_value', `BF/BOF "${e.label}" ${k} cannot be negative.`, `bfBof.${e.id}.${k}`)
      }

      // BF carbon: inputs include process gas (NG) carbon ≈ ngGj × 15.3/1000 tC (IPCC EF 15.3 tC/TJ → tC/GJ = 0.0153)
      const ngCarbonT = ngGj * 0.0153
      const cInBf = coke * cokeC + pci * pciC + ngCarbonT + limestone * 0.12 + dolomite * 0.132
      const cOutBf = hm * hmC + (bfgExported * bfgC) / 1000
      const cNetBf = Math.max(0, cInBf - cOutBf)
      const co2Bf = cNetBf * C_TO_CO2

      // BOF carbon: inputs HM + scrap; outputs CS + slag + BOFG
      const cInBof = hm * hmC + scrap * scrapC
      const cOutBof = crudeSteel * csC + bofSlag * bofSlagC + (bofgExported * bofgC) / 1000
      const cNetBof = Math.max(0, cInBof - cOutBof)
      const co2Bof = cNetBof * C_TO_CO2

      // Also fuel combustion in stoves / auxiliaries already counted via NG inputs.
      // For carbonate fluxes, we use the explicit calcination factor (0.440 / 0.477)
      // not the C × 44/12 path — those are pre-counted via limestone C 0.12 above.
      // But pure calcination CO2 from limestone IS already captured because C × 44/12 = 0.12 × 3.667 ≈ 0.440.

      void CARBONATE_CALCINATION_FACTORS // referenced for documentation; calcination is folded into the C-balance via the 12%/13.2% C fractions above
      void IRONSTEEL_FUEL_DEFAULTS

      co2T = co2Bf + co2Bof
      methodNote = 'Tier 2 BF carbon balance + BOF carbon balance'
    }

    total.co2Tonnes += co2T
    total.co2eTonnes += co2T

    ctx.addTrace({
      step: `BF/BOF - ${e.label}`,
      category: 'BF_BOF',
      method: methodNote,
      formula: e.method === 'TIER1_INTEGRATED'
        ? 'CO2 = crude_steel × 1.46 (IPCC integrated default)'
        : 'CO2 = [BF: (coke C + PCI C + NG C + limestone 12% + dolomite 13.2%) − (HM C + BFG C)] × 44/12 + [BOF: (HM C + scrap C) − (CS C + slag C + BOFG C)] × 44/12',
      inputs: { crudeSteelTonnes: crudeSteel, co2Tonnes: round(co2T, 4) },
      factorSnapshots: ctx.resolver.list(),
      outputTonnesCO2: round(co2T, 4),
    })
  }

  return total
}
