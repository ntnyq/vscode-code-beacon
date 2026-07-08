import { Diagnostic, DiagnosticSeverity } from 'vscode'
import type { BeaconAnnotation, BeaconSeverity } from '../../types/annotation'
import { toVscodeRange } from '../../utils/ranges'

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
    diagnosticSeverityForBeacon(annotation.severity),
  )

  diagnostic.source = DIAGNOSTIC_SOURCE

  return diagnostic
}
