#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$HOME/.config/mint-ags-backup-$(date +%Y%m%d-%H%M%S)"

echo "======================================"
echo " Instalador Mint AGS Floating Panel"
echo "======================================"
echo

echo "[1/7] Comprobando dependencias..."

missing=()

for cmd in ags wmctrl xprop pamixer brightnessctl nmcli bluetoothctl curl zenity plank python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        missing+=("$cmd")
    fi
done

if [ "${#missing[@]}" -gt 0 ]; then
    echo
    echo "Faltan estas dependencias:"
    printf ' - %s\n' "${missing[@]}"
    echo
    echo "Instálalas antes de continuar."
    exit 1
fi

echo "[2/7] Creando copias de seguridad..."

mkdir -p "$BACKUP_DIR"

if [ -d "$HOME/.config/ags" ]; then
    cp -a "$HOME/.config/ags" "$BACKUP_DIR/ags"
fi

if [ -f "$HOME/.config/autostart/plank-delayed.desktop" ]; then
    cp -a \
        "$HOME/.config/autostart/plank-delayed.desktop" \
        "$BACKUP_DIR/"
fi

for f in \
    ags-theme \
    ags-audio-apps \
    plank-fix-ags \
    miku-launcher \
    miku-launcher-toggle
do
    if [ -f "$HOME/.local/bin/$f" ]; then
        cp -a "$HOME/.local/bin/$f" "$BACKUP_DIR/"
    fi
done

echo "[3/7] Instalando configuración de AGS..."

mkdir -p "$HOME/.config/ags"

cp -a "$ROOT/ags/." "$HOME/.config/ags/"

echo "[4/7] Instalando launcher y scripts..."

mkdir -p "$HOME/.local/bin"

cp "$ROOT/launcher/miku-launcher" \
   "$HOME/.local/bin/miku-launcher"

cp "$ROOT/scripts/ags-theme" \
   "$HOME/.local/bin/ags-theme"

cp "$ROOT/scripts/ags-audio-apps" \
   "$HOME/.local/bin/ags-audio-apps"

cp "$ROOT/scripts/plank-fix-ags" \
   "$HOME/.local/bin/plank-fix-ags"

cp "$ROOT/scripts/miku-launcher-toggle" \
   "$HOME/.local/bin/miku-launcher-toggle"

chmod +x \
    "$HOME/.local/bin/miku-launcher" \
    "$HOME/.local/bin/ags-theme" \
    "$HOME/.local/bin/ags-audio-apps" \
    "$HOME/.local/bin/plank-fix-ags" \
    "$HOME/.local/bin/miku-launcher-toggle"

echo "[5/7] Configurando autostart..."

mkdir -p "$HOME/.config/autostart"

cp "$ROOT/autostart/plank-delayed.desktop" \
   "$HOME/.config/autostart/plank-delayed.desktop"

# Evita una segunda entrada de Plank que pueda provocar
# el problema de Aylur/BAMF durante el arranque.
if [ -f "$HOME/.config/autostart/plank.desktop" ]; then
    mv \
        "$HOME/.config/autostart/plank.desktop" \
        "$HOME/.config/autostart/plank.desktop.disabled"
fi

echo "[6/7] Configurando tema inicial..."

"$HOME/.local/bin/ags-theme" miku 2>/dev/null || true

echo "[7/7] Reiniciando AGS y Plank..."

pkill -f '/usr/local/bin/ags' 2>/dev/null || true
killall plank 2>/dev/null || true

sleep 1

nohup ags >/tmp/ags.log 2>&1 &

sleep 1

nohup "$HOME/.local/bin/plank-fix-ags" \
    >/tmp/plank-fix-ags.log 2>&1 &

echo
echo "======================================"
echo " Instalación completada"
echo "======================================"
echo
echo "Backup:"
echo "$BACKUP_DIR"
echo
echo "Si el panel no aparece inmediatamente,"
echo "cierra sesión y vuelve a entrar."
