'use client'

import { useState } from 'react'

import { OilGasWizard } from '@/components/oilgas-wizard'
import { PulpPaperWizard } from '@/components/pulppaper-wizard'
import { Scope1Wizard } from '@/components/scope1-wizard'

export type Sector = 'cement' | 'oil_gas' | 'pulp_paper'

/**
 * Top-level shell that picks which sector wizard to render. Each wizard's
 * Step 1 sector grid switches between sectors via the `onSwitchSector` prop;
 * switching remounts the other wizard with fresh state.
 */
export function CalculatorRoot() {
  const [sector, setSector] = useState<Sector>('cement')
  if (sector === 'oil_gas') return <OilGasWizard onSwitchSector={setSector} />
  if (sector === 'pulp_paper') return <PulpPaperWizard onSwitchSector={setSector} />
  return <Scope1Wizard onSwitchSector={setSector} />
}
