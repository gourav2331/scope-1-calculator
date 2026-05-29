import type { CollectionConfig } from 'payload'

/**
 * A saved Scope 1 inventory calculation. Stores the exact input payload, the
 * full result model, the calculation trace and the factor snapshots so the
 * run can be re-audited even if the factor library changes later
 * (spec: FACTOR_SNAPSHOT_ON_CALCULATION, SKIP_CALCULATION_TRACE forbidden).
 */
export const Calculations: CollectionConfig = {
  slug: 'calculations',
  admin: {
    defaultColumns: ['name', 'reportingYear', 'status', 'grossScope1Tonnes', 'calculatedAt'],
    useAsTitle: 'name',
    group: 'Inventory',
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'organization', type: 'relationship', relationTo: 'organizations' },
    { name: 'facility', type: 'relationship', relationTo: 'facilities' },
    { name: 'reportingYear', type: 'number', required: true },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'draft',
      required: true,
      options: ['draft', 'calculated', 'success_with_warnings', 'blocked'],
    },
    /**
     * Workflow state for assurance — independent of the engine `status` above.
     * Mirrors the FRS state machine Draft → Submitted → Under review → Locked
     * → Verified. UI today exposes Draft → Locked (single-user sign-off);
     * maker-checker with separate roles is a follow-up.
     */
    {
      name: 'workflowStatus',
      type: 'select',
      defaultValue: 'draft',
      required: true,
      options: ['draft', 'submitted', 'under_review', 'locked', 'verified'],
    },
    { name: 'lockedAt', type: 'date' },
    { name: 'lockedBy', type: 'text' },
    { name: 'verifiedAt', type: 'date' },
    { name: 'verifiedBy', type: 'text' },
    { name: 'sectorCode', type: 'text', defaultValue: 'CEMENT' },
    { name: 'gwpSet', type: 'text', defaultValue: 'AR6' },
    { name: 'grossScope1Tonnes', type: 'number', defaultValue: 0 },
    { name: 'biomassMemoTonnes', type: 'number', defaultValue: 0 },
    { name: 'supportingScope2Tonnes', type: 'number', defaultValue: 0 },
    { name: 'supportingScope3Tonnes', type: 'number', defaultValue: 0 },
    { name: 'inputPayload', type: 'json', required: true },
    { name: 'result', type: 'json' },
    { name: 'calculationTrace', type: 'json' },
    { name: 'factorSnapshots', type: 'json' },
    { name: 'calculatedAt', type: 'date' },
  ],
}
