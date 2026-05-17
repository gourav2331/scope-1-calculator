import { describe, expect, it } from 'vitest'

import { calculate } from '../calculate'
import type { FuelEntry } from '../types'
import { basePayload } from './fixture'

const codes = (msgs: { code: string }[]) => msgs.map((m) => m.code)

describe('clinker calcination', () => {
  it('clinker_default_525_calculates_correctly', () => {
    const r = calculate(basePayload())
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(525_000)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
    expect(r.errors).toHaveLength(0)
  })

  it('plant_specific_cao_mgo_calculates_correctly', () => {
    const p = basePayload()
    p.methodSelections.clinkerEmissionFactorMethod = 'PLANT_SPECIFIC_CAO_MGO'
    p.activityData.clinkerChemistry = {
      caoPercent: 65,
      caoNonCarbonatePercent: 1.5,
      mgoPercent: 1.5,
      mgoNonCarbonatePercent: 0.5,
    }
    // EF = (0.635 * 0.785) + (0.01 * 1.092) = 0.509395
    const r = calculate(p)
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBeCloseTo(509_395, 0)
    expect(r.errors).toHaveLength(0)
  })

  it('ipcc_default_510_calculates_correctly', () => {
    const p = basePayload()
    p.methodSelections.clinkerEmissionFactorMethod = 'IPCC_DEFAULT_510'
    const r = calculate(p)
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(510_000)
  })

  it('falls back plant-specific -> CSI default when CaO missing', () => {
    const p = basePayload()
    p.methodSelections.clinkerEmissionFactorMethod = 'PLANT_SPECIFIC_CAO_MGO'
    const r = calculate(p)
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(525_000)
    expect(r.dataQuality.fallbacksApplied.join()).toContain('CSI_DEFAULT_525')
  })

  it('negative_corrected_cao_blocks', () => {
    const p = basePayload()
    p.methodSelections.clinkerEmissionFactorMethod = 'PLANT_SPECIFIC_CAO_MGO'
    p.activityData.clinkerChemistry.caoPercent = 60
    p.activityData.clinkerChemistry.caoNonCarbonatePercent = 65
    const r = calculate(p)
    expect(codes(r.errors)).toContain('negative_corrected_cao')
    expect(r.status).toBe('BLOCKED')
  })
})

describe('dust', () => {
  it('bypass_dust_calculates_correctly', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.bypassDustLeavingKilnTonnes = 10_000
    const r = calculate(p)
    // 10000 * 0.525 * 1
    expect(r.scope1.components.bypassDustCO2Tonnes).toBe(5_250)
  })

  it('ckd_calculates_correctly (rate = 1 => ckdEF == clinkerEF)', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.ckdLeavingKilnTonnes = 20_000
    p.activityData.dust.ckdCalcinationRate = 1
    const r = calculate(p)
    expect(r.scope1.components.ckdCO2Tonnes).toBeCloseTo(10_500, 0)
  })

  it('ckd at rate 0.8 matches the CSI formula', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.ckdLeavingKilnTonnes = 20_000
    p.activityData.dust.ckdCalcinationRate = 0.8
    const efCli = 0.525
    const fraction = (efCli / (1 + efCli)) * 0.8
    const ckdEf = fraction / (1 - fraction)
    const r = calculate(p)
    expect(r.scope1.components.ckdCO2Tonnes).toBeCloseTo(20_000 * ckdEf, 2)
  })

  it('ckd_rate_outside_0_1_blocks', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.ckdLeavingKilnTonnes = 20_000
    p.activityData.dust.ckdCalcinationRate = 1.5
    const r = calculate(p)
    expect(codes(r.errors)).toContain('ckd_calcination_rate_outside_0_1')
  })

  it('dust_2_percent_fallback_used', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'IPCC_2_PERCENT_FALLBACK'
    const r = calculate(p)
    // 525000 * 0.02
    expect(r.scope1.components.ckdCO2Tonnes).toBe(10_500)
    expect(r.dataQuality.defaultsUsed).toContain('dust_2_percent_fallback_used')
  })

  it('ACTUAL_DUST_DATA with no data falls back to 2%', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    const r = calculate(p)
    expect(r.scope1.components.ckdCO2Tonnes).toBe(10_500)
    expect(r.dataQuality.fallbacksApplied.join()).toContain('IPCC_2_PERCENT_FALLBACK')
  })
})

