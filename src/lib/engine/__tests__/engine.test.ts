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

  it('mobile row LHV and CO2 EF overrides are used (not the fuel defaults)', () => {
    const p = basePayload()
    p.activityData.mobile = [
      {
        id: 'm1',
        label: 'Overridden truck',
        ownership: 'OWNED_CONTROLLED',
        fuelCode: 'diesel',
        quantity: 1_000,
        quantityUnit: 'L',
        lhvGjPerUnit: 0.04,
        co2EfKgPerGj: 70,
      },
    ]
    const r = calculate(p)
    // 1000 * 0.04 / 1000 = 0.04 TJ ; * 70 = 2.8 tCO2
    expect(r.scope1.components.mobileCombustionCO2Tonnes).toBeCloseTo(2.8, 4)
  })

  it('mobile row CH4 / N2O EF overrides flow into the non-CSI addendum', () => {
    const p = basePayload()
    p.activityData.mobile = [
      {
        id: 'm1',
        label: 'CH4/N2O override',
        ownership: 'OWNED_CONTROLLED',
        fuelCode: 'diesel',
        quantity: 1_000,
        quantityUnit: 'L',
        lhvGjPerUnit: 0.04,
        co2EfKgPerGj: 70,
        ch4EfKgPerGj: 0.01,
        n2oEfKgPerGj: 0.005,
      },
    ]
    const r = calculate(p)
    // energyGJ = 40 ; CH4 0.4 kg * 27 + N2O 0.2 kg * 273 = 10.8 + 54.6 kg CO2e = 0.0654 t
    expect(r.nonCsiCombustionGhg.ch4N2oCO2eTonnes).toBeCloseTo(0.0654, 4)
  })

  it('warns when the fugitive label mentions a different gas than selected', () => {
    const p = basePayload()
    p.activityData.fugitive = [
      { id: 'g1', label: 'HV SF6 switchgear', gasCode: 'r410a', leakedKg: 100 },
    ]
    const r = calculate(p)
    expect(codes(r.warnings)).toContain('gas_label_mismatch')
    // Result still computed using the SELECTED gas, not the label
    expect(r.scope1.components.fugitiveCO2eTonnes).toBe(225.6) // 100 * 2256 / 1000
  })

  it('blocks negative leaked quantity', () => {
    const p = basePayload()
    p.activityData.fugitive = [{ id: 'g1', label: 'x', gasCode: 'r32', leakedKg: -10 }]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks GWP override <= 0', () => {
    const p = basePayload()
    p.activityData.fugitive = [{ id: 'g1', label: 'x', gasCode: 'r32', leakedKg: 100, gwpOverride: 0 }]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('gwp_override_invalid')
  })

  it('does not warn when label and gas are consistent', () => {
    const p = basePayload()
    p.activityData.fugitive = [
      { id: 'g1', label: 'Plant chillers (R-410A)', gasCode: 'r410a', leakedKg: 100 },
    ]
    const r = calculate(p)
    expect(codes(r.warnings)).not.toContain('gas_label_mismatch')
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

describe('validation hardening (post-Codex)', () => {
  it('blocks negative fuel quantity', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Negative petcoke',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: -100,
        quantityUnit: 'tonne',
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('negative_input_value')
    expect(r.scope1.components.conventionalKilnFuelCO2Tonnes).toBe(0)
  })

  it('blocks carbon content fraction outside [0,1]', () => {
    const p = basePayload()
    p.methodSelections.fuelCombustionMethod = 'CARBON_CONTENT_BASED'
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'bad C',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        carbonContentFraction: 1.5,
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('input_out_of_range')
  })

  it('carbon-content method computes correctly', () => {
    const p = basePayload()
    p.methodSelections.fuelCombustionMethod = 'CARBON_CONTENT_BASED'
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'C frac',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        carbonContentFraction: 0.85,
        overrideReason: 'lab data',
      },
    ]
    const r = calculate(p)
    // 100 * 0.85 * 44/12 = 311.6667
    expect(r.scope1.components.conventionalKilnFuelCO2Tonnes).toBeCloseTo(311.6667, 3)
  })

  it('direct-measurement method computes correctly', () => {
    const p = basePayload()
    p.methodSelections.fuelCombustionMethod = 'DIRECT_MEASUREMENT'
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'CEMS',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        directCo2Tonnes: 12500,
        overrideReason: 'CEMS',
      },
    ]
    const r = calculate(p)
    expect(r.scope1.components.conventionalKilnFuelCO2Tonnes).toBe(12_500)
  })

  it('blocks unit mismatch with no LHV override (energy-based)', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'NG in tonne by mistake',
        fuelCode: 'natural_gas',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('unit_mismatch_no_lhv_override')
  })

  it('blocks fossil fuel marked as biomass', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke marked biomass',
        fuelCode: 'petcoke',
        category: 'BIOMASS',
        quantity: 100,
        quantityUnit: 'tonne',
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('fossil_fuel_marked_as_biomass')
    expect(r.memoItems.biomassCO2Tonnes).toBe(0)
  })

  it('warns on benign fuel category nudge (conventional fossil → alternative fossil)', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke (treated as alt fuel)',
        fuelCode: 'petcoke',
        category: 'ALTERNATIVE_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        overrideReason: 'mid-stream supplier reclassification',
      },
    ]
    const r = calculate(p)
    expect(codes(r.warnings)).toContain('fuel_category_mismatch')
    // still in Scope 1, just in the alternative-fossil bucket
    expect(r.scope1.components.alternativeFossilKilnFuelCO2Tonnes).toBeGreaterThan(0)
  })

  it('blocks zero CO2 EF override on a fossil fuel with no reason', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke zero EF',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        co2EfKgPerGj: 0,
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).toContain('zero_fossil_co2_ef_without_reason')
  })

  it('allows zero CO2 EF override when a reason is recorded', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Petcoke with CCS at fuel level',
        fuelCode: 'petcoke',
        category: 'CONVENTIONAL_FOSSIL',
        quantity: 100,
        quantityUnit: 'tonne',
        co2EfKgPerGj: 0,
        overrideReason: 'CCS removes 100% of fuel CO2 per audited contract',
      },
    ]
    const r = calculate(p)
    expect(codes(r.errors)).not.toContain('zero_fossil_co2_ef_without_reason')
  })

  it('blocks US EPA clinker/cement ratio > 1', () => {
    const p = basePayload()
    p.methodSelections.processEmissionMethod = 'US_EPA_CEMENT_BASED_FALLBACK'
    p.activityData.production.clinkerProducedTonnes = null
    p.activityData.usEpaFallback = {
      cementProducedTonnes: 1_000_000,
      clinkerToCementRatio: 1.5,
      clinkerEfTco2PerTonne: null,
    }
    const r = calculate(p)
    expect(codes(r.errors)).toContain('clinker_cement_ratio_out_of_range')
  })

  it('blocks negative US EPA clinker EF override', () => {
    const p = basePayload()
    p.methodSelections.processEmissionMethod = 'US_EPA_CEMENT_BASED_FALLBACK'
    p.activityData.production.clinkerProducedTonnes = null
    p.activityData.usEpaFallback = {
      cementProducedTonnes: 1_000_000,
      clinkerToCementRatio: 0.7,
      clinkerEfTco2PerTonne: -0.5,
    }
    const r = calculate(p)
    expect(codes(r.errors)).toContain('factor_override_invalid')
  })

  it('blocks negative cementitious product', () => {
    const p = basePayload()
    p.activityData.production.cementitiousProductTonnes = -10
    const r = calculate(p)
    expect(codes(r.errors)).toContain('negative_production_value')
  })

  it('warns when sold clinker exceeds bought clinker (net negative)', () => {
    const p = basePayload()
    p.methodSelections.boughtClinkerMethod = 'CSI_NET_CLINKER_PURCHASES'
    p.activityData.boughtClinker = {
      externalClinkerBoughtTonnes: 10_000,
      externalClinkerSoldTonnes: 30_000,
    }
    const r = calculate(p)
    expect(codes(r.warnings)).toContain('net_clinker_purchases_negative')
  })

  it('warns when a fugitive GWP override has no reason', () => {
    const p = basePayload()
    p.activityData.fugitive = [
      { id: 'g1', label: 'Custom blend', gasCode: 'r404a', leakedKg: 100, gwpOverride: 3500 },
    ]
    const r = calculate(p)
    expect(codes(r.warnings)).toContain('override_missing_reason')
  })

  it('equity share now reads consolidationPercent (preferred over legacy ownership)', () => {
    const p = basePayload()
    p.organizationBoundary.boundaryMethod = 'EQUITY_SHARE'
    p.organizationBoundary.consolidationPercent = 25
    p.organizationBoundary.ownershipSharePercent = 100
    const r = calculate(p)
    // 525000 * 0.25
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(131_250)
  })

  it('warns when biomass fraction is outside [0,1]', () => {
    const p = basePayload()
    p.activityData.kilnFuels = [
      {
        id: 'f1',
        label: 'Bad bio frac',
        fuelCode: 'tyres',
        category: 'MIXED',
        quantity: 100,
        quantityUnit: 'tonne',
        biomassFraction: 1.5,
        overrideReason: 'test',
      },
    ]
    const r = calculate(p)
    expect(codes(r.warnings)).toContain('biomass_fraction_outside_0_1')
  })

  it('blocks bypass calcination rate outside [0,1]', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.bypassDustLeavingKilnTonnes = 10_000
    p.activityData.dust.bypassDustCalcinationRate = 1.4
    const r = calculate(p)
    expect(codes(r.errors)).toContain('bypass_calcination_rate_outside_0_1')
  })

  it('blocks CaO out of [0,100] and MgO out of [0,100]', () => {
    const p = basePayload()
    p.methodSelections.clinkerEmissionFactorMethod = 'PLANT_SPECIFIC_CAO_MGO'
    p.activityData.clinkerChemistry = {
      caoPercent: 120,
      caoNonCarbonatePercent: null,
      mgoPercent: -2,
      mgoNonCarbonatePercent: null,
    }
    const r = calculate(p)
    expect(codes(r.errors)).toContain('cao_mgo_out_of_range')
  })

  it('blocks negative factor override and warns on missing reason', () => {
    const p = basePayload()
    p.factorOverrides = {
      CSI_DEFAULT_CLINKER_EF: { value: -0.1, reason: '' },
    }
    const r = calculate(p)
    expect(codes(r.errors)).toContain('factor_override_invalid')
    expect(codes(r.warnings)).toContain('override_missing_reason')
  })

  it('blocks negative purchased electricity / bought clinker / emission rights', () => {
    const p = basePayload()
    p.activityData.purchasedElectricity.mwh = -10
    p.activityData.boughtClinker.externalClinkerBoughtTonnes = -10
    p.activityData.emissionRights.acquiredTonnes = -1
    const r = calculate(p)
    expect(codes(r.errors).filter((c) => c === 'negative_input_value').length).toBeGreaterThanOrEqual(2)
  })
})

