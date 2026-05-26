import { describe, expect, it } from 'vitest'

import { calculateOilGas } from '../calculate'
import type {
  FlareEntry,
  FugitiveComponentEntry,
  ProcessEntry,
  RefrigerantEntry,
  VentEntry,
} from '../types'
import { baseOilGasPayload } from './fixture'
import type { FuelEntry, MobileEntry } from '../../types'

const codes = (msgs: { code: string }[]) => msgs.map((m) => m.code)

describe('baseline', () => {
  it('empty payload calculates to zero with no errors', () => {
    const r = calculateOilGas(baseOilGasPayload())
    expect(r.errors).toHaveLength(0)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(0)
    expect(r.status).toBe('SUCCESS')
    expect(r.sectorCode).toBe('OIL_GAS')
    expect(r.methodologyPack).toBe('IPIECA_API_OG_2023')
  })

  it('rejects a non oil-and-gas sector code', () => {
    const p = baseOilGasPayload()
    // @ts-expect-error testing a wrong sector code at runtime
    p.sector.sectorCode = 'CEMENT'
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('unsupported_sector')
  })
})

describe('stationary combustion (V1 §8.1 — CDU charge heater)', () => {
  it('reproduces the worked example CO2', () => {
    const p = baseOilGasPayload()
    p.facility = { name: 'Refinery', segment: 'DOWNSTREAM', facilityType: 'REFINERY' }
    // 5,200 Sm3/hr × 8,400 hr = 43,680,000 Sm3/yr; NCV 0.0395 GJ/Sm3; EF 56.4 tCO2/TJ.
    // CH4/N2O negligible per the example (set to 0).
    const fuel: FuelEntry = {
      id: 'cdu',
      label: 'CDU charge heater',
      fuelCode: 'refinery_fuel_gas',
      category: 'CONVENTIONAL_FOSSIL',
      quantity: 43_680_000,
      quantityUnit: 'Sm3',
      lhvGjPerUnit: 0.0395,
      co2EfKgPerGj: 56.4,
      ch4EfKgPerGj: 0,
      n2oEfKgPerGj: 0,
    }
    p.activityData.stationaryCombustion = [fuel]
    const r = calculateOilGas(p)
    // energyTJ = 43,680,000 × 0.0395 / 1000 = 1725.36 ; CO2 = 1725.36 × 56.4 = 97,310.3
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBeCloseTo(97_310.3, 1)
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(97_310.3, 1)
    expect(r.errors).toHaveLength(0)
  })
})

describe('flaring (V1 §8.2 — associated gas flare)', () => {
  const flare = (over: Partial<FlareEntry> = {}): FlareEntry => ({
    id: 'fl1',
    label: 'Well-pad flare',
    flareType: 'steam_assisted_lit',
    operatingStatus: 'lit',
    flareVolumeSm3: 5_110_000,
    volumeBasis: 'METERED',
    composition: { ch4Percent: 78, co2Percent: 3, c2h6Percent: 12, c3h8Percent: 5, n2Percent: 2 },
    dreBasis: 'DEFAULT',
    ...over,
  })

  it('computes combustion CO2, inert CO2 passthrough and methane slip', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [flare()]
    const r = calculateOilGas(p)
    const fl = r.scope1.byCategory.flaring
    // CH4 slip = 0.78 × 5,110,000 × 0.02 × 0.657 / 1000 = 52.373 t
    expect(fl.ch4Tonnes).toBeCloseTo(52.373, 2)
    // CO2 = combustion (≈10,887.1) + inert (≈282.4) = 11,169.4 t
    expect(fl.co2Tonnes).toBeCloseTo(11_169.4, 0)
    // CO2e = 11,169.4 + 52.373 × 29.8 = 12,730.2 t
    expect(fl.co2eTonnes).toBeCloseTo(12_730.2, 0)
    expect(r.errors).toHaveLength(0)
  })

  it('unlit flare is counted as venting (DRE 0, all methane released)', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [flare({ operatingStatus: 'unlit' })]
    const r = calculateOilGas(p)
    // Full CH4 released = 0.78 × 5,110,000 × 0.657 / 1000 = 2,618.6 t
    expect(r.scope1.byCategory.flaring.ch4Tonnes).toBeCloseTo(2_618.66, 1)
    expect(codes(r.warnings)).toContain('unlit_flare_counted_as_venting')
  })

  it('warns when DRE is overridden below 60%', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [flare({ dreBasis: 'MEASURED', dreValue: 0.5 })]
    const r = calculateOilGas(p)
    expect(codes(r.warnings)).toContain('flare_dre_below_default_range')
  })
})

