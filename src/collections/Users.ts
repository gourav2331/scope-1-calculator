import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'sustainability_lead',
      options: [
        'admin',
        'sustainability_lead',
        'facility_manager',
        'auditor',
        'readonly',
      ],
      required: true,
    },
  ],
}
