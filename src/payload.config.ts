import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Calculations } from './collections/Calculations'
import { Facilities } from './collections/Facilities'
import { FactorLibrary } from './collections/FactorLibrary'
import { Organizations } from './collections/Organizations'
import { SectorPacks } from './collections/SectorPacks'
import { Users } from './collections/Users'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    meta: {
      titleSuffix: ' - Sustally Scope 1',
    },
    theme: 'all',
    user: Users.slug,
  },
  collections: [Users, SectorPacks, Organizations, Facilities, FactorLibrary, Calculations],
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URI || 'file:./sustally-scope1.db',
    },
  }),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
