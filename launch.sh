#!/usr/bin/env bash
# Lanzador fiable de Teutón GUI (build de producción).
# Uso: ./launch.sh
set -e
cd "$(dirname "$0")"

# Cierra instancias previas colgadas para evitar conflictos de puerto/ventana.
pkill -f "$(pwd)/node_modules/electron" 2>/dev/null || true

# Compila si no hay build o si el código fuente es más nuevo que ella. Antes solo
# miraba si el fichero existía, así que tras editar el código se relanzaba la
# versión vieja sin avisar.
if [ ! -f out/main/index.js ] || [ -n "$(find src package.json electron.vite.config.ts -newer out/main/index.js 2>/dev/null | head -1)" ]; then
  echo "Compilando…"
  npm run build
fi

# --no-sandbox: el binario de Electron instalado por npm no trae el sandbox
# setuid; sin esto puede fallar en algunos Linux. La app no carga contenido remoto.
exec ./node_modules/electron/dist/electron . --no-sandbox "$@"
