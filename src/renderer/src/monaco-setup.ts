// Configura Monaco para funcionar de forma offline (sin CDN) dentro de Electron.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import { conf as rubyConf, language as rubyLanguage } from 'monaco-editor/esm/vs/basic-languages/ruby/ruby'
import { conf as yamlConf, language as yamlLanguage } from 'monaco-editor/esm/vs/basic-languages/yaml/yaml'

// Solo cargamos el núcleo y los tokenizadores Ruby/YAML, en lugar de todos los
// lenguajes de Monaco. Ninguno de los dos requiere worker específico (no
// registramos el lenguaje "json", así que tampoco hace falta su worker).
self.MonacoEnvironment = {
  getWorker(_moduleId, _label) {
    return new editorWorker()
  }
}

for (const [id, conf, language] of [
  ['ruby', rubyConf, rubyLanguage],
  ['yaml', yamlConf, yamlLanguage]
] as const) {
  monaco.languages.register({ id })
  monaco.languages.setLanguageConfiguration(id, conf)
  monaco.languages.setMonarchTokensProvider(id, language)
}

loader.config({ monaco })
