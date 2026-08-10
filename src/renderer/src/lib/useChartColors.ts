import { useMemo } from 'react'
import { useApp } from '../stores/app'

/** Lee las variables CSS de tema y las devuelve como colores hsl() usables por Recharts. */
export function useChartColors() {
  const theme = useApp((s) => s.theme)
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement)
    const v = (name: string) => `hsl(${css.getPropertyValue(name).trim()})`
    return {
      primary: v('--primary'),
      success: v('--success'),
      warning: v('--warning'),
      destructive: v('--destructive'),
      muted: v('--muted-foreground'),
      foreground: v('--foreground'),
      border: v('--border')
    }
  }, [theme])
}
