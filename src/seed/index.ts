/**
 * Seeds the Payload factor library from the authoritative engine constants
 * so the admin UI shows every default with full provenance. Idempotent:
 * re-running updates existing records by factorCode instead of duplicating.
 *
 * Run with: npm run seed
 */
import 'dotenv/config'
import { getPayload } from 'payload'

import config from '../payload.config'
import { CONSTANT_FACTORS, FUEL_DEFAULTS } from '../lib/engine/constants'

type Cms = Awaited<ReturnType<typeof getPayload>>
type CreateArgs = Parameters<Cms['create']>[0]
type UpdateArgs = Parameters<Cms['update']>[0]

async function upsertFactor(payload: Cms, data: Record<string, unknown>) {
  const existing = await payload.find({
    collection: 'factor-library',
    where: { factorCode: { equals: data.factorCode } },
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

async function main() {
  const payload = await getPayload({ config })

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

  const sectorPacks = await payload.find({
    collection: 'sector-packs',
    where: { sector: { equals: 'cement' } },
    limit: 1,
  })
  if (sectorPacks.docs.length === 0) {
    await payload.create({
      collection: 'sector-packs',
      data: {
        name: 'Cement (CSI Cement CO2 Protocol v2)',
        sector: 'cement',
        status: 'active',
        methodology:
          'CSI Cement CO2 Protocol clinker-based method with US EPA cement-based fallback. Process + stationary + mobile + fugitive Scope 1; biomass CO2 memo separation.',
      },
    } as unknown as CreateArgs)
  }

  console.log('Seed complete: factor library + cement sector pack.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