describe('venting (V1 §8.3 — high-bleed pneumatic controllers)', () => {
  const vent = (over: Partial<VentEntry> = {}): VentEntry => ({
    id: 'v1',
    label: 'Pneumatic controller fleet',
    eventType: 'DESIGNED',
    ventVolumeSm3: 6_825_500, // 850 controllers × 22 Sm3/day × 365
    composition: { ch4Percent: 95, co2Percent: 0, c2h6Percent: 3, c3h8Percent: 1, n2Percent: 1 },
    ...over,
  })

  it('reproduces the worked example CO2e (AR6 100-yr)', () => {
    const p = baseOilGasPayload()
    p.activityData.venting = [vent()]
    const r = calculateOilGas(p)
    // CH4 = 6,825,500 × 0.95 × 0.657 / 1000 = 4,260.1 t ; × 29.8 = 126,952 t
    expect(r.scope1.byCategory.venting.ch4Tonnes).toBeCloseTo(4_260.13, 1)
    expect(r.scope1.byCategory.venting.co2eTonnes).toBeCloseTo(126_952, 0)
    expect(r.errors).toHaveLength(0)
  })

  it('20-year horizon raises methane weight (82.5)', () => {
    const p = baseOilGasPayload()
    p.calculationContext.gwpSet = 'AR6_20'
    p.activityData.venting = [vent()]
    const r = calculateOilGas(p)
    // 4,260.13 × 82.5 = 351,461 t
    expect(r.scope1.byCategory.venting.co2eTonnes).toBeCloseTo(351_461, 0)
  })

  it('VRU capture reduces the released quantity', () => {
    const p = baseOilGasPayload()
    p.activityData.venting = [vent({ captureFraction: 0.95 })]
    const r = calculateOilGas(p)
    // Residual 5% → 4,260.13 × 0.05 = 213.0 t CH4
    expect(r.scope1.byCategory.venting.ch4Tonnes).toBeCloseTo(213.0, 0)
  })
})

describe('fugitive component-count (V1 §8.4 — gas processing facility)', () => {
  const comp = (componentCode: string, count: number): FugitiveComponentEntry => ({
    id: componentCode,
    label: componentCode,
    componentCode,
    count,
    ldarMethod: 'TIER1_COUNT',
  })

  it('reproduces the Subpart W component-count total', () => {
    const p = baseOilGasPayload()
    p.activityData.fugitiveComponents = [
      comp('valve_gas', 4200),
      comp('valve_light_liquid', 980),
      comp('flange_connector', 12_400),
      comp('pressure_relief_valve', 320),
      comp('compressor_seal', 28),
    ]
    const r = calculateOilGas(p)
    // total CH4 = 872.46 t ; × 29.8 = 25,999.3 t
    expect(r.scope1.byCategory.fugitiveComponents.ch4Tonnes).toBeCloseTo(872.46, 1)
    expect(r.scope1.byCategory.fugitiveComponents.co2eTonnes).toBeCloseTo(25_999.3, 0)
    expect(codes(r.warnings)).toContain('tier1_fugitive_likely_underestimate')
  })

  it('Tier 3 measured CH4 overrides the count method', () => {
    const p = baseOilGasPayload()
    p.activityData.fugitiveComponents = [
      { id: 'm1', label: 'Measured site total', componentCode: 'valve_gas', count: null, ldarMethod: 'TIER3_MEASURED', measuredCh4Kg: 100_000 },
    ]
    const r = calculateOilGas(p)
    expect(r.scope1.byCategory.fugitiveComponents.ch4Tonnes).toBeCloseTo(100, 4)
  })
})

