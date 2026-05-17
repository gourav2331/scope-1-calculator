import type { CollectionConfig } from 'payload'

export const Facilities: CollectionConfig = {
  slug: 'facilities',
  admin: {
    defaultColumns: ['name', 'facilityType', 'state', 'organization'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'organization', type: 'relationship', relationTo: 'organizations', required: true },
    {
      name: 'facilityType',
      type: 'select',
      defaultValue: 'integrated_cement',
      options: [
        { label: 'Integrated cement plant', value: 'integrated_cement' },
        { label: 'Clinker unit', value: 'clinker_unit' },
        { label: 'Grinding unit', value: 'grinding_unit' },
      ],
      required: true,
    },
    { name: 'state', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'equitySharePercent', type: 'number', defaultValue: 100, min: 0, max: 100 },
    { name: 'annualCementCapacityTonnes', type: 'number' },
    { name: 'annualClinkerCapacityTonnes', type: 'number' },
  ],
}
