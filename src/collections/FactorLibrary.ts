import type { CollectionConfig } from 'payload'

/**
 * Human-facing factor registry. The authoritative calculation defaults live
 * in `src/lib/engine/constants.ts` (versioned with the code and unit-tested);
 * this collection mirrors them for transparency and lets consultants register
 * custom factors (priority rank 6) and lock official ones. The spec forbids
 * hidden hardcoded factors — every value here carries full provenance.
 */
export const FactorLibrary: CollectionConfig = {
  slug: 'factor-library',
  admin: {
    defaultColumns: ['factorCode', 'factorName', 'value', 'unit', 'source', 'priorityRank'],
    useAsTitle: 'factorName',
    group: 'Methodology',
  },
  fields: [
    { name: 'factorCode', type: 'text', required: true, unique: true },
    { name: 'factorName', type: 'text', required: true },
    {
      name: 'factorType',
      type: 'select',
      required: true,
      defaultValue: 'constant',
      options: [
        { label: 'Constant / methodology factor', value: 'constant' },
        { label: 'Fuel parameter', value: 'fuel' },
      ],
    },
    { name: 'sectorCode', type: 'text', defaultValue: 'CEMENT', required: true },
    { name: 'value', type: 'number', required: true },
    { name: 'unit', type: 'text', required: true },
    { name: 'source', type: 'text', required: true },
    { name: 'sourceVersion', type: 'text', required: true },
    { name: 'factorYear', type: 'number' },
    {
      name: 'priorityRank',
      type: 'number',
      required: true,
      defaultValue: 4,
      admin: {
        description: '1 plant-specific, 2 supplier, 3 official national, 4 sector default, 5 international default, 6 user estimate.',
      },
    },
    { name: 'isDefault', type: 'checkbox', defaultValue: true },
    { name: 'isLocked', type: 'checkbox', defaultValue: false },
    { name: 'replacementAllowed', type: 'checkbox', defaultValue: true },
    { name: 'notes', type: 'textarea' },
  ],
}
