#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$HOME/.config/mint-ags-backup-$(date +%Y%m%d-%H%M%S)"

say() {
    printf '\n%s\n' "$*"
}

warn() {
    printf '\nAVISO: %s\n' "$*" >&2
}

die() {
    printf '\nERROR: %s\n' "$*" >&2
    exit 1
}

echo "======================================"
echo " Mint AGS Floating Panel - Instalador"
echo "======================================"

# ------------------------------------------------------------
# 1. Comprobación del entorno
# ------------------------------------------------------------

say "[1/8] Comprobando el sistema..."

if [ -r /etc/os-release ]; then
    . /etc/os-release
    DISTRO_NAME="${PRETTY_NAME:-${NAME:-desconocida}}"
else
    DISTRO_NAME="desconocida"
fi

echo "Distribución: $DISTRO_NAME"
echo "Escritorio:   ${XDG_CURRENT_DESKTOP:-desconocido}"
echo "Sesión:       ${XDG_SESSION_TYPE:-desconocida}"

if [ "${ID:-}" != "linuxmint" ]; then
    warn "Este proyecto fue preparado y probado para Linux Mint."
fi

case "${XDG_CURRENT_DESKTOP:-}" in
    *Cinnamon*|*cinnamon*) ;;
    *)
        warn "Este proyecto está pensado para Cinnamon."
        ;;
esac

if [ "${XDG_SESSION_TYPE:-}" != "x11" ]; then
    warn "La configuración usa funciones específicas de X11 (wmctrl, xprop y STRUT)."
    warn "En Wayland algunas funciones pueden no funcionar."
fi

# ------------------------------------------------------------
# 2. Dependencias
# ------------------------------------------------------------

say "[2/8] Comprobando dependencias..."

declare -A PKG_FOR_CMD=(
    [wmctrl]="wmctrl"
    [xprop]="x11-utils"
    [pamixer]="pamixer"
    [brightnessctl]="brightnessctl"
    [nmcli]="network-manager"
    [bluetoothctl]="bluez"
    [curl]="curl"
    [zenity]="zenity"
    [python3]="python3"
    [plank]="plank"
    [gsettings]="libglib2.0-bin"
)

missing_cmds=()
missing_pkgs=()

for cmd in wmctrl xprop pamixer brightnessctl nmcli bluetoothctl curl zenity python3 plank gsettings; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        missing_cmds+=("$cmd")
        missing_pkgs+=("${PKG_FOR_CMD[$cmd]}")
    fi
done

if ! command -v ags >/dev/null 2>&1; then
    echo
    echo "Falta AGS."
    echo "Este panel usa AGS 1.x y debe estar instalado antes de continuar."
    echo "Cuando 'ags' funcione desde una terminal, vuelve a ejecutar ./install.sh"
    exit 1
fi

# PyGObject/GTK3 para el launcher
if ! python3 - <<'PY' >/dev/null 2>&1
import gi
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk
PY
then
    missing_pkgs+=("python3-gi" "gir1.2-gtk-3.0")
fi

if [ "${#missing_cmds[@]}" -gt 0 ] || [ "${#missing_pkgs[@]}" -gt 0 ]; then
    # Elimina duplicados conservando un orden razonable.
    mapfile -t unique_pkgs < <(printf '%s\n' "${missing_pkgs[@]}" | awk 'NF && !seen[$0]++')

    echo
    echo "Faltan dependencias del sistema:"
    printf '  - %s\n' "${unique_pkgs[@]}"
    echo

    if command -v apt >/dev/null 2>&1; then
        read -r -p "¿Quieres instalarlas ahora con APT? [s/N]: " answer
        case "$answer" in
            s|S|si|SI|sí|Sí)
                sudo apt update
                sudo apt install -y "${unique_pkgs[@]}"
                ;;
            *)
                die "Instala las dependencias indicadas y vuelve a ejecutar el instalador."
                ;;
        esac
    else
        die "Instala las dependencias indicadas y vuelve a ejecutar el instalador."
    fi
fi

# ------------------------------------------------------------
# 3. Comprobación de los archivos del repositorio
# ------------------------------------------------------------

say "[3/8] Comprobando archivos del proyecto..."

