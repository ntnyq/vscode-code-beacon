import { Diagnostic, DiagnosticSeverity } from 'vscode'
import type { BeaconAnnotation, BeaconSeverity } from '../../types/annotation'
import { toVscodeRange } from '../../utils/ranges'

/**
 * Problems integration mode from Code Beacon configuration.
 */
export type BeaconDiagnosticsMode = 'off' | 'openFiles' | 'workspace'

/**
 * Diagnostic source label shown in the VS Code Problems panel.
 */
const DIAGNOSTIC_SOURCE = 'Code Beacon'

/**
 * Maps Code Beacon severity values to VS Code diagnostic severities.
 */
export function diagnosticSeverityForBeacon(
  severity: BeaconSeverity,
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
  annotation: BeaconAnnotation,
): DiagnosticSeverity {
  return diagnosticSeverityForBeacon(
    annotation.diagnostics?.severity ?? annotation.severity,
  )
}

/**
 * Checks whether an annotation should be published as a diagnostic.
 */
function isDiagnosticEnabled(annotation: BeaconAnnotation): boolean {
  return (
    annotation.diagnostics?.enabled !== false &&
    !annotation.resolved &&
    !annotation.ignored
  )
}

/**
 * Creates a VS Code diagnostic for one beacon annotation.
 */
export function createBeaconDiagnostic(
  annotation: BeaconAnnotation,
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
  annotations: readonly BeaconAnnotation[],
  mode: BeaconDiagnosticsMode,
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
      createBeaconDiagnostic(annotation),
    ])
  }

  return diagnosticsByUri
}
