import { describe, expect, it } from 'vitest'
import {
  automaticDocumentChangeScope,
  initialScanTarget,
} from '../src/core/scanner/scan-mode'

describe('scan mode behavior', () => {
  it('uses visible editors as the default automatic scan target', () => {
    expect(initialScanTarget('visibleEditors')).toBe('visibleEditors')
    expect(automaticDocumentChangeScope('visibleEditors')).toBe(
      'visibleEditors',
    )
  })

  it('scans all open text documents when openEditors mode is selected', () => {
    expect(initialScanTarget('openEditors')).toBe('openEditors')
    expect(automaticDocumentChangeScope('openEditors')).toBe('openEditors')
  })

  it('starts with a workspace scan but only updates open documents after edits', () => {
    expect(initialScanTarget('workspace')).toBe('workspace')
    expect(automaticDocumentChangeScope('workspace')).toBe('openEditors')
  })

  it('does not run automatic scans in manual mode', () => {
    expect(initialScanTarget('manual')).toBe('none')
    expect(automaticDocumentChangeScope('manual')).toBe('none')
  })
})
