import { Diagnostic, DiagnosticSeverity } from 'vscode'
import type { BeaconAnnotation, BeaconSeverity } from '../../types/annotation'
import { toVscodeRange } from '../../utils/ranges'

const DIAGNOSTIC_SOURCE = 'Code Beacon'

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
