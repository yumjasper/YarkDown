import { registerBootInfo } from './bootInfo'
import { registerFsHandlers } from './fs'
import { registerPathHandlers } from './paths'
import { registerRipgrepHandlers } from './ripgrep'
import { registerUploaderHandlers } from './uploader'
import { registerFontsHandlers } from './fonts'
import { registerShellHandlers } from './shell'
import { registerWindowHandlers } from './window'
import { registerCmdHandlers } from './cmd'
import { CommandManager } from '../commands'
import { registerI18nHandlers } from './i18n'
import { registerDialogHandlers } from './dialog'
import { registerDiagramHandlers } from './diagram'
import { registerPdfHandlers } from './pdf'
import { registerOpenCodeHandlers } from './opencode'

export const registerSandboxIpcHandlers = (): void => {
  registerBootInfo()
  registerFsHandlers()
  registerPathHandlers()
  registerRipgrepHandlers()
  registerUploaderHandlers()
  registerFontsHandlers()
  registerShellHandlers()
  registerWindowHandlers(CommandManager)
  registerCmdHandlers()
  registerI18nHandlers()
  registerDialogHandlers()
  registerDiagramHandlers()
  registerPdfHandlers()
  registerOpenCodeHandlers()
}
