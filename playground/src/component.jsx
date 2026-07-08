// oxlint-disable eslint/no-warning-comments -- Playground intentionally contains beacon keywords.

export function Banner({ title }) {
  // REVIEW: hover should show this annotation in JSX files
  const label = title || 'Welcome'

  return (
    <section>
      {/* TODO: add dismiss action */}
      <h1>{label}</h1>
    </section>
  )
}