describe('process emissions (V1 §8.5)', () => {
  it('SMR grey-H2 benchmark uses the default tCO2/tH2 factor', () => {
    const p = baseOilGasPayload()
    p.facility = { name: 'Refinery', segment: 'DOWNSTREAM', facilityType: 'REFINERY' }
    const smr: ProcessEntry = { id: 'smr', label: '100 t/day SMR', processType: 'SMR_HYDROGEN', hydrogenProducedTonnes: 36_500 }
    p.activityData.process = [smr]
    const r = calculateOilGas(p)
    // 36,500 × 7.69 = 280,685 t (doc benchmark ≈ 280,600)
    expect(r.scope1.byCategory.process.co2Tonnes).toBeCloseTo(280_685, 0)
  })

  it('SMR stoichiometric route: feedstock CH4 → CO2', () => {
    const p = baseOilGasPayload()
    const smr: ProcessEntry = {
      id: 'smr2',
      label: 'SMR stoichiometric',
      processType: 'SMR_HYDROGEN',
      feedstockGasSm3: 1_000_000,
      feedstockCh4Fraction: 1,
    }
    p.activityData.process = [smr]
    const r = calculateOilGas(p)
    // 1,000,000 × 42.2208 mol/Sm3 × 44.01 g/mol / 1e6 = 1,858.1 t
    expect(r.scope1.byCategory.process.co2Tonnes).toBeCloseTo(1_858.1, 1)
  })

  it('FCC coke regeneration → CO2 (44/12)', () => {
    const p = baseOilGasPayload()
    const fcc: ProcessEntry = { id: 'fcc', label: 'FCC regen', processType: 'FCC_REGEN', cokeBurnedTonnes: 100_000 }
    p.activityData.process = [fcc]
    const r = calculateOilGas(p)
    // 100,000 × 0.94 × 44/12 = 344,667 t
    expect(r.scope1.byCategory.process.co2Tonnes).toBeCloseTo(344_666.7, 0)
  })

  it('amine acid-gas vent with partial capture warns on CCS permanence', () => {
    const p = baseOilGasPayload()
    const amine: ProcessEntry = {
      id: 'amine',
      label: 'Amine acid gas',
      processType: 'AMINE_ACID_GAS',
      acidGasVolumeSm3: 1_000_000,
      acidGasCo2Fraction: 0.9,
      co2CaptureFraction: 0.9,
    }
    p.activityData.process = [amine]
    const r = calculateOilGas(p)
    // 1,000,000 × 0.9 × 1.842 × (1 − 0.9) / 1000 = 165.78 t vented
    expect(r.scope1.byCategory.process.co2Tonnes).toBeCloseTo(165.78, 1)
    expect(codes(r.warnings)).toContain('ccs_permanence_not_modelled')
  })
})

describe('refrigerants (V1 §8.6 — LNG plant loops)', () => {
  it('Tier 1: capacity × leak rate × GWP', () => {
    const p = baseOilGasPayload()
    p.facility = { name: 'LNG', segment: 'MIDSTREAM', facilityType: 'LNG' }
    const mr: RefrigerantEntry = {
      id: 'mr',
      label: 'Mixed-refrigerant loop',
      gasCode: 'r134a',
      tier: 'TIER1_CAPACITY',
      chargeCapacityKg: 12_000,
      leakRatePercentYr: 6,
      gwpOverride: 1800,
      overrideReason: 'Proprietary MR blend effective GWP',
    }
    p.activityData.refrigerants = [mr]
    const r = calculateOilGas(p)
    // 12,000 × 0.06 × 1800 / 1000 = 1,296 t
    expect(r.scope1.byCategory.refrigerants.co2eTonnes).toBeCloseTo(1_296, 1)
  })

  it('Tier 2: mass balance (purchases − disposals − Δinventory)', () => {
    const p = baseOilGasPayload()
    const mr: RefrigerantEntry = {
      id: 'mr2',
      label: 'MR loop mass balance',
      gasCode: 'r134a',
      tier: 'TIER2_MASS_BALANCE',
      purchasesKg: 1200,
      disposalsKg: 0,
      inventoryChangeKg: 50,
      gwpOverride: 1800,
      overrideReason: 'Proprietary MR blend effective GWP',
    }
    p.activityData.refrigerants = [mr]
    const r = calculateOilGas(p)
    // (1200 − 0 − 50) × 1800 / 1000 = 2,070 t
    expect(r.scope1.byCategory.refrigerants.co2eTonnes).toBeCloseTo(2_070, 1)
  })
})

