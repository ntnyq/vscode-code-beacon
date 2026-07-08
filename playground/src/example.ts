// oxlint-disable eslint/no-warning-comments -- Playground intentionally contains beacon keywords.

export function calculateInvoiceTotal(items: readonly number[]): number {
  // TODO: handle discounts from account-level contracts
  const subtotal = items.reduce((total, item) => total + item, 0)

  // FIXME(alice): tax rounding differs from finance exports
  const tax = subtotal * 0.0825

  /*
   * SECURITY: validate invoice ownership before rendering details
   * REVIEW @ntnyq: decide whether this belongs in a service layer
   */
  return subtotal + tax
}

// NOTE: lowercase todo in strings should not match when commentOnly is enabled
export const debugMessage = 'TODO: this string should stay unhighlighted'
