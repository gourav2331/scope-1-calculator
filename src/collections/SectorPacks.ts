import type { CollectionConfig } from 'payload'

export const SectorPacks: CollectionConfig = {
  slug: 'sector-packs',
  admin: {
    defaultColumns: ['name', 'sector', 'status'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'sector', type: 'text', defaultValue: 'cement', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'active',
      options: ['draft', 'active', 'retired'],
      required: true,
    },
    { name: 'methodology', type: 'textarea' },
    {
      name: 'inputSchema',
      type: 'json',
      admin: {
        description: 'JSON Schema for sector-specific process inputs.',
      },
    },
  ],
}
