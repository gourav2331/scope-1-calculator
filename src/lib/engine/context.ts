import { FactorResolver } from './factors'
import type { GwpSet, TraceEntry, ValidationMessage } from './types'

/** Shared mutable context threaded through every calculation module. */
export class EngineContext {
  resolver: FactorResolver
  warnings: ValidationMessage[] = []
  errors: ValidationMessage[] = []
  trace: TraceEntry[] = []
  defaultsUsed: Set<string> = new Set()
  fallbacksApplied: Set<string> = new Set()
  gwpSet: GwpSet

  constructor(resolver: FactorResolver, gwpSet: GwpSet) {
    this.resolver = resolver
    this.gwpSet = gwpSet
  }

  warn(code: string, message: string, fieldPath?: string): void {
    this.warnings.push({ code, severity: 'WARNING', message, fieldPath })
  }

  error(code: string, message: string, fieldPath?: string): void {
    this.errors.push({ code, severity: 'ERROR', message, fieldPath })
  }

  addTrace(entry: TraceEntry): void {
    this.trace.push(entry)
  }
}
