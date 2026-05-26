/**
 * Seeds the Payload factor library from the authoritative engine constants
 * so the admin UI shows every default with full provenance. Idempotent:
 * re-running updates existing records by (sectorCode, factorCode) instead of
 * duplicating. Seeds both the Cement and Oil & Gas methodology packs.
 *
 * Run with: npm run seed
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { CONSTANT_FACTORS, FUEL_DEFAULTS } from '../lib/engine/constants'
import {
  COMPONENT_EF_DEFAULTS,
  OILGAS_CONSTANT_FACTORS,
  OILGAS_FUEL_DEFAULTS,
  PROCESS_FACTORS,
} from '../lib/engine/oilgas'

type Cms = Awaited<ReturnType<typeof getPayload>>
type CreateArgs = Parameters<Cms['create']>[0]
type UpdateArgs = Parameters<Cms['update']>[0]

async function upsertFactor(payload: Cms, data: Record<string, unknown>) {
  const existing = await payload.find({
    collection: 'factor-library',
    where: {
      and: [{ factorCode: { equals: data.factorCode } }, { sectorCode: { equals: data.sectorCode } }],
    },
    limit: 1,
  })
  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'factor-library',
      id: existing.docs[0].id,
      data,
    } as unknown as UpdateArgs)
  } else {
    await payload.create({ collection: 'factor-library', data } as unknown as CreateArgs)
  }
}

async function ensureSectorPack(payload: Cms, sector: string, data: Record<string, unknown>) {
  const found = await payload.find({
    collection: 'sector-packs',
    where: { sector: { equals: sector } },
    limit: 1,
  })
  if (found.docs.length === 0) {
    await payload.create({ collection: 'sector-packs', data } as unknown as CreateArgs)
  }
}

async function seedCement(payload: Cms) {
  for (const f of Object.values(CONSTANT_FACTORS)) {
    await upsertFactor(payload, {
      factorCode: f.factorCode,
      factorName: f.factorName,
      factorType: 'constant',
      sectorCode: 'CEMENT',
      value: f.value,
      unit: f.unit,
      source: f.source,
      sourceVersion: f.sourceVersion,
      factorYear: f.factorYear ?? undefined,
      priorityRank: f.priorityRank,
      isDefault: f.isDefault,
      isLocked: f.sourceVersion === 'constant',
      replacementAllowed: f.sourceVersion !== 'constant',
    })
  }
  for (const fuel of Object.values(FUEL_DEFAULTS)) {
    await upsertFactor(payload, {
      factorCode: `FUEL_EF_${fuel.fuelCode}`,
      factorName: `${fuel.name} - CO2 emission factor`,
      factorType: 'fuel',
      sectorCode: 'CEMENT',
      value: fuel.co2EfKgPerGj,
      unit: 'kgCO2/GJ',
      source: fuel.source,
      sourceVersion: fuel.sourceVersion,
      factorYear: fuel.factorYear,
      priorityRank: 5,
      isDefault: true,
      isLocked: false,
      replacementAllowed: true,
      notes: `Default LHV ${fuel.lhvGjPerUnit} GJ/${fuel.defaultUnit}; category ${fuel.category}; biomass fraction ${fuel.biomassFraction}.`,
    })
  }
  await ensureSectorPack(payload, 'cement', {
    name: 'Cement (CSI Cement CO2 Protocol v2)',
    sector: 'cement',
    status: 'active',
    methodology:
      'CSI Cement CO2 Protocol clinker-based method with US EPA cement-based fallback. Process + stationary + mobile + fugitive Scope 1; biomass CO2 memo separation.',
  })
}

async function seedOilGas(payload: Cms) {
  for (const f of [...Object.values(OILGAS_CONSTANT_FACTORS), ...Object.values(PROCESS_FACTORS)]) {
    await upsertFactor(payload, {
      factorCode: f.factorCode,
      factorName: f.factorName,
      factorType: 'constant',
      sectorCode: 'OIL_GAS',
      value: f.value,
      unit: f.unit,
      source: f.source,
      sourceVersion: f.sourceVersion,
      factorYear: f.factorYear ?? undefined,
      priorityRank: f.priorityRank,
      isDefault: f.isDefault,
      isLocked: f.sourceVersion === 'constant',
      replacementAllowed: f.sourceVersion !== 'constant',
    })
  }
  for (const fuel of Object.values(OILGAS_FUEL_DEFAULTS)) {
    await upsertFactor(payload, {
      factorCode: `FUEL_EF_${fuel.fuelCode}`,
      factorName: `${fuel.name} - CO2 emission factor`,
      factorType: 'fuel',
      sectorCode: 'OIL_GAS',
      value: fuel.co2EfKgPerGj,
      unit: 'kgCO2/GJ',
      source: fuel.source,
      sourceVersion: fuel.sourceVersion,
      factorYear: fuel.factorYear,
      priorityRank: 5,
      isDefault: true,
      isLocked: false,
      replacementAllowed: true,
      notes: `Default LHV ${fuel.lhvGjPerUnit} GJ/${fuel.defaultUnit}; category ${fuel.category}; biomass fraction ${fuel.biomassFraction}.`,
    })
  }
  for (const comp of Object.values(COMPONENT_EF_DEFAULTS)) {
    await upsertFactor(payload, {
      factorCode: `FUGITIVE_EF_${comp.componentCode}`,
      factorName: `${comp.name} - fugitive leak factor`,
      factorType: 'constant',
      sectorCode: 'OIL_GAS',
      value: comp.kgCh4PerHrPerSource,
      unit: 'kgCH4/hr/source',
      source: comp.source,
      sourceVersion: comp.sourceVersion,
      priorityRank: 5,
      isDefault: true,
      isLocked: false,
      replacementAllowed: true,
    })
  }
  await ensureSectorPack(payload, 'oil_gas', {
    name: 'Oil & Gas (IPIECA/API + EPA Subpart W + IPCC)',
    sector: 'oil_gas',
    status: 'active',
    methodology:
      'IPIECA/IOGP/API six-category Scope 1 (stationary + mobile combustion, flaring, venting, fugitive component-count, process) plus refrigerants. Full CO2e across CO2/CH4/N2O with AR5/AR6 100-yr and AR6 20-yr horizons; biogenic CO2 memo separation; mass-balance reconciliation.',
  })
}

async function main() {
  const payload = await getPayload({ config })
  await seedCement(payload)
  await seedOilGas(payload)
  console.log('Seed complete: factor library + cement & oil-and-gas sector packs.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
