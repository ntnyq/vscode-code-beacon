import { defineLogger } from 'reactive-vscode'
import { displayName } from '../meta'

/**
 * Extension-scoped logger shown under the extension display name.
 */
export const logger = defineLogger(displayName)