describe('raw meal TOC', () => {
  it('raw_meal_toc_calculates_correctly (CSI defaults)', () => {
    const p = basePayload()
    p.methodSelections.tocMethod = 'CSI_DEFAULT_TOC'
    // 1e6 * 1.55 * 0.002 * (44/12) = 11366.6667
    const r = calculate(p)
    expect(r.scope1.components.rawMealTocCO2Tonnes).toBeCloseTo(11_366.6667, 2)
  })

  it('plant-specific TOC uses provided ratio and fraction', () => {
    const p = basePayload()
    p.methodSelections.tocMethod = 'PLANT_SPECIFIC_TOC'
    p.activityData.rawMeal = { rawMealToClinkerRatio: 1.6, tocFraction: 0.003 }
    // 1e6 * 1.6 * 0.003 * 3.66667 = 17600
    const r = calculate(p)
    expect(r.scope1.components.rawMealTocCO2Tonnes).toBeCloseTo(17_600, 0)
  })
})

describe('combustion', () => {
  const fuel = (over: Partial<FuelEntry>): FuelEntry => ({
    id: 'f1',
    label: 'Test fuel',
    fuelCode: 'petcoke',
    category: 'CONVENTIONAL_FOSSIL',
    quantity: 100_000,
    quantityUnit: 'tonne',
    ...over,
  })

  it('petcoke_fuel_calculates_correctly', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [fuel({ fuelCode: 'petcoke', quantity: 100_000 })]
    // energyTJ = 100000 * 32.5 / 1000 = 3250 ; CO2 = 3250 * 97.5 = 316875
    const r = calculate(p)
    expect(r.scope1.components.conventionalKilnFuelCO2Tonnes).toBeCloseTo(316_875, 0)
    expect(r.scope1.grossScope1CO2Tonnes).toBeCloseTo(525_000 + 316_875, 0)
  })

  it('alternative_fossil_included_in_scope1', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      fuel({ fuelCode: 'waste_plastics', category: 'ALTERNATIVE_FOSSIL', quantity: 10_000 }),
    ]
    // energyTJ = 10000*30/1000 = 300 ; CO2 = 300*75 = 22500
    const r = calculate(p)
    expect(r.scope1.components.alternativeFossilKilnFuelCO2Tonnes).toBeCloseTo(22_500, 0)
    expect(r.scope1.grossScope1CO2Tonnes).toBeCloseTo(525_000 + 22_500, 0)
  })

  it('biomass_co2_excluded_from_gross_scope1', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      fuel({ fuelCode: 'solid_biomass', category: 'BIOMASS', quantity: 50_000 }),
    ]
    // energyTJ = 50000*11.6/1000 = 580 ; CO2 = 580*112 = 64960 (all biomass)
    const r = calculate(p)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
    expect(r.memoItems.biomassCO2Tonnes).toBeCloseTo(64_960, 0)
    expect(r.scope1.excludedFromGrossScope1.biomassCO2MemoTonnes).toBe(
      r.memoItems.biomassCO2Tonnes,
    )
    expect(codes(r.errors)).not.toContain('biomass_co2_included_in_gross_scope1')
  })

  it('mixed_fuel_split_calculates_scope1_and_memo', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [fuel({ fuelCode: 'tyres', category: 'MIXED', quantity: 10_000 })]
    // energyTJ = 10000*28/1000 = 280 ; total = 280*85 = 23800 ; biomass 27%
    const r = calculate(p)
    expect(r.scope1.components.alternativeFossilKilnFuelCO2Tonnes).toBeCloseTo(23_800 * 0.73, 0)
    expect(r.memoItems.biomassCO2Tonnes).toBeCloseTo(23_800 * 0.27, 0)
    expect(codes(r.warnings)).toContain('alternative_fuel_split_unknown')
  })

  it('missing_lhv_blocks_energy_method (unknown fuel, no default)', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      fuel({ fuelCode: 'mystery_fuel', quantity: 100, lhvGjPerUnit: null, co2EfKgPerGj: 90 }),
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('missing_lhv_for_energy_based_fuel')
  })
})

