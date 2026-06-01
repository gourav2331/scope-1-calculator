/**
 * Shared helpers for the Power Scope 1 engine.
 */

import type { GasAmounts } from './types'

export function emptyGas(): GasAmounts {
  return {
    co2Tonnes: 0,
    ch4Tonnes: 0,
    n2oTonnes: 0,
    sf6Tonnes: 0,
    hfcCO2eTonnes: 0,
    biogenicCO2Tonnes: 0,
    co2eTonnes: 0,
  }
}

export function addGas(a: GasAmounts, b: GasAmounts): GasAmounts {
  return {
    co2Tonnes: a.co2Tonnes + b.co2Tonnes,
    ch4Tonnes: a.ch4Tonnes + b.ch4Tonnes,
    n2oTonnes: a.n2oTonnes + b.n2oTonnes,
    sf6Tonnes: a.sf6Tonnes + b.sf6Tonnes,
    hfcCO2eTonnes: a.hfcCO2eTonnes + b.hfcCO2eTonnes,
    biogenicCO2Tonnes: a.biogenicCO2Tonnes + b.biogenicCO2Tonnes,
    co2eTonnes: a.co2eTonnes + b.co2eTonnes,
  }
}

export function scaleGas(g: GasAmounts, factor: number): GasAmounts {
  return {
    co2Tonnes: g.co2Tonnes * factor,
    ch4Tonnes: g.ch4Tonnes * factor,
    n2oTonnes: g.n2oTonnes * factor,
    sf6Tonnes: g.sf6Tonnes * factor,
    hfcCO2eTonnes: g.hfcCO2eTonnes * factor,
    biogenicCO2Tonnes: g.biogenicCO2Tonnes * factor,
    co2eTonnes: g.co2eTonnes * factor,
  }
}

export function roundGas(g: GasAmounts, dp = 4): GasAmounts {
  const r = (n: number) => Math.round(n * 10 ** dp) / 10 ** dp
  return {
    co2Tonnes: r(g.co2Tonnes),
    ch4Tonnes: r(g.ch4Tonnes),
    n2oTonnes: r(g.n2oTonnes),
    sf6Tonnes: r(g.sf6Tonnes),
    hfcCO2eTonnes: r(g.hfcCO2eTonnes),
    biogenicCO2Tonnes: r(g.biogenicCO2Tonnes),
    co2eTonnes: r(g.co2eTonnes),
  }
}
