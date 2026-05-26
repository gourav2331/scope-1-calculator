'use client'

import { useState } from 'react'

import { OilGasWizard } from '@/components/oilgas-wizard'
import { Scope1Wizard } from '@/components/scope1-wizard'

export type Sector = 'cement' | 'oil_gas'

/**
 * Top-level shell that picks which sector wizard to render. Each wizard's
 * Step 1 sector grid switches between sectors via the `onSwitchSector` prop;
 * switching remounts the other wizard with fresh state.
 */
export function CalculatorRoot() {
  const [sector, setSector] = useState<Sector>('cement')
  return sector === 'oil_gas' ? (
    <OilGasWizard onSwitchSector={setSector} />
  ) : (
    <Scope1Wizard onSwitchSector={setSector} />
  )
}
