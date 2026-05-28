import type { PulpPaperInputPayload } from '../types'

/** A complete, valid baseline P&P payload with no sources (totals to zero). */
export function basePulpPaperPayload(): PulpPaperInputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'TEST_V1',
      gwpSet: 'AR6_100',
    },
    organization: { name: 'Test Pulp & Paper Ltd', country: 'IN' },
    facility: { name: 'Mill 1', millType: 'KRAFT' },
    organizationBoundary: {
      boundaryMethod: 'OPERATIONAL_CONTROL',
      ownershipSharePercent: 100,
      consolidationPercent: 100,
    },
    sector: { sectorCode: 'PULP_PAPER' },
    methodSelections: {
      stationaryMethod: 'ENERGY_BASED',
      mobileMethod: 'FUEL_BASED',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
    },
    sourceApplicability: {
      stationaryCombustion: true,
      biomassCombustion: true,
      limeKilns: true,
      makeupCarbonates: true,
      mobile: true,
      landfills: true,
      anaerobicWwt: true,
      refrigerants: true,
      chpAllocation: true,
      co2Transfers: true,
      reported: true,
      purchasedElectricity: true,
    },
    activityData: {
      production: {},
      stationaryCombustion: [],
      biomassCombustion: [],
      limeKilns: [],
      makeupCarbonates: [],
      mobile: [],
      landfills: [],
      anaerobicWwt: [],
      refrigerants: [],
      chpAllocation: [],
      co2Transfers: [],
      reported: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
    },
    factorOverrides: {},
  }
}