required_files=(
    "ags/config.js"
    "ags/style.css"
    "ags/common.css"
    "launcher/miku-launcher"
    "scripts/ags-theme"
    "scripts/ags-audio-apps"
    "scripts/plank-fix-ags"
    "scripts/miku-launcher-toggle"
    "autostart/plank-delayed.desktop"
)

for file in "${required_files[@]}"; do
    [ -f "$ROOT/$file" ] || die "Falta $file en el repositorio."
done

# ------------------------------------------------------------
# 4. Backup
# ------------------------------------------------------------

say "[4/8] Creando copia de seguridad..."

mkdir -p "$BACKUP_DIR"

if [ -d "$HOME/.config/ags" ]; then
    cp -a "$HOME/.config/ags" "$BACKUP_DIR/ags"
fi

if [ -f "$HOME/.config/autostart/plank-delayed.desktop" ]; then
    cp -a "$HOME/.config/autostart/plank-delayed.desktop" "$BACKUP_DIR/"
fi

if [ -f "$HOME/.config/autostart/plank.desktop" ]; then
    cp -a "$HOME/.config/autostart/plank.desktop" "$BACKUP_DIR/"
fi

for f in ags-theme ags-audio-apps plank-fix-ags miku-launcher miku-launcher-toggle; do
    if [ -f "$HOME/.local/bin/$f" ]; then
        cp -a "$HOME/.local/bin/$f" "$BACKUP_DIR/"
    fi
done

echo "Backup: $BACKUP_DIR"

# ------------------------------------------------------------
# 5. AGS
# ------------------------------------------------------------

say "[5/8] Instalando AGS Floating Panel..."

mkdir -p "$HOME/.config/ags"
cp -a "$ROOT/ags/." "$HOME/.config/ags/"

# ------------------------------------------------------------
# 6. Launcher + scripts
# ------------------------------------------------------------

say "[6/8] Instalando launcher y scripts..."

mkdir -p "$HOME/.local/bin"

install -m 755 "$ROOT/launcher/miku-launcher"     "$HOME/.local/bin/miku-launcher"

for script in ags-theme ags-audio-apps plank-fix-ags miku-launcher-toggle; do
    install -m 755 "$ROOT/scripts/$script" "$HOME/.local/bin/$script"
done

# ------------------------------------------------------------
# 7. Autostart + tema
# ------------------------------------------------------------

say "[7/8] Configurando inicio automático..."

mkdir -p "$HOME/.config/autostart"

cp "$ROOT/autostart/plank-delayed.desktop"    "$HOME/.config/autostart/plank-delayed.desktop"

# Evita que Plank arranque antes de que las ventanas de AGS estén listas.
if [ -f "$HOME/.config/autostart/plank.desktop" ]; then
    mv "$HOME/.config/autostart/plank.desktop"        "$HOME/.config/autostart/plank.desktop.disabled"
fi

# Tema inicial. El nombre interno se conserva por compatibilidad.
"$HOME/.local/bin/ags-theme" miku >/dev/null 2>&1 || true

# ------------------------------------------------------------
# 8. Arranque
# ------------------------------------------------------------

say "[8/8] Iniciando panel..."

pkill -f '/usr/local/bin/ags' 2>/dev/null || true
killall plank 2>/dev/null || true

sleep 1
nohup ags >/tmp/ags.log 2>&1 &

# plank-fix-ags espera a que las 4 ventanas permanentes de AGS estén listas.
nohup "$HOME/.local/bin/plank-fix-ags"     >/tmp/plank-fix-ags.log 2>&1 &

echo
echo "======================================"
echo " Instalación completada"
echo "======================================"
echo
echo "Copia de seguridad:"
echo "  $BACKUP_DIR"
echo
echo "Launcher:"
echo "  $HOME/.local/bin/miku-launcher-toggle"
echo
echo "Para asignar una tecla al launcher:"
echo "  Configuración del sistema -> Teclado -> Atajos -> Atajos personalizados"
echo
echo "Comando:"
echo "  $HOME/.local/bin/miku-launcher-toggle"
echo
echo "Si quieres usar solamente la tecla Super, recuerda que Cinnamon"
echo "normalmente la reserva para su propio menú; cambia ese atajo desde"
echo "la configuración de Cinnamon antes de asignarlo al launcher."
echo
echo "Si algo no aparece correctamente, cierra sesión y vuelve a entrar."