describe('supporting scopes and net reporting', () => {
  it('purchased_electricity_excluded_from_scope1', () => {
    const p = basePayload()
    p.activityData.purchasedElectricity = { mwh: 10_000, gridEfTco2PerMwh: null }
    const r = calculate(p)
    expect(r.supportingScope2.purchasedElectricityCO2Tonnes).toBe(7_100) // 10000 * 0.71
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
    expect(r.scope1.excludedFromGrossScope1.purchasedElectricityCO2Tonnes).toBe(7_100)
  })

  it('bought_clinker_excluded_from_scope1', () => {
    const p = basePayload()
    p.methodSelections.boughtClinkerMethod = 'CSI_NET_CLINKER_PURCHASES'
    p.activityData.boughtClinker = {
      externalClinkerBoughtTonnes: 50_000,
      externalClinkerSoldTonnes: 10_000,
    }
    const r = calculate(p)
    // net 40000 * 862 / 1000 = 34480
    expect(r.supportingScope3.boughtClinkerCO2Tonnes).toBe(34_480)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
  })

  it('net_co2_does_not_replace_gross', () => {
    const p = basePayload()
    p.methodSelections.netReportingMethod = 'GROSS_MINUS_EMISSION_RIGHTS'
    p.activityData.emissionRights.acquiredTonnes = 1_000
    const r = calculate(p)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
    expect(r.optionalNetReporting.netCO2Tonnes).toBe(524_000)
  })

  it('gross_scope1_total_correct (components sum to gross)', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.ckdLeavingKilnTonnes = 20_000
    p.activityData.dust.ckdCalcinationRate = 1
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100_000,
        quantityUnit: 'tonne',
      },
    ]
    const r = calculate(p)
    const sum = Object.values(r.scope1.components).reduce((a, b) => a + b, 0)
    expect(r.scope1.grossScope1CO2Tonnes).toBeCloseTo(sum, 3)
    expect(codes(r.errors)).not.toContain('gross_scope1_total_mismatch')
  })
})

describe('validation and null vs zero', () => {
  it('missing_clinker_production_blocks_csi_method', () => {
    const p = basePayload()
    p.activityData.production.clinkerProducedTonnes = null
    const r = calculate(p)
    expect(codes(r.errors)).toContain('missing_clinker_production_for_csi_method')
    expect(r.status).toBe('BLOCKED')
  })

  it('confirmed zero clinker (0) is NOT blocked', () => {
    const p = basePayload()
    p.activityData.production.clinkerProducedTonnes = 0
    const r = calculate(p)
    expect(codes(r.errors)).not.toContain('missing_clinker_production_for_csi_method')
    expect(r.scope1.grossScope1CO2Tonnes).toBe(0)
  })

  it('us_epa_fallback_requires_all_ratios', () => {
    const p = basePayload()
    p.methodSelections.processEmissionMethod = 'US_EPA_CEMENT_BASED_FALLBACK'
    p.activityData.production.clinkerProducedTonnes = null
    const r = calculate(p)
    expect(codes(r.errors)).toContain('missing_cement_production_for_us_epa_fallback')
  })

  it('auto CSI -> US EPA fallback when clinker missing but EPA inputs present', () => {
    const p = basePayload()
    p.activityData.production.clinkerProducedTonnes = null
    p.activityData.usEpaFallback = {
      cementProducedTonnes: 900_000,
      clinkerToCementRatio: 0.95,
      clinkerEfTco2PerTonne: null,
    }
    const r = calculate(p)
    // 900000 * 0.95 * 0.525 = 448875
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBeCloseTo(448_875, 0)
    expect(codes(r.errors)).not.toContain('missing_clinker_production_for_csi_method')
    expect(r.dataQuality.fallbacksApplied.join()).toContain('US_EPA_CEMENT_BASED_FALLBACK')
  })

  it('source_exclusion_without_reason_blocks', () => {
    const p = basePayload()
    p.sourceApplicability.kilnFuels = false
    const r = calculate(p)
    expect(codes(r.errors)).toContain('source_exclusion_without_reason')
  })

  it('excluded source with a reason does not block', () => {
    const p = basePayload()
    p.sourceApplicability.kilnFuels = false
    p.sourceApplicability.exclusionReasons = { kilnFuels: 'No kiln at this grinding unit' }
    const r = calculate(p)
    expect(codes(r.errors)).not.toContain('source_exclusion_without_reason')
  })

  it('missing_sector_code blocks', () => {
    const p = basePayload()
    // @ts-expect-error intentional invalid
    p.sector = {}
    const r = calculate(p)
    expect(codes(r.errors)).toContain('missing_sector_code')
  })
})

