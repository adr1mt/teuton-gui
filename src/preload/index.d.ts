import type { TeutonApi } from '../shared/types'

declare global {
  interface Window {
    teuton: TeutonApi
  }
}

export {}
