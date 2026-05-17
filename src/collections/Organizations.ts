import type { CollectionConfig } from 'payload'

export const Organizations: CollectionConfig = {
  slug: 'organizations',
  admin: {
    defaultColumns: ['name', 'sector', 'boundaryMethod'],
    useAsTitle: 'name',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'cin', type: 'text', label: 'CIN' },
    { name: 'pan', type: 'text', label: 'PAN' },
    {
      name: 'sector',
      type: 'select',
      defaultValue: 'cement',
      options: ['cement'],
      required: true,
    },
    {
      name: 'boundaryMethod',
      type: 'select',
      defaultValue: 'operational_control',
      options: ['operational_control', 'financial_control', 'equity_share'],
      required: true,
    },
    {
      name: 'gwpSet',
      type: 'select',
      defaultValue: 'AR6',
      options: ['AR5', 'AR6'],
      required: true,
    },
    {
      name: 'baseYear',
      type: 'number',
      defaultValue: 2025,
      required: true,
    },
  ],
}
