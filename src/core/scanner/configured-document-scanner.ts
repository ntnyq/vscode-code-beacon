import type {
  AnnoPulseAnnotation,
  AnnoPulseRuleConfig,
} from '../../types/annotation'
import { normalizeRules } from '../rules/normalize'
import { scanDocument } from './scan-document'
import type { AnnoPulseScanResult } from './scan-document'

/**
 * Configuration captured for a reusable document scanner.
 */
export interface ConfiguredDocumentScannerOptions {
  readonly allowCustomRegex: boolean
  readonly commentOnly: boolean
  readonly maxFileSize: number
  readonly rules: readonly AnnoPulseRuleConfig[]
  readonly warn: (message: string) => void
}

/**
 * Source document input independent of the VS Code TextDocument API.
 */
export interface ConfiguredDocumentScanInput {
  readonly languageId: string
  readonly source: AnnoPulseAnnotation['source']
  readonly text: string
  readonly uri: string
}

/**
 * Reusable scanner built from one trusted configuration snapshot.
 */
export interface ConfiguredDocumentScanner {
  readonly scan: (input: ConfiguredDocumentScanInput) => AnnoPulseScanResult
}

/**
 * Normalizes rules once and applies the captured settings to document scans.
 */
export function createConfiguredDocumentScanner(
  options: ConfiguredDocumentScannerOptions,
): ConfiguredDocumentScanner {
  const normalizedRules = normalizeRules(options.rules, {
    allowCustomRegex: options.allowCustomRegex,
  })

  for (const error of normalizedRules.errors) {
    options.warn(`Rule ${error.ruleId}: ${error.message}`)
  }

  return {
    scan(input) {
      return scanDocument({
        ...input,
        commentOnly: options.commentOnly,
        maxFileSize: options.maxFileSize,
        rules: normalizedRules.rules,
      })
    },
  }
}