describe('biogenic carbon split (V1 §4.7)', () => {
  it('biodiesel CO2 is a memo item, excluded from gross Scope 1', () => {
    const p = baseOilGasPayload()
    const bio: FuelEntry = {
      id: 'b1',
      label: 'Biodiesel genset fuel',
      fuelCode: 'biodiesel',
      category: 'BIOMASS',
      quantity: 400_000,
      quantityUnit: 'L',
    }
    p.activityData.stationaryCombustion = [bio]
    const r = calculateOilGas(p)
    expect(r.memoItems.biogenicCO2Tonnes).toBeGreaterThan(0)
    expect(r.scope1.byCategory.stationaryCombustion.co2Tonnes).toBe(0)
    expect(r.scope1.byCategory.stationaryCombustion.biogenicCO2Tonnes).toBe(r.memoItems.biogenicCO2Tonnes)
    // Biogenic CH4/N2O still count in Scope 1 (small, but non-zero).
    expect(r.scope1.byCategory.stationaryCombustion.co2eTonnes).toBeGreaterThan(0)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(r.scope1.byCategory.stationaryCombustion.co2eTonnes)
  })
})

describe('scope separation', () => {
  const ownedDiesel = (): MobileEntry => ({
    id: 'm1',
    label: 'Owned rig genset',
    ownership: 'OWNED_CONTROLLED',
    fuelCode: 'diesel',
    quantity: 1_000_000,
    quantityUnit: 'L',
  })

  it('purchased electricity stays in supporting Scope 2', () => {
    const p = baseOilGasPayload()
    p.activityData.purchasedElectricity = { mwh: 10_000, gridEfTco2PerMwh: 0.71 }
    const r = calculateOilGas(p)
    expect(r.supportingScope2.purchasedElectricityCO2eTonnes).toBeCloseTo(7_100, 1)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(0)
    expect(r.scope1.excludedFromGrossScope1.purchasedElectricityCO2eTonnes).toBe(7_100)
  })

  it('third-party mobile stays in supporting Scope 3', () => {
    const p = baseOilGasPayload()
    p.activityData.mobileCombustion = [{ ...ownedDiesel(), id: 'm2', label: 'Contractor truck', ownership: 'THIRD_PARTY' }]
    const r = calculateOilGas(p)
    expect(r.supportingScope3.thirdPartyMobileCO2eTonnes).toBeGreaterThan(0)
    expect(r.scope1.byCategory.mobileCombustion.co2eTonnes).toBe(0)
    expect(codes(r.warnings)).toContain('third_party_mobile_excluded')
  })

  it('owned mobile is in gross Scope 1', () => {
    const p = baseOilGasPayload()
    p.activityData.mobileCombustion = [ownedDiesel()]
    const r = calculateOilGas(p)
    // 1,000,000 L × 0.03612 GJ/L × 74.1 kg/GJ / 1000 = 2,676.49 t CO2
    expect(r.scope1.byCategory.mobileCombustion.co2Tonnes).toBeCloseTo(2_676.49, 1)
    expect(r.scope1.grossScope1CO2eTonnes).toBeGreaterThan(2_676)
  })
})

describe('equity-share consolidation (V1 §2 boundary example)', () => {
  it('scales every bucket by the consolidation share', () => {
    const p = baseOilGasPayload()
    p.organizationBoundary = { boundaryMethod: 'EQUITY_SHARE', ownershipSharePercent: 60, consolidationPercent: 60 }
    p.activityData.venting = [
      {
        id: 'v1',
        label: 'Vent',
        eventType: 'DESIGNED',
        ventVolumeSm3: 6_825_500,
        composition: { ch4Percent: 95, co2Percent: 0, c2h6Percent: 3, c3h8Percent: 1, n2Percent: 1 },
      },
    ]
    const r = calculateOilGas(p)
    // 126,952 × 0.60 = 76,171 t
    expect(r.scope1.grossScope1CO2eTonnes).toBeCloseTo(76_171, 0)
    expect(r.dataQuality.fallbacksApplied.join()).toContain('Equity share consolidation')
  })
})

