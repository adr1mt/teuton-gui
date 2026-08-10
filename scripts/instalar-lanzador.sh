#!/usr/bin/env bash
# Crea el acceso directo de Teutón GUI en el menú de aplicaciones del sistema,
# con su icono, para no tener que abrir un terminal cada vez.
#
#   ./scripts/instalar-lanzador.sh              instala el acceso directo
#   ./scripts/instalar-lanzador.sh --desinstalar lo quita
set -e

REPO="$(cd "$(dirname "$0")/.." && pwd)"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/512x512/apps"
DESKTOP="$APPS/teuton-gui.desktop"
ICON="$ICONS/teuton-gui.png"

if [ "$1" = "--desinstalar" ]; then
  rm -f "$DESKTOP" "$ICON"
  update-desktop-database "$APPS" 2>/dev/null || true
  echo "Acceso directo eliminado."
  exit 0
fi

mkdir -p "$APPS" "$ICONS"
cp "$REPO/build/icon.png" "$ICON"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Teutón GUI
Comment=Corrige prácticas con Teutón y publica notas en Moodle
Exec=$REPO/launch.sh
Icon=teuton-gui
Terminal=false
Categories=Education;Development;
Keywords=teuton;evaluacion;notas;aula;
StartupWMClass=Teuton GUI
EOF

chmod +x "$DESKTOP"
update-desktop-database "$APPS" 2>/dev/null || true

echo "Listo. Busca «Teutón GUI» en el menú de aplicaciones."
echo "Consejo: arrástralo al escritorio o al panel para tenerlo a mano."
