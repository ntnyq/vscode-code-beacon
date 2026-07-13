/**
 * Prevents untrusted prompt data from closing XML-like framing delimiters.
 */
export function escapePromptPayload(
  value: string,
  closingDelimiters: readonly string[],
): string {
  let escapedValue = value

  for (const delimiter of closingDelimiters) {
    escapedValue = escapedValue.replaceAll(
      delimiter,
      `${String.raw`\u003c`}${delimiter.slice(1)}`,
    )
  }

  return escapedValue
}
