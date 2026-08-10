// `lib/progress.ts` importa el store global, que lee el tema de localStorage al
// cargarse. Un stub mínimo evita arrastrar jsdom solo por esa línea.
const store = new Map<string, string>()
globalThis.localStorage = {
  get length() {
    return store.size
  },
  key: (i) => [...store.keys()][i] ?? null,
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear()
}