describe('intensity metrics', () => {
  it('computes methane intensity as % of gas production mass', () => {
    const p = baseOilGasPayload()
    p.activityData.production = { gasProductionMassTonnes: 1_000_000 }
    p.activityData.venting = [
      {
        id: 'v1',
        label: 'Vent',
        eventType: 'DESIGNED',
        ventVolumeSm3: 6_825_500,
        composition: { ch4Percent: 95, co2Percent: 0, c2h6Percent: 3, c3h8Percent: 1, n2Percent: 1 },
      },
    ]
    const r = calculateOilGas(p)
    // 4,260.13 t CH4 / 1,000,000 t × 100 = 0.426 %
    expect(r.intensityMetrics.methaneIntensityPercent).toBeCloseTo(0.426, 2)
  })

  it('computes upstream intensity per BOE', () => {
    const p = baseOilGasPayload()
    p.activityData.production = { boeProduced: 10_000_000 }
    p.activityData.flaring = [
      {
        id: 'fl1',
        label: 'Flare',
        flareType: 'steam_assisted_lit',
        operatingStatus: 'lit',
        flareVolumeSm3: 5_110_000,
        volumeBasis: 'METERED',
        composition: { ch4Percent: 78, co2Percent: 3, c2h6Percent: 12, c3h8Percent: 5, n2Percent: 2 },
        dreBasis: 'DEFAULT',
      },
    ]
    const r = calculateOilGas(p)
    // 12,730.2 t × 1000 / 10,000,000 BOE = 1.273 kg/BOE
    expect(r.intensityMetrics.co2ePerBoe).toBeCloseTo(1.273, 2)
  })
})

describe('mass-balance reconciliation (V1 §11.5)', () => {
  it('flags an imbalance above 3%', () => {
    const p = baseOilGasPayload()
    p.activityData.massBalance = {
      gasInSm3: 152_000_000,
      salesGasSm3: 138_000_000,
      fuelGasSm3: 6_200_000,
      flaredSm3: 1_400_000,
      ventedSm3: 380_000,
      fugitiveSm3: 950_000,
      inventoryChangeSm3: 200_000,
    }
    const r = calculateOilGas(p)
    // Outs = 138.0+6.2+1.4+0.38+0.95+0.20 = 147.13 MSm3 ; imbalance = 4.87/152 = 3.20%.
    // (The source doc quotes 3.34% but omits the +0.20 inventory term from its sum.)
    expect(r.massBalance.checked).toBe(true)
    expect(r.massBalance.imbalancePercent).toBeCloseTo(3.2, 1)
    expect(codes(r.warnings)).toContain('mass_balance_imbalance_exceeds_3pct')
  })
})

describe('validation guardrails', () => {
  it('blocks a gas composition that does not sum to 100%', () => {
    const p = baseOilGasPayload()
    p.activityData.venting = [
      { id: 'v1', label: 'Vent', eventType: 'DESIGNED', ventVolumeSm3: 1000, composition: { ch4Percent: 80, co2Percent: 3 } },
    ]
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('gas_composition_sum_invalid')
    expect(r.status).toBe('BLOCKED')
  })

  it('blocks purchased electricity entered as a combustion fuel', () => {
    const p = baseOilGasPayload()
    p.activityData.stationaryCombustion = [
      { id: 'e1', label: 'Grid electricity for compressor', fuelCode: 'natural_gas', category: 'CONVENTIONAL_FOSSIL', quantity: 100, quantityUnit: 'Sm3' },
    ]
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('scope2_electricity_entered_as_scope1')
  })

  it('blocks an excluded source without a recorded reason', () => {
    const p = baseOilGasPayload()
    p.sourceApplicability.flaring = false
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('source_exclusion_without_reason')
    expect(r.status).toBe('BLOCKED')
  })

  it('errors on a flare with no volume', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [
      {
        id: 'fl1',
        label: 'Flare',
        flareType: 'steam_assisted_lit',
        operatingStatus: 'lit',
        flareVolumeSm3: null,
        volumeBasis: 'METERED',
        composition: { ch4Percent: 90, co2Percent: 5, n2Percent: 5 },
        dreBasis: 'DEFAULT',
      },
    ]
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('missing_flare_volume')
  })

  it('errors on an unknown fugitive component class', () => {
    const p = baseOilGasPayload()
    p.activityData.fugitiveComponents = [
      { id: 'x', label: 'Mystery', componentCode: 'teleporter', count: 10, ldarMethod: 'TIER1_COUNT' },
    ]
    const r = calculateOilGas(p)
    expect(codes(r.errors)).toContain('unknown_component_class')
  })
})