describe('fugitive emissions (4th Scope 1 category)', () => {
  it('refrigerant leak is computed as CO2e and included in gross Scope 1 (AR6)', () => {
    const p = basePayload()
    p.activityData.fugitive = [
      { id: 'g1', label: 'Plant chillers', gasCode: 'r410a', leakedKg: 1_000 },
    ]
    const r = calculate(p)
    // 1000 kg * 2256 (R-410A AR6) / 1000 = 2256 tCO2e
    expect(r.scope1.components.fugitiveCO2eTonnes).toBe(2_256)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000 + 2_256)
  })

  it('uses AR5 GWP when the GWP set is AR5', () => {
    const p = basePayload()
    p.calculationContext.gwpSet = 'AR5'
    p.activityData.fugitive = [{ id: 'g1', label: 'Chiller', gasCode: 'r410a', leakedKg: 1_000 }]
    const r = calculate(p)
    expect(r.scope1.components.fugitiveCO2eTonnes).toBe(1_924)
  })

  it('SF6 switchgear and per-entry GWP override', () => {
    const p = basePayload()
    p.activityData.fugitive = [
      { id: 'g1', label: 'HV switchgear', gasCode: 'sf6', leakedKg: 500 },
      { id: 'g2', label: 'Blend X', gasCode: 'r404a', leakedKg: 100, gwpOverride: 2_000 },
    ]
    const r = calculate(p)
    // 500*24300/1000 + 100*2000/1000 = 12150 + 200
    expect(r.scope1.components.fugitiveCO2eTonnes).toBeCloseTo(12_350, 4)
  })

  it('missing leaked quantity blocks', () => {
    const p = basePayload()
    p.activityData.fugitive = [{ id: 'g1', label: 'Chiller', gasCode: 'r32', leakedKg: null }]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('missing_fuel_quantity')
  })

  it('excluded fugitive with a reason does not block and contributes 0', () => {
    const p = basePayload()
    p.sourceApplicability.fugitive = false
    p.sourceApplicability.exclusionReasons = { fugitive: 'No refrigerant equipment on site' }
    p.activityData.fugitive = [{ id: 'g1', label: 'x', gasCode: 'r32', leakedKg: 100 }]
    const r = calculate(p)
    expect(r.scope1.components.fugitiveCO2eTonnes).toBe(0)
    expect(codes(r.errors)).not.toContain('source_exclusion_without_reason')
  })
})

describe('factor overrides and audit trail', () => {
  it('user override replaces the seed clinker EF and is snapshotted', () => {
    const p = basePayload()
    p.factorOverrides = {
      CSI_DEFAULT_CLINKER_EF: { value: 0.5, reason: 'Plant-specific verified data 2026' },
    }
    const r = calculate(p)
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(500_000)
    const snap = r.factorSnapshots.find((s) => s.factorCode === 'CSI_DEFAULT_CLINKER_EF')
    expect(snap?.overridden).toBe(true)
    expect(snap?.value).toBe(0.5)
    expect(snap?.overrideReason).toContain('Plant-specific')
  })

  it('factor_snapshot_preserved and calculation_trace_preserved', () => {
    const r = calculate(basePayload())
    expect(r.factorSnapshots.length).toBeGreaterThan(0)
    expect(r.factorSnapshots.some((s) => s.factorCode === 'CSI_DEFAULT_CLINKER_EF')).toBe(true)
    expect(r.calculationTrace.length).toBeGreaterThan(0)
    expect(r.calculationTrace.some((t) => t.step.startsWith('Clinker calcination'))).toBe(true)
  })

  it('non-CSI CH4/N2O addendum stays separate from gross CO2', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100_000,
        quantityUnit: 'tonne',
      },
    ]
    const r = calculate(p)
    expect(r.nonCsiCombustionGhg.ch4N2oCO2eTonnes).toBeGreaterThan(0)
    // gross is CO2 only: clinker + petcoke fossil CO2, no CH4/N2O folded in
    expect(r.scope1.grossScope1CO2Tonnes).toBeCloseTo(525_000 + 316_875, 0)
  })
})
