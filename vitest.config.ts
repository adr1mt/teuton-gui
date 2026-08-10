import { defineConfig } from 'vitest/config'

// Todo lo que se prueba son funciones puras + main/results.ts (que no importa
// electron), así que basta el entorno de node: sin jsdom ni React.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts']
  }
})
