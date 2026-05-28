/**
 * Per-category accumulation helpers. Re-exported from the O&G pack since
 * GasAmounts (the {co2, ch4, n2o, co2e, biogenicCO2} shape) is sector-agnostic.
 */

export { emptyGas, addGas, scaleGas, roundGas } from '../oilgas/helpers'