describe('equity-share consolidation and third-party mobile bucket', () => {
  it('scales every Scope 1 bucket by consolidation share when boundary is EQUITY_SHARE', () => {
    const p = basePayload()
    p.organizationBoundary.boundaryMethod = 'EQUITY_SHARE'
    p.organizationBoundary.consolidationPercent = 40
    // gross would be 525,000 at 100% (clinker only baseline)
    const r = calculate(p)
    expect(r.scope1.components.clinkerCalcinationCO2Tonnes).toBe(210_000) // 525000 * 0.4
    expect(r.scope1.grossScope1CO2Tonnes).toBe(210_000)
    expect(r.dataQuality.fallbacksApplied.join()).toContain('Equity share consolidation')
  })

  it('control method does not scale (100% reported regardless of share)', () => {
    const p = basePayload()
    p.organizationBoundary.boundaryMethod = 'OPERATIONAL_CONTROL'
    p.organizationBoundary.consolidationPercent = 40
    const r = calculate(p)
    expect(r.scope1.grossScope1CO2Tonnes).toBe(525_000)
  })

  it('intensity is invariant to equity share (plant-level metric)', () => {
    const p = basePayload()
    p.organizationBoundary.boundaryMethod = 'EQUITY_SHARE'
    p.organizationBoundary.consolidationPercent = 40
    const r = calculate(p)
    // gross=210000 t, clinker=1,000,000 t; intensity = 210000*1000 / (1000000*0.4) = 525
    expect(r.intensityMetrics.grossCO2PerTonneClinker).toBe(525)
  })

  it('third-party mobile is bucketed into supportingScope3', () => {
    const p = basePayload()
    p.activityData.mobile = [
      {
        id: 'm1',
        label: 'Contract haul',
        ownership: 'THIRD_PARTY',
        fuelCode: 'diesel',
        quantity: 1_000,
        quantityUnit: 'L',
        lhvGjPerUnit: 0.04,
        co2EfKgPerGj: 70,
        overrideReason: 'test',
      },
    ]
    const r = calculate(p)
    expect(r.scope1.components.mobileCombustionCO2Tonnes).toBe(0)
    expect(r.supportingScope3.thirdPartyMobileCO2Tonnes).toBeCloseTo(2.8, 4)
    expect(codes(r.warnings)).toContain('third_party_mobile_excluded')
  })

  it('excluded source does not appear in trace', () => {
    const p = basePayload()
    p.methodSelections.dustMethod = 'ACTUAL_DUST_DATA'
    p.activityData.dust.bypassDustLeavingKilnTonnes = 10_000
    p.sourceApplicability.bypassDust = false
    p.sourceApplicability.exclusionReasons = { bypassDust: 'No bypass at this plant' }
    const r = calculate(p)
    expect(r.scope1.components.bypassDustCO2Tonnes).toBe(0)
    expect(r.calculationTrace.find((t) => t.step === 'Bypass dust CO2')).toBeUndefined()
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
