import { useDisposable } from 'reactive-vscode'
import { CodeLens, languages } from 'vscode'
import { config } from '../config'
import { createBeaconCodeLensCommands } from '../core/codelens/commands'
import { annotationStore } from '../core/store/annotation-store'
import { toVscodeRange } from '../utils/ranges'

/**
 * Registers CodeLens actions for beacon annotations.
 */
export function useBeaconCodeLens() {
  useDisposable(
    languages.registerCodeLensProvider(
      {
        scheme: 'file',
      },
      {
        provideCodeLenses(document) {
          if (!config.enable || !config.codelens.enabled) {
            return []
          }

          return annotationStore
            .getForUri(document.uri.toString())
            .flatMap(annotation =>
              createBeaconCodeLensCommands(annotation).map(
                command =>
                  new CodeLens(toVscodeRange(annotation.range), command),
              ),
            )
        },
      },
    ),
  )
}
