import type { InputPayload } from '../types'

/** A complete, valid baseline payload: CSI default 0.525, 1 Mt clinker, no fuels. */
export function basePayload(): InputPayload {
  return {
    calculationContext: {
      calculationType: 'ANNUAL_INVENTORY',
      reportingPeriod: { year: 2026, startDate: '2026-01-01', endDate: '2026-12-31' },
      inventoryVersion: 'TEST_V1',
      gwpSet: 'AR6',
    },
    organization: { name: 'Test Cement Pvt Ltd', country: 'IN' },
    facility: { name: 'Plant 1', facilityType: 'INTEGRATED_CEMENT' },
    organizationBoundary: {
      boundaryMethod: 'OPERATIONAL_CONTROL',
      ownershipSharePercent: 100,
      consolidationPercent: 100,
    },
    sector: { sectorCode: 'CEMENT' },
    methodSelections: {
      processEmissionMethod: 'CSI_CLINKER_BASED',
      clinkerEmissionFactorMethod: 'CSI_DEFAULT_525',
      dustMethod: 'NOT_APPLICABLE',
      tocMethod: 'NOT_APPLICABLE',
      fuelCombustionMethod: 'ENERGY_BASED',
      mobileCombustionMethod: 'FUEL_BASED',
      electricityMethod: 'LOCATION_BASED_SUPPORTING',
      boughtClinkerMethod: 'NONE',
      netReportingMethod: 'NONE',
    },
    sourceApplicability: {
      clinkerCalcination: true,
      bypassDust: true,
      ckd: true,
      rawMealToc: true,
      kilnFuels: true,
      nonKilnFuels: true,
      mobile: true,
      fugitive: true,
      purchasedElectricity: true,
      boughtClinker: true,
    },
    activityData: {
      production: {
        clinkerProducedTonnes: 1_000_000,
        cementProducedTonnes: null,
        cementitiousProductTonnes: null,
      },
      clinkerChemistry: {
        caoPercent: null,
        caoNonCarbonatePercent: null,
        mgoPercent: null,
        mgoNonCarbonatePercent: null,
      },
      dust: {
        ckdLeavingKilnTonnes: null,
        ckdCalcinationRate: null,
        bypassDustLeavingKilnTonnes: null,
        bypassDustCalcinationRate: null,
      },
      rawMeal: { rawMealToClinkerRatio: null, tocFraction: null },
      kilnFuels: [],
      nonKilnFuels: [],
      mobile: [],
      fugitive: [],
      purchasedElectricity: { mwh: null, gridEfTco2PerMwh: null },
      boughtClinker: { externalClinkerBoughtTonnes: null, externalClinkerSoldTonnes: null },
      emissionRights: { acquiredTonnes: null },
      usEpaFallback: {
        cementProducedTonnes: null,
        clinkerToCementRatio: null,
        clinkerEfTco2PerTonne: null,
      },
    },
    factorOverrides: {},
  }
}