describe('factor snapshots & trace (audit trail)', () => {
  it('records a snapshot and trace for every emitting source', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [
      {
        id: 'fl1',
        label: 'Flare',
        flareType: 'steam_assisted_lit',
        operatingStatus: 'lit',
        flareVolumeSm3: 5_110_000,
        volumeBasis: 'METERED',
        composition: { ch4Percent: 78, co2Percent: 3, c2h6Percent: 12, c3h8Percent: 5, n2Percent: 2 },
        dreBasis: 'DEFAULT',
      },
    ]
    const r = calculateOilGas(p)
    expect(r.calculationTrace.some((t) => t.category === 'FLARING')).toBe(true)
    expect(r.factorSnapshots.length).toBeGreaterThan(0)
  })
})

describe('negative input guards (no route may return negative Scope 1)', () => {
  it('blocks a negative flare composition component (sum still ~100)', () => {
    const p = baseOilGasPayload()
    p.activityData.flaring = [
      {
        id: 'fl1',
        label: 'Flare',
        flareType: 'steam_assisted_lit',
        operatingStatus: 'lit',
        flareVolumeSm3: 5_000_000,
        volumeBasis: 'METERED',
        composition: { ch4Percent: 90, co2Percent: -5, c2h6Percent: 10, n2Percent: 5 },
        dreBasis: 'DEFAULT',
      },
    ]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks a negative vent composition component', () => {
    const p = baseOilGasPayload()
    p.activityData.venting = [
      {
        id: 'v1',
        label: 'Vent',
        eventType: 'DESIGNED',
        ventVolumeSm3: 1_000_000,
        composition: { ch4Percent: 95, co2Percent: -3, c2h6Percent: 3, n2Percent: 5 },
      },
    ]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks negative process CH4', () => {
    const p = baseOilGasPayload()
    p.activityData.process = [
      { id: 'pr1', label: 'Process', processType: 'DIRECT_CO2', directCo2Tonnes: 1000, ch4Tonnes: -50 },
    ]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks negative throughput × negative EF (positive product must not slip through)', () => {
    const p = baseOilGasPayload()
    p.activityData.process = [
      { id: 'pr1', label: 'Generic', processType: 'GENERIC_EF', throughput: -100, efTco2PerUnit: -2 },
    ]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('blocks negative refrigerant disposal', () => {
    const p = baseOilGasPayload()
    p.activityData.refrigerants = [
      {
        id: 'rf1',
        label: 'Chiller',
        gasCode: 'r134a',
        tier: 'TIER2_MASS_BALANCE',
        purchasesKg: 1000,
        disposalsKg: -100,
      },
    ]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('negative refrigerant inventory change (closing < opening) is allowed', () => {
    const p = baseOilGasPayload()
    p.activityData.refrigerants = [
      {
        id: 'rf1',
        label: 'Chiller',
        gasCode: 'r134a',
        tier: 'TIER2_MASS_BALANCE',
        purchasesKg: 1000,
        disposalsKg: 0,
        inventoryChangeKg: -200,
        gwpOverride: 1530,
        overrideReason: 'AR6 100-yr',
      },
    ]
    const r = calculateOilGas(p)
    expect(r.errors).toHaveLength(0)
    // (1000 − 0 − (−200)) × 1530 / 1000 = 1,836 tCO2e
    expect(r.scope1.byCategory.refrigerants.co2eTonnes).toBeCloseTo(1_836, 0)
  })
})

describe('reported / direct-entry reconciliation mode', () => {
  it('direct CO2e reported entry lands in the reported category and gross', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [
      { id: 'r1', label: 'Flaring (disclosed)', categoryTag: 'flaring', co2eTonnes: 1_500_000, basis: 'REPORTED', source: 'Shell 2025' },
    ]
    const r = calculateOilGas(p)
    expect(r.errors).toHaveLength(0)
    expect(r.scope1.byCategory.reported.co2eTonnes).toBe(1_500_000)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(1_500_000)
  })

  it('reported by-gas masses convert via the GWP set (AR6 100-yr)', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [
      { id: 'r1', label: 'Flaring CO2 + CH4 (disclosed)', co2Tonnes: 3_000_000, ch4Tonnes: 5_000, basis: 'REPORTED' },
    ]
    const r = calculateOilGas(p)
    // 3,000,000 + 5,000 × 29.8 = 3,149,000
    expect(r.scope1.byCategory.reported.co2eTonnes).toBeCloseTo(3_149_000, 0)
    expect(r.scope1.byGas.ch4Tonnes).toBeCloseTo(5_000, 0)
  })

  it('combined venting+process can be entered as one reported row', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [
      { id: 'r1', label: 'Venting + process (combined disclosure)', co2eTonnes: 5_000_000, basis: 'REPORTED' },
    ]
    const r = calculateOilGas(p)
    expect(r.scope1.grossScope1CO2eTonnes).toBe(5_000_000)
  })

  it('reconciliation: disclosed equals modelled → 0% variance', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [{ id: 'r1', label: 'Total', co2eTonnes: 90_000_000, basis: 'REPORTED' }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 90_000_000
    const r = calculateOilGas(p)
    expect(r.reconciliation.checked).toBe(true)
    expect(r.reconciliation.variancePercent).toBe(0)
  })

  it('reconciliation warns when modelled differs from disclosed by > 5%', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [{ id: 'r1', label: 'Total', co2eTonnes: 80_000_000, basis: 'ESTIMATED' }]
    p.activityData.disclosedGrossScope1CO2eTonnes = 90_000_000
    const r = calculateOilGas(p)
    expect(r.reconciliation.variancePercent).toBeCloseTo(-11.11, 1)
    expect(codes(r.warnings)).toContain('reconciliation_variance_exceeds_5pct')
  })

  it('blocks a negative reported value', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [{ id: 'r1', label: 'Bad', co2eTonnes: -100, basis: 'REPORTED' }]
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })
})

