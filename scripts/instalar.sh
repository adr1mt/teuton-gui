#!/usr/bin/env bash
# Compila Teutón GUI como AppImage, lo deja en /mnt/datos y lo publica en el
# menú de aplicaciones con su icono. Es la forma normal de usar la app: se abre
# desde el menú, nunca desde el terminal.
#
#   ./scripts/instalar.sh               compila (si hace falta) e instala
#   ./scripts/instalar.sh --forzar      recompila aunque no haya cambios
#   ./scripts/instalar.sh --desinstalar quita la app del menú y borra el AppImage
#
# El ejecutable va a /mnt/datos y NO a la carpeta personal: la partición / está
# casi llena. Se puede cambiar el destino con TEUTON_GUI_DEST=/otra/ruta.
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${TEUTON_GUI_DEST:-/mnt/datos/Aplicaciones/TeutonGUI}"
# Nombre fijo, sin versión: así la ficha del menú nunca se queda apuntando a un
# AppImage viejo cuando se sube de versión.
APPIMAGE="$DEST/TeutonGUI.AppImage"

APPS="$HOME/.local/share/applications"
DESKTOP="$APPS/teuton-gui.desktop"
ICON_ROOT="$HOME/.local/share/icons/hicolor"

if [ "$1" = "--desinstalar" ]; then
  # La ruta real del ejecutable se lee de la propia ficha, así se borra el
  # AppImage correcto aunque esté en otro disco.
  if [ -f "$DESKTOP" ]; then
    instalado="$(sed -n 's/^Exec=//p' "$DESKTOP" | head -1)"
    if [ -n "$instalado" ] && [ -f "$instalado" ]; then
      rm -f "$instalado"
      rmdir "$(dirname "$instalado")" 2>/dev/null || true
    fi
  fi
  rm -f "$DESKTOP"
  rm -f "$ICON_ROOT"/*/apps/teuton-gui.png
  update-desktop-database "$APPS" 2>/dev/null || true
  echo "Teutón GUI eliminada del menú."
  exit 0
fi

cd "$REPO"
VERSION="$(node -p "require('./package.json').version")"
BUILT="$REPO/dist/Teuton-GUI-$VERSION.AppImage"

# Recompila si no hay AppImage o si el código es más nuevo que ella, para no
# instalar nunca una versión anterior a lo que hay en el repositorio.
if [ "$1" = "--forzar" ] || [ ! -f "$BUILT" ] || \
   [ -n "$(find src package.json electron.vite.config.ts build -newer "$BUILT" 2>/dev/null | head -1)" ]; then
  echo "Compilando el AppImage (tarda un par de minutos)…"
  npm run dist:linux
fi

mkdir -p "$DEST"
install -m 755 "$BUILT" "$APPIMAGE"

# El icono se instala por tamaños y la ficha lo llama por nombre, no por ruta.
for png in "$REPO"/build/icons/*.png; do
  size="$(basename "$png" .png)"
  mkdir -p "$ICON_ROOT/$size/apps"
  cp "$png" "$ICON_ROOT/$size/apps/teuton-gui.png"
done

mkdir -p "$APPS"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Teutón GUI
GenericName=Corrector de prácticas con Teutón
Comment=Corrige prácticas con Teutón y publica notas en Moodle
Exec=$APPIMAGE
Icon=teuton-gui
Categories=Education;
Keywords=teuton;evaluacion;notas;aula;
Terminal=false
StartupWMClass=Teuton GUI
EOF

chmod +x "$DESKTOP"
update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$ICON_ROOT" 2>/dev/null || true

echo "Instalada la versión $VERSION en $APPIMAGE"
echo "Busca «Teutón GUI» en el menú de aplicaciones."
