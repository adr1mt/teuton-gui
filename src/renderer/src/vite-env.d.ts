/// <reference types="vite/client" />

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker
  }
  export default workerConstructor
}

declare module 'monaco-editor/esm/vs/basic-languages/ruby/ruby' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration
  export const language: import('monaco-editor').languages.IMonarchLanguage
}

declare module 'monaco-editor/esm/vs/basic-languages/yaml/yaml' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration
  export const language: import('monaco-editor').languages.IMonarchLanguage
}