describe('by-gas + Scope 2 reconciliation, assumptions & data quality (bp-style)', () => {
  const lineFor = (r: ReturnType<typeof calculateOilGas>, metric: string) =>
    r.reconciliation.lines.find((l) => l.metric === metric)

  it('reconciles disclosed CO2 and CH4 masses independently of gross', () => {
    const p = baseOilGasPayload()
    // disclosed by-gas entry → the modelled inventory carries the gas split
    p.activityData.reported = [{ id: 'r1', label: 'bp by-gas', co2Tonnes: 32_800_000, ch4Tonnes: 30_000, basis: 'REPORTED' }]
    p.activityData.disclosedScope1CO2Tonnes = 32_800_000
    p.activityData.disclosedScope1CH4Tonnes = 30_000
    const r = calculateOilGas(p)
    expect(r.reconciliation.checked).toBe(true)
    expect(lineFor(r, 'CO2')?.variancePercent).toBe(0)
    expect(lineFor(r, 'CH4')?.variancePercent).toBe(0)
    expect(lineFor(r, 'CO2')?.withinThreshold).toBe(true)
    expect(lineFor(r, 'CH4')?.withinThreshold).toBe(true)
    expect(codes(r.warnings)).not.toContain('reconciliation_variance_exceeds_5pct')
    expect(codes(r.warnings)).not.toContain('reported_gas_split_missing')
  })

  it('flags a per-gas variance > 5% even when no gross is disclosed', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [{ id: 'r1', label: 'modelled', co2Tonnes: 32_800_000, ch4Tonnes: 30_000, basis: 'ESTIMATED' }]
    p.activityData.disclosedScope1CH4Tonnes = 50_000 // modelled 30k → −40%
    const r = calculateOilGas(p)
    const ch4 = lineFor(r, 'CH4')
    expect(ch4?.variancePercent).toBeCloseTo(-40, 0)
    expect(ch4?.withinThreshold).toBe(false)
    expect(codes(r.warnings)).toContain('reconciliation_variance_exceeds_5pct')
  })

  it('reconciles disclosed Scope 2 against the supporting electricity bucket', () => {
    const p = baseOilGasPayload()
    p.activityData.purchasedElectricity = { mwh: 1_000_000, gridEfTco2PerMwh: 0.42 }
    p.activityData.disclosedScope2CO2eTonnes = 420_000
    const r = calculateOilGas(p)
    const s2 = lineFor(r, 'SCOPE2')
    expect(s2?.modelled).toBeCloseTo(420_000, 0)
    expect(s2?.variancePercent).toBe(0)
  })

  it('nudges to enter by gas when a gross-only total hides the gas split', () => {
    const p = baseOilGasPayload()
    // bp reported-aggregate case: a single gross CO2e, no gas split
    p.activityData.reported = [{ id: 'r1', label: 'bp disclosed Scope 1', co2eTonnes: 33_700_000, basis: 'REPORTED' }]
    p.activityData.disclosedScope1CO2Tonnes = 32_800_000
    p.activityData.disclosedScope1CH4Tonnes = 30_000
    const r = calculateOilGas(p)
    expect(codes(r.warnings)).toContain('reported_gas_split_missing')
    expect(lineFor(r, 'CO2')?.modelled).toBe(0)
    expect(lineFor(r, 'CO2')?.variancePercent).toBe(-100)
  })

  it('blocks a negative disclosed by-gas figure', () => {
    const p = baseOilGasPayload()
    p.activityData.disclosedScope1CH4Tonnes = -10
    const r = calculateOilGas(p)
    expect(r.status).toBe('BLOCKED')
    expect(codes(r.errors)).toContain('negative_input_value')
  })

  it('builds an assumptions register from override reasons and estimated bases', () => {
    const p = baseOilGasPayload()
    p.activityData.process = [
      { id: 'p1', label: 'Residual CO2', processType: 'DIRECT_CO2', directCo2Tonnes: 1_000, overrideReason: 'Residual after assumed combustion/flaring allocation' } as ProcessEntry,
    ]
    p.activityData.reported = [
      { id: 'r1', label: 'Estimated venting', co2eTonnes: 2_000, basis: 'ESTIMATED', note: 'rough split of disclosed methane' },
    ]
    const r = calculateOilGas(p)
    const override = r.assumptions.find((a) => a.kind === 'OVERRIDE')
    const estimate = r.assumptions.find((a) => a.kind === 'ESTIMATE')
    expect(override?.label).toBe('Residual CO2')
    expect(override?.detail).toContain('Residual after')
    expect(estimate?.label).toBe('Estimated venting')
    expect(estimate?.detail).toContain('estimated basis')
  })

  it('labels a reported-dominated inventory REPORTED_AGGREGATE, not plant-specific', () => {
    const p = baseOilGasPayload()
    p.activityData.reported = [{ id: 'r1', label: 'Corporate disclosed Scope 1', co2eTonnes: 33_700_000, basis: 'REPORTED' }]
    const r = calculateOilGas(p)
    expect(r.dataQuality.overall).toBe('REPORTED_AGGREGATE')
  })

  it('keeps a modelled-dominated inventory out of REPORTED_AGGREGATE', () => {
    const p = baseOilGasPayload()
    p.activityData.process = [
      { id: 'p1', label: 'Direct CO2', processType: 'DIRECT_CO2', directCo2Tonnes: 100_000 } as ProcessEntry,
    ]
    p.activityData.reported = [{ id: 'r1', label: 'minor disclosure', co2eTonnes: 1_000, basis: 'REPORTED' }]
    const r = calculateOilGas(p)
    expect(r.dataQuality.overall).not.toBe('REPORTED_AGGREGATE')
  })
})
