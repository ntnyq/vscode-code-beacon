import { Diagnostic, DiagnosticSeverity } from 'vscode'
import type {
  AnnoPulseAnnotation,
  AnnoPulseSeverity,
} from '../../types/annotation'
import { toVscodeRange } from '../../utils/ranges'

/**
 * Problems integration mode from AnnoPulse configuration.
 */
export type AnnoPulseDiagnosticsMode = 'off' | 'openFiles' | 'workspace'

/**
 * Diagnostic source label shown in the VS Code Problems panel.
 */
const DIAGNOSTIC_SOURCE = 'AnnoPulse'

/**
 * Maps AnnoPulse severity values to VS Code diagnostic severities.
 */
export function diagnosticSeverityForAnnoPulse(
  severity: AnnoPulseSeverity,
): DiagnosticSeverity {
  const severities = {
    error: DiagnosticSeverity.Error,
    hint: DiagnosticSeverity.Hint,
    information: DiagnosticSeverity.Information,
    warning: DiagnosticSeverity.Warning,
  }

  return severities[severity]
}

/**
 * Resolves the diagnostic severity for an annotation after per-rule overrides.
 */
function diagnosticSeverityForAnnotation(
  annotation: AnnoPulseAnnotation,
): DiagnosticSeverity {
  return diagnosticSeverityForAnnoPulse(
    annotation.diagnostics?.severity ?? annotation.severity,
  )
}

/**
 * Checks whether an annotation should be published as a diagnostic.
 */
function isDiagnosticEnabled(annotation: AnnoPulseAnnotation): boolean {
  return (
    annotation.diagnostics?.enabled !== false &&
    !annotation.resolved &&
    !annotation.ignored
  )
}

/**
 * Creates a VS Code diagnostic for one AnnoPulse annotation.
 */
export function createAnnoPulseDiagnostic(
  annotation: AnnoPulseAnnotation,
): Diagnostic {
  const message = annotation.message
    ? `${annotation.keyword} ${annotation.message}`
    : annotation.keyword
  const diagnostic = new Diagnostic(
    toVscodeRange(annotation.range),
    message,
    diagnosticSeverityForAnnotation(annotation),
  )

  diagnostic.source = DIAGNOSTIC_SOURCE

  return diagnostic
}

/**
 * Groups diagnostics by URI while honoring the configured publication mode.
 */
export function diagnosticsByUriForAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  mode: AnnoPulseDiagnosticsMode,
  openUris: ReadonlySet<string> = new Set(),
): Map<string, Diagnostic[]> {
  const diagnosticsByUri = new Map<string, Diagnostic[]>()

  if (mode === 'off') {
    return diagnosticsByUri
  }

  for (const annotation of annotations) {
    if (!isDiagnosticEnabled(annotation)) {
      continue
    }

    if (mode === 'openFiles' && !openUris.has(annotation.uri)) {
      continue
    }

    diagnosticsByUri.set(annotation.uri, [
      ...(diagnosticsByUri.get(annotation.uri) ?? []),
      createAnnoPulseDiagnostic(annotation),
    ])
  }

  return diagnosticsByUri
}
