import { defineConfig } from 'reactive-vscode'
import { scopedConfigs } from './meta'
import type { NestedScopedConfigs } from './meta'

/**
 * Reactive VS Code configuration accessor scoped to this extension.
 */
export const config = defineConfig<NestedScopedConfigs>(scopedConfigs.scope)
