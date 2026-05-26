import type { OilGasInputPayload } from '../types'

/** A complete, valid baseline O&G payload with no sources (totals to zero). */
export function baseOilGasPayload(): OilGasInputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'TEST_V1',
      gwpSet: 'AR6_100',
    },
    organization: { name: 'Test Oil & Gas Ltd', country: 'IN' },
    facility: { name: 'Asset 1', segment: 'UPSTREAM', facilityType: 'UPSTREAM_ONSHORE' },
    organizationBoundary: {
      boundaryMethod: 'OPERATIONAL_CONTROL',
      ownershipSharePercent: 100,
      consolidationPercent: 100,
    },
    sector: { sectorCode: 'OIL_GAS' },
    methodSelections: {
      stationaryCombustionMethod: 'ENERGY_BASED',
      mobileCombustionMethod: 'FUEL_BASED',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
    },
    sourceApplicability: {
      stationaryCombustion: true,
      mobileCombustion: true,
      flaring: true,
      venting: true,
      fugitiveComponents: true,
      refrigerants: true,
      process: true,
      reported: true,
      purchasedElectricity: true,
    },
    activityData: {
      production: {},
      stationaryCombustion: [],
      mobileCombustion: [],
      flaring: [],
      venting: [],
      fugitiveComponents: [],
      refrigerants: [],
      process: [],
      reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}
