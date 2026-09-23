import App from "resource:///com/github/Aylur/ags/app.js";
import Widget from "resource:///com/github/Aylur/ags/widget.js";
import Variable from "resource:///com/github/Aylur/ags/variable.js";
import * as Utils from "resource:///com/github/Aylur/ags/utils.js";


import Gdk from "gi://Gdk?version=3.0";
import GdkX11 from "gi://GdkX11?version=3.0";
import GLib from "gi://GLib";

const run = cmd => Utils.execAsync(["bash", "-lc", cmd]).catch(err => print(err));
const shq = str => "'" + String(str).replace(/'/g, "'\\''") + "'";

const volume = Variable(0, {
    poll: [3000, ["bash", "-lc", "pamixer --get-volume 2>/dev/null || echo 0"], out => Number(out.trim()) || 0],
});

const brightness = Variable(0, {
    poll: [3000, ["bash", "-lc", "brightnessctl -m 2>/dev/null | awk -F, '{gsub(/%/,\"\",$4); print $4}' || echo 0"], out => Number(out.trim()) || 0],
});

const showWifiPanel = Variable(false);

const showBluetoothPanel = Variable(false);
const showAudioPanel = Variable(false);
const showSessionPanel = Variable(false);
const showCalendarPanel = Variable(false);
const showWeatherPanel = Variable(false);

const wifi = Variable("?", {
    poll: [5000, ["bash", "-lc", "nmcli radio wifi 2>/dev/null || echo unknown"], out => out.trim()],
});
const clock = Variable("", {
    poll: [
        1000,
        [
            "bash",
            "-lc",
            "LC_TIME=es_EC.UTF-8 date '+%a %d %b  %H:%M'"
        ],
        out => out.trim(),
    ],
});
const animatePopupResize = (name, duration = 420) => {
    const start = Date.now();

    const tick = () => {
        const win = App.getWindow(name);

        if (!win)
            return false;

        const child = win.get_child();

        if (!child)
            return false;

        // Fuerza a GTK a recalcular el tamaño natural
        child.queue_resize();
        win.queue_resize();

        const [minimumHeight, naturalHeight] =
            child.get_preferred_height();

        const [width] = win.get_size();

        // Seguimos en cada frame la altura que va produciendo el Revealer
        win.resize(
            width,
            Math.max(1, naturalHeight)
        );

        if (Date.now() - start < duration + 80) {
            Utils.timeout(16, tick);
        }

        return false;
    };

    // Dejamos que el Revealer empiece a cambiar antes del primer frame
    Utils.timeout(10, tick);
};
const closePopupAnimated = (name, revealVariable, duration = 320) => {
    const win = App.getWindow(name);

    if (!win?.visible)
        return;

    revealVariable.value = false;

    animatePopupResize(name, duration);

    Utils.timeout(duration + 40, () => {
        const current = App.getWindow(name);

        if (current?.visible && !revealVariable.value)
            App.closeWindow(name);

        return false;
    });
};
const activeSsid = Variable("Sin red", {
    poll: [
        3000,
        [
            "bash",
            "-lc",
            "LC_ALL=C nmcli -t -f IN-USE,SSID dev wifi 2>/dev/null | awk -F: '$1==\"*\" {print substr($0,3); exit}'"
        ],
        out => out.trim() || "Sin red",
    ],
});

const wifiSignal = Variable(0, {
    poll: [
        3000,
        [
            "bash",
            "-lc",
            "LC_ALL=C nmcli -t -f IN-USE,SIGNAL dev wifi 2>/dev/null | awk -F: '$1==\"*\" {print $2; exit}'"
        ],
        out => Number(out.trim()) || 0,
    ],
});

const bluetooth = Variable("?", {
    poll: [5000, ["bash", "-lc", "bluetoothctl show 2>/dev/null | awk -F': ' '/Powered/ {print $2}' || echo no"], out => out.trim()],
});

const batteryStatus = Variable("Unknown", {
    poll: [
        5000,
        [
            "bash",
            "-lc",
            "cat /sys/class/power_supply/BAT*/status 2>/dev/null | head -n1 || echo Unknown"
        ],
        out => out.trim(),
    ],
});
const battery = Variable(0, {
    poll: [
        5000,
        [
            "bash",
            "-lc",
            "cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -n1 || echo 0"
        ],
        out => Number(out.trim()) || 0,
    ],
});

const batteryDisplay = Variable(" --%", {
    poll: [
        5000,
        [
            "bash",
            "-lc",
            `
capacity=$(cat /sys/class/power_supply/BAT*/capacity 2>/dev/null | head -n1)
status=$(cat /sys/class/power_supply/BAT*/status 2>/dev/null | head -n1)

[ -z "$capacity" ] && capacity=0

if [ "$status" = "Charging" ]; then
    echo " $capacity%"
elif [ "$capacity" -ge 90 ]; then
    echo " $capacity%"
elif [ "$capacity" -ge 70 ]; then
    echo " $capacity%"
elif [ "$capacity" -ge 45 ]; then
    echo " $capacity%"
elif [ "$capacity" -ge 20 ]; then
    echo " $capacity%"
else
    echo " $capacity%"
fi
`
        ],
        out => out.trim(),
    ],
});

const networks = Variable("", {
    poll: [8000, ["bash", "-lc", "nmcli -t --escape no -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list --rescan yes 2>/dev/null | awk -F: '$2 != \"\" && !seen[$2]++ {print $1 \"|\" $2 \"|\" $3 \"|\" $4}' | head -n 8"]],
});

const bluetoothListCommand = `
bluetoothctl devices | while read -r _ mac name; do
    [ -z "$mac" ] && continue
    info=$(bluetoothctl info "$mac" 2>/dev/null)
    paired=$(echo "$info" | awk -F': ' '/Paired/ {print $2}')
    connected=$(echo "$info" | awk -F': ' '/Connected/ {print $2}')
    trusted=$(echo "$info" | awk -F': ' '/Trusted/ {print $2}')
    printf "%s|%s|%s|%s|%s\\n" "$mac" "$name" "$paired" "$connected" "$trusted"
done | head -n 8
`;

const bluetoothDevices = Variable("", {
    poll: [10000, ["bash", "-lc", bluetoothListCommand]],
});

const audioListCommand = "$HOME/.local/bin/ags-audio-apps";

const showWifiList = Variable(false);
const showBluetoothList = Variable(false);

const showAudioList = Variable(false);
const showPowerModes = Variable(false);
const showThemeList = Variable(false);

const audioApps = Variable("");

const powerProfile = Variable("unknown", {
    poll: [5000, ["bash", "-lc", "powerprofilesctl get 2>/dev/null || echo unsupported"], out => out.trim()],
});

const shrinkPanel = () => {
    const duration = 320;
    const interval = 16;
    const start = Date.now();

    const tick = () => {
        const win = App.getWindow("quickpanel");

        if (win) {
            win.queue_resize();
            win.resize(1, 1);
        }

        if (Date.now() - start < duration) {
            Utils.timeout(interval, tick);
        }
    };

    tick();
};


const closeQuickPanel = () => {
    App.closeWindow("quickpanel");
};

const toggleQuickPanelIsland = () => {
    const panel = App.getWindow("quickpanel");

    if (panel?.visible) {
        closeQuickPanel();
        return;
    }

    refreshAudioApps();
    refreshNetworks();
    refreshBluetoothDevices();

    App.openWindow("quickpanel");
};

const refreshAudioApps = () => {
    Utils.execAsync(["bash", "-lc", audioListCommand])
        .then(out => audioApps.value = out)
        .catch(err => print(err));
};

const toggleAudioList = () => {
    showAudioList.value = !showAudioList.value;

    if (showAudioList.value) {
        showWifiList.value = false;
        showBluetoothList.value = false;
        showPowerModes.value = false;

        refreshAudioApps();
    }

    animatePopupResize("audiopanel", 420);
};
const togglePowerModes = () => {
    showPowerModes.value = !showPowerModes.value;

    if (showPowerModes.value) {
        showWifiList.value = false;
        showBluetoothList.value = false;
        showAudioList.value = false;
    }

    animatePopupResize("audiopanel", 420);
};
const toggleThemeList = () => {
    showThemeList.value = !showThemeList.value;

    if (showThemeList.value) {
        showWifiList.value = false;
        showBluetoothList.value = false;
        showAudioList.value = false;
        showPowerModes.value = false;
    }

    const session = App.getWindow("sessionpanel");

    if (session?.visible) {
        animatePopupResize("sessionpanel", 320);
    } else if (!showThemeList.value) {
        // Mantiene el comportamiento del QuickPanel antiguo.
        shrinkPanel();
    }
};

const applyTheme = theme => {
    const stylePath = `${AGS_DIR}/style.css`;

    Utils.execAsync(["bash", "-lc", `ags-theme ${shq(theme)}`])
        .then(() => {
            // Carga el CSS nuevo sin cerrar AGS: los paneles permanecen abiertos.
            App.applyCss(stylePath);

            // Tras finalizar la transición limpiamos proveedores antiguos
            // y dejamos solo el tema actual, sin reiniciar ninguna ventana.
            Utils.timeout(700, () => {
                App.resetCss();
                App.applyCss(stylePath);
                return false;
            });
        })
        .catch(err => print(err));
};
const setPowerProfile = profile => {
    run(`powerprofilesctl set ${profile}`);

    Utils.timeout(500, () => {
        Utils.execAsync(["bash", "-lc", "powerprofilesctl get 2>/dev/null || echo unsupported"])
            .then(out => powerProfile.value = out.trim())
            .catch(err => print(err));
    });

};

const refreshNetworks = () => {
    run("nmcli dev wifi rescan");

    Utils.timeout(1200, () => {
        Utils.execAsync(["bash", "-lc", "nmcli -t --escape no -f IN-USE,SSID,SIGNAL,SECURITY dev wifi list --rescan yes 2>/dev/null | awk -F: '$2 != \"\" && !seen[$2]++ {print $1 \"|\" $2 \"|\" $3 \"|\" $4}' | head -n 8"])
            .then(out => networks.value = out)
            .catch(err => print(err));
    });
};

const toggleWifiPower = () => {
    Utils.execAsync(["bash", "-lc", "nmcli radio wifi 2>/dev/null || echo unknown"])
        .then(out => {
            const state = out.trim();

            if (state === "enabled") {
                networks.value = "";
                run("nmcli radio wifi off");
            } else {
                run("nmcli radio wifi on");
                Utils.timeout(1500, refreshNetworks);
            }

            Utils.timeout(700, () => {
                Utils.execAsync(["bash", "-lc", "nmcli radio wifi 2>/dev/null || echo unknown"])
                    .then(out => wifi.value = out.trim())
                    .catch(err => print(err));
            });
        })
        .catch(err => print(err));
};

const refreshBluetoothDevices = () => {
    run("bluetoothctl show | grep -q 'Powered: yes' && timeout 5s bluetoothctl scan on >/dev/null 2>&1 || true");

    Utils.timeout(5200, () => {
        Utils.execAsync(["bash", "-lc", bluetoothListCommand])
            .then(out => bluetoothDevices.value = out)
            .catch(err => print(err));
    });
};

const toggleWifiList = () => {
    showWifiList.value = !showWifiList.value;

    if (showWifiList.value) {
        showBluetoothList.value = false;
        refreshNetworks();
    } else {
        shrinkPanel();
    }
};

const toggleBluetoothPower = () => {
    run(
        "bluetoothctl power $( [ \"$(bluetoothctl show | awk -F': ' '/Powered/ {print $2}')\" = yes ] && echo off || echo on )"
    );
};

const toggleBluetoothList = () => {
    showBluetoothList.value = !showBluetoothList.value;

    if (showBluetoothList.value) {
        showWifiList.value = false;
        refreshBluetoothDevices();
    } else {
        shrinkPanel();
    }
};

const connectWifi = (ssid, security) => {
    if (!ssid)
        return;

    if (security && security !== "--") {
        const cmd = `
ssid=${shq(ssid)}
pass=$(zenity --entry --title="Wi-Fi" --text="Contraseña para ${ssid.replace(/"/g, '\\"')}" --hide-text 2>/dev/null)
if [ -n "$pass" ]; then
    nmcli dev wifi connect "$ssid" password "$pass"
fi
`;
        run(cmd);
    } else {
        run(`nmcli dev wifi connect ${shq(ssid)}`);
    }
};

const connectBluetooth = (mac, connected) => {
    if (!mac)
        return;

    if (connected === "yes") {
        run(`bluetoothctl disconnect ${shq(mac)}`);
    } else {
        run(`rfkill unblock bluetooth 2>/dev/null; bluetoothctl power on; bluetoothctl trust ${shq(mac)}; timeout 10s bluetoothctl pair ${shq(mac)} || true; bluetoothctl connect ${shq(mac)}`);
    }

    Utils.timeout(1500, refreshBluetoothDevices);
};

const QuickButton = (label, action) => Widget.Button({
    class_name: "quick-button",
    onClicked: () => {
        if (typeof action === "function")
            action();
        else
            run(action);
    },
    child: Widget.Label({
        label,
        xalign: 0,
    }),
});

const PowerButton = (label, action) => Widget.Button({
    class_name: "quick-button power-button",
    hexpand: true,

    onClicked: () => {
        if (typeof action === "function")
            action();
        else
            run(action);
    },

    child: Widget.Label({
        label,
        xalign: 0.5,
        hexpand: true,
    }),
});

const ToggleButton = (label, action, variable, activeValue) => Widget.Button({
    class_name: variable.bind().as(v => {
        return v === activeValue ? "quick-button quick-button-on" : "quick-button";
    }),

    onClicked: () => {
        if (typeof action === "function")
            action();
        else
            run(action);
    },

    child: Widget.Label({
        label,
        xalign: 0.5,
        hexpand: true,
    }),
});


const SliderRow = (icon, title, variable, command, minValue = 0) => Widget.Box({
    class_name: "slider-row",
    vertical: true,
    spacing: 7,
    children: [
        Widget.Box({
            children: [
                Widget.Label({
                    class_name: "slider-title",
                    label: `${icon}  ${title}`,
                    xalign: 0,
                    hexpand: true,
                }),
                Widget.Label({
                    class_name: "slider-value",
                    label: variable.bind().as(v => `${Math.round(Number(v) || 0)}%`),
                    xalign: 1,
                }),
            ],
        }),

        Widget.Slider({
            class_name: "slider",
            min: minValue,
            max: 100,
            value: variable.bind(),
            hexpand: true,
            onChange: ({ value }) => {
                const v = Math.max(minValue, Math.round(value));
                run(command(v));
            },
        }),
    ],
});

const AudioAppRow = line => {
    const [id, name, vol] = line.split("|");
    const volumeValue = Math.min(100, Math.max(0, Number(vol) || 0));

    return Widget.Box({
        class_name: "audio-row",
        vertical: true,
        spacing: 6,
        children: [
            Widget.Box({
                children: [
                    Widget.Label({
                        label: name || `Audio ${id}`,
                        xalign: 0,
                        hexpand: true,
                        truncate: "end",
                    }),
                    Widget.Label({
                        label: `${volumeValue}%`,
                        xalign: 1,
                    }),
                ],
            }),

            Widget.Slider({
                class_name: "slider",
                min: 0,
                max: 100,
                value: volumeValue,
                hexpand: true,
                onChange: ({ value }) => {
                    const v = Math.round(value);
                    run(`pactl set-sink-input-volume ${id} ${v}%`);
                },
            }),
        ],
    });
};

const AudioAppList = () => Widget.Box({
    class_name: "audio-list",
    vertical: true,
    spacing: 7,
    children: audioApps.bind().as(out => {
        const lines = out.trim().split("\n").filter(Boolean);

        if (lines.length === 0) {
            return [
                Widget.Label({
                    class_name: "audio-empty",
                    label: "No hay aplicaciones reproduciendo audio",
                    xalign: 0,
                }),
            ];
        }

        return lines.map(AudioAppRow);
    }),
});

const weather = Variable("Unknown|--°", {
    poll: [
        900000,
        [
            "bash",
            "-lc",
            "curl -fsS --max-time 8 'https://wttr.in/Quito?format=%C|%t' 2>/dev/null || echo 'Unknown|--°'"
        ],
        out => out.trim(),
    ],
});

const weatherDetailsCommand =
    "curl -fsS --max-time 8 'https://wttr.in/Quito?lang=es&format=%C|%t|%f|%h|%w|%p' 2>/dev/null || echo 'Sin datos|--°|--°|--|--|--'";

const weatherDetails = Variable("Sin datos|--°|--°|--|--|--", {
    poll: [
        900000,
        ["bash", "-lc", weatherDetailsCommand],
        out => out.trim() || "Sin datos|--°|--°|--|--|--",
    ],
});

const refreshWeather = () => {
    Utils.execAsync(["bash", "-lc", weatherDetailsCommand])
        .then(out => weatherDetails.value = out.trim() || "Sin datos|--°|--°|--|--|--")
        .catch(err => print(err));
};

const AudioSliderRow = () => Widget.Box({
    vertical: true,
    spacing: 8,
    children: [
        Widget.Box({
            class_name: "slider-row",
            vertical: true,
            spacing: 7,
            children: [
                Widget.Box({
                    children: [
Widget.Box({
    hexpand: true,
    spacing: 6,
    children: [
        Widget.Label({
            class_name: "slider-title",
            label: " Volumen",
            xalign: 0,
        }),
        Widget.Button({
            class_name: "expand-arrow-button",
            onClicked: toggleAudioList,
            child: Widget.Label({
                class_name: "expand-arrow-label",
                label: showAudioList.bind().as(v => v ? "▴" : "▾"),
            }),
        }),
    ],
}),
Widget.Label({
    class_name: "slider-value",
    label: volume.bind().as(v => `${Math.round(Number(v) || 0)}%`),
}),

                    ],
                }),

                Widget.Slider({
                    class_name: "slider",
                    min: 0,
                    max: 100,
                    value: volume.bind(),
                    hexpand: true,
                    onChange: ({ value }) => {
                        const v = Math.round(value);
                        run(`pamixer --set-volume ${v}`);
                    },
                }),
            ],
        }),

        Widget.Revealer({
            revealChild: showAudioList.bind(),
            transition: "slide_down",
            transitionDuration: 420,
            child: Widget.Box({
                class_name: "audio-section",
                vertical: true,
                spacing: 8,
                children: [
                    Widget.Box({
                        children: [
                            Widget.Label({
                                class_name: "section-title",
                                label: "Aplicaciones con audio",
                                xalign: 0,
                                hexpand: true,
                            }),
                            Widget.Button({
                                class_name: "small-button",
                                onClicked: refreshAudioApps,
                                child: Widget.Label({
                                    label: "Actualizar",
                                }),
                            }),
                        ],
                    }),

                    AudioAppList(),
                ],
            }),
        }),
    ],
});

const PowerModeButton = (label, profile) => Widget.Button({
    class_name: powerProfile.bind().as(v => {
        return v === profile ? "mode-button mode-active" : "mode-button";
    }),

    onClicked: () => setPowerProfile(profile),

    child: Widget.Label({
        label,
        xalign: 0.5,
        hexpand: true,
    }),
});

const BrightnessPowerRow = () => Widget.Box({
    vertical: true,
    spacing: 8,
    children: [
        Widget.Box({
            class_name: "slider-row",
            vertical: true,
            spacing: 7,
            children: [
                Widget.Box({
                    children: [
 Widget.Box({
    hexpand: true,
    children: [
        Widget.Label({
            class_name: "slider-title",
            label: "☀ Brillo",
            xalign: 0,
        }),
        Widget.Button({
            class_name: "expand-arrow-button",
            onClicked: togglePowerModes,
            child: Widget.Label({
                class_name: "expand-arrow-label",
                label: showPowerModes.bind().as(v => v ? "▴" : "▾"),
            }),
        }),
    ],
}),
Widget.Label({
    class_name: "slider-value",
    label: brightness.bind().as(v => `${Math.round(Number(v) || 0)}%`),
}),

                    ],
                }),

                Widget.Slider({
                    class_name: "slider",
                    min: 2,
                    max: 100,
                    value: brightness.bind(),
                    hexpand: true,
                    onChange: ({ value }) => {
                        const v = Math.max(2, Math.round(value));
                        run(`brightnessctl set ${v}%`);
                    },
                }),
            ],
        }),

        Widget.Revealer({
            revealChild: showPowerModes.bind(),
            transition: "slide_down",
            transitionDuration: 420,
            child: Widget.Box({
                class_name: "mode-section",
                vertical: true,
                spacing: 8,
                children: [
                    Widget.Box({
                        children: [
                            Widget.Label({
                                class_name: "section-title",
                                label: "Modo de energía",
                                xalign: 0,
                                hexpand: true,
                            }),
                        ],
                    }),

                    Widget.Box({
                        class_name: "mode-grid",
                        homogeneous: true,
                        spacing: 8,
                        children: [
                            PowerModeButton("  Ahorro", "power-saver"),
                            PowerModeButton("  Balanceado", "balanced"),
                        ],
                    }),

                    Widget.Box({
                        class_name: "mode-grid",
                        homogeneous: true,
                        spacing: 8,
                        children: [
                            PowerModeButton("  Rendimiento", "performance"),
                        ],
                    }),
                ],
            }),
        }),
    ],
});

const InfoRow = (title, value) => Widget.Box({
    class_name: "info-row",
    children: [
        Widget.Label({
            class_name: "info-title",
            label: title,
            xalign: 0,
            hexpand: true,
        }),
        Widget.Label({
            class_name: "info-value",
            label: value,
            xalign: 1,
        }),
    ],
});

const WifiRow = line => {
    const [inuse, ssid, signal, security] = line.split("|");

    return Widget.Button({
        class_name: inuse === "*" ? "wifi-row wifi-active" : "wifi-row",
        onClicked: () => connectWifi(ssid, security),
        child: Widget.Box({
            children: [
                Widget.Label({
                    label: `${inuse === "*" ? "●" : "○"}  ${ssid}`,
                    xalign: 0,
                    hexpand: true,
                    truncate: "end",
                }),
                Widget.Label({
                    label: `${signal || "?"}%`,
                    xalign: 1,
                }),
            ],
        }),
    });
};

const WifiList = () => Widget.Box({
    class_name: "wifi-list",
    vertical: true,
    spacing: 6,
    children: networks.bind().as(out => {
        const lines = out.trim().split("\n").filter(Boolean);

        if (lines.length === 0) {
            return [
                Widget.Label({
                    class_name: "wifi-empty",
                    label: "No se encontraron redes Wi-Fi",
                    xalign: 0,
                }),
            ];
        }

        return lines.map(WifiRow);
    }),
});

const BluetoothRow = line => {
    const [mac, name, paired, connected, trusted] = line.split("|");

    const statusIcon = connected === "yes" ? "●" : paired === "yes" ? "◐" : "○";
    const statusText = connected === "yes" ? "Conectado" : paired === "yes" ? "Emparejado" : "Nuevo";

    return Widget.Button({
        class_name: connected === "yes" ? "bt-row bt-active" : "bt-row",
        onClicked: () => connectBluetooth(mac, connected),
        child: Widget.Box({
            children: [
                Widget.Label({
                    label: `${statusIcon}  ${name || mac}`,
                    xalign: 0,
                    hexpand: true,
                    truncate: "end",
                }),
                Widget.Label({
                    label: statusText,
                    xalign: 1,
                }),
            ],
        }),
    });
};

const BluetoothList = () => Widget.Box({
    class_name: "bt-list",
    vertical: true,
    spacing: 6,
    children: bluetoothDevices.bind().as(out => {
        const lines = out.trim().split("\n").filter(Boolean);

        if (lines.length === 0) {
            return [
                Widget.Label({
                    class_name: "bt-empty",
                    label: "No se encontraron dispositivos Bluetooth",
                    xalign: 0,
                }),
            ];
        }

        return lines.map(BluetoothRow);
    }),
});

const QuickPanelBackdrop = Widget.Window({
    name: "quickpanel-backdrop",
    class_name: "quickpanel-backdrop",
    visible: false,
    decorated: false,

    anchor: ["top", "bottom", "left", "right"],

    setup: self => {
        self.set_app_paintable(true);
        self.set_type_hint(Gdk.WindowTypeHint.DOCK);

        const screen = self.get_screen();
        const visual = screen.get_rgba_visual();
        if (visual)
            self.set_visual(visual);

        self.set_keep_above(true);
        self.set_skip_taskbar_hint(true);
        self.stick();
    },

    child: Widget.EventBox({
        hexpand: true,
        vexpand: true,
        onPrimaryClick: closeQuickPanel,
        onSecondaryClick: closeQuickPanel,

        child: Widget.Box({
            hexpand: true,
            vexpand: true,
        }),
    }),
});
const ThemeButton = (label, theme) => Widget.Button({
    class_name: "theme-button",
    onClicked: () => applyTheme(theme),
    child: Widget.Label({
        label,
        xalign: 0.5,
        hexpand: true,
    }),
});

const ThemeSelector = (showTitle = true) => Widget.Revealer({
    revealChild: showThemeList.bind(),
    transition: "slide_down",
    transitionDuration: 320,
    child: Widget.Box({
        class_name: "theme-section",
        vertical: true,
        spacing: 8,
        children: [
            ...(showTitle ? [
                Widget.Label({
                    class_name: "section-title",
                    label: "Tema",
                    xalign: 0,
                }),
            ] : []),

            Widget.Box({
                class_name: "theme-grid",
                homogeneous: true,
                spacing: 8,
                children: [
                    ThemeButton("● Miku", "miku"),
                    ThemeButton("● Morado", "purple"),
                ],
            }),

            Widget.Box({
                class_name: "theme-grid",
                homogeneous: true,
                spacing: 8,
                children: [
                    ThemeButton("● Rosa", "rose"),
                    ThemeButton("● Verde", "green"),
                ],
            }),

             Widget.Box({
                 class_name: "theme-grid",
                 homogeneous: true,
                 spacing: 8,
                 children: [
                     ThemeButton("● Gris", "gray"),
                     ThemeButton("● Rojo", "red"),
               ],
           }),
        ],
    }),
});

const QuickPanel = Widget.Window({
    name: "quickpanel",
    class_name: "quickpanel-window",
    visible: false,
    decorated: false,

    setup: self => {
        self.set_app_paintable(true);
        self.set_type_hint(Gdk.WindowTypeHint.DOCK);

        const screen = self.get_screen();
        const visual = screen.get_rgba_visual();

        if (visual)
            self.set_visual(visual);

        self.set_keep_above(true);
        self.set_skip_taskbar_hint(true);
        self.set_skip_pager_hint(true);

        self.set_accept_focus(true);
        self.stick();

        const PANEL_WIDTH = 470;
        const RIGHT_MARGIN = 12;
        const TOP_MARGIN = 45;

        self.set_default_size(PANEL_WIDTH, -1);

        const moveToTopRight = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const x =
                monitor.x +
                monitor.width -
                PANEL_WIDTH -
                RIGHT_MARGIN;

            const y =
                monitor.y +
                TOP_MARGIN;

            self.move(x, y);
        };

        moveToTopRight();

        self.connect("realize", moveToTopRight);
        self.connect("map", moveToTopRight);

        self.connect("focus-out-event", () => {
            Utils.timeout(100, () => {
                closeQuickPanel();
                return false;
            });

            return false;
        });
    },

    child: Widget.Box({
        class_name: "quickpanel",
        vertical: true,
        spacing: 12,
        css: "min-width: 420px;",

        children: [
Widget.Box({
    children: [
        Widget.Label({
            class_name: "title",
            label: "Ajustes rápidos",
            xalign: 0,
            hexpand: true,
        }),
        Widget.Button({
            class_name: "theme-arrow-button",
            onClicked: toggleThemeList,
            child: Widget.Label({
                class_name: "theme-arrow-label",
                label: showThemeList.bind().as(v => v ? "▴" : "▾"),
            }),
        }),
    ],
}),

ThemeSelector(),

            Widget.Box({
                class_name: "grid",
                spacing: 8,
                children: [
                    ToggleButton("  Wi-Fi", toggleWifiList, wifi, "enabled"),
                    ToggleButton("  Bluetooth", toggleBluetoothList, bluetooth, "yes"),
                ],
            }),

            Widget.Revealer({
                revealChild: showWifiList.bind(),
                transition: "slide_down",
                transitionDuration: 320,
                child: Widget.Box({
                    class_name: "wifi-section",
                    vertical: true,
                    spacing: 8,
                    children: [
                        Widget.Box({
                            spacing: 6,
                            children: [
                                Widget.Label({
                                    class_name: "section-title",
                                    label: "Redes disponibles",
                                    xalign: 0,
                                    hexpand: true,
                                }),
                                Widget.Button({
                                    class_name: "small-button",
                                    onClicked: toggleWifiPower,
                                    child: Widget.Label({
                                        label: wifi.bind().as(v => v === "enabled" ? "Apagar" : "Encender"),
                                    }),
                                }),
                                Widget.Button({
                                    class_name: "small-button",
                                    onClicked: refreshNetworks,
                                    child: Widget.Label({
                                        label: "Actualizar",
                                    }),
                                }),
                            ],
                        }),
                        WifiList(),
                    ],
                }),
            }),

            Widget.Revealer({
                revealChild: showBluetoothList.bind(),
                transition: "slide_down",
                transitionDuration: 320,
                child: Widget.Box({
                    class_name: "bt-section",
                    vertical: true,
                    spacing: 8,
                    children: [
                        Widget.Box({
                            children: [
                                Widget.Label({
                                    class_name: "section-title",
                                    label: "Dispositivos Bluetooth",
                                    xalign: 0,
                                    hexpand: true,
                                }),
                                Widget.Button({
                                    class_name: "small-button",
                                    onClicked: refreshBluetoothDevices,
                                    child: Widget.Label({
                                        label: "Buscar",
                                    }),
                                }),
                            ],
                        }),

                        BluetoothList(),

                        Widget.Box({
                            spacing: 8,
                            children: [
                                QuickButton("  Bluetooth ON/OFF", "bluetoothctl power $( [ \"$(bluetoothctl show | awk -F': ' '/Powered/ {print $2}')\" = yes ] && echo off || echo on )"),
                                QuickButton("⚙  Blueman", "blueman-manager"),
                            ],
                        }),
                    ],
                }),
            }),

            AudioSliderRow(),

            BrightnessPowerRow(),

            Widget.Box({
                class_name: "info-box",
                vertical: true,
                spacing: 5,
                children: [
                    InfoRow("Batería", battery.bind().as(v => `${v}%`)),
                ],
            }),

Widget.Box({
    class_name: "power-grid",
    vertical: true,
    spacing: 8,
    children: [
        Widget.Box({
            class_name: "power-row",
            homogeneous: true,
            spacing: 8,
            children: [
                PowerButton("  Cerrar sesión", "cinnamon-session-quit --logout"),
                PowerButton("  Ajustes", "cinnamon-settings"),
            ],
        }),

        Widget.Box({
            class_name: "power-row",
            homogeneous: true,
            spacing: 8,
            children: [
                PowerButton("  Suspender", "systemctl suspend"),
                PowerButton("  Reiniciar", "systemctl reboot"),
            ],
        }),

        Widget.Box({
            class_name: "power-row power-row-full",
            homogeneous: true,
            spacing: 8,
            children: [
                PowerButton("⏻  Apagar", "systemctl poweroff"),
            ],
        }),
    ],
}),


        ],
    }),
});


const setupFloatingWindow = self => {
    self.set_app_paintable(true);

    const screen = self.get_screen();
    const visual = screen.get_rgba_visual();

    if (visual)
        self.set_visual(visual);

    self.set_type_hint(Gdk.WindowTypeHint.DOCK);

    self.set_keep_above(true);
    self.set_skip_taskbar_hint(true);
    self.set_skip_pager_hint(true);


    self.stick();

    const enforceSkipTaskbar = () => {
        self.set_skip_taskbar_hint(true);
        self.set_skip_pager_hint(true);
        return false;
    };

    self.connect("realize", () => {
        Utils.timeout(50, enforceSkipTaskbar);
    });

    self.connect("map", () => {
        Utils.timeout(50, enforceSkipTaskbar);
    });
};
const popupRevealVariables = {
    wifipanel: showWifiPanel,
    bluetoothpanel: showBluetoothPanel,
    audiopanel: showAudioPanel,
    sessionpanel: showSessionPanel,
    weatherpanel: showWeatherPanel,
    calendarpanel: showCalendarPanel,
};

const popupNames = [
    "wifipanel",
    "bluetoothpanel",
    "audiopanel",
    "sessionpanel",
    "calendarpanel",
    "weatherpanel",
];

let popupWatchGeneration = 0;

const pointerIsInsideWindow = win => {
    const display = Gdk.Display.get_default();
    const seat = display?.get_default_seat();
    const pointer = seat?.get_pointer();

    if (!pointer)
        return true;

    const [, px, py] = pointer.get_position();
    const [wx, wy] = win.get_position();
    const [ww, wh] = win.get_size();

    return px >= wx && px < wx + ww && py >= wy && py < wy + wh;
};

const watchOutsideClick = (name, revealVariable, generation) => {
    Utils.execAsync([
        "bash",
        "-lc",
        "stdbuf -oL xinput test-xi2 --root 2>/dev/null | awk '/RawButtonPress/ { exit }'",
    ])
        .then(() => {
            if (generation !== popupWatchGeneration)
                return;

            Utils.timeout(20, () => {
                if (generation !== popupWatchGeneration)
                    return false;

                const win = App.getWindow(name);

                if (!win?.visible)
                    return false;

                if (pointerIsInsideWindow(win)) {
                    watchOutsideClick(name, revealVariable, generation);
                    return false;
                }

                popupWatchGeneration++;

                if (revealVariable)
                    closePopupAnimated(name, revealVariable);
                else
                    App.closeWindow(name);

                return false;
            });
        })
        .catch(err => print(`outside-click watcher: ${err}`));
};

const togglePopup = (name, beforeOpen = null) => {
    const target = App.getWindow(name);
    const revealVariable = popupRevealVariables[name];

    if (target?.visible) {
        popupWatchGeneration++;

        if (revealVariable)
            closePopupAnimated(name, revealVariable);
        else
            App.closeWindow(name);

        return;
    }

    popupWatchGeneration++;

    popupNames.forEach(n => {
        if (n === name)
            return;

        const win = App.getWindow(n);
        if (!win?.visible)
            return;

        const otherReveal = popupRevealVariables[n];

        if (otherReveal)
            closePopupAnimated(n, otherReveal);
        else
            App.closeWindow(n);
    });

    if (beforeOpen)
        beforeOpen();

    // Mantiene oculto el primer frame mientras X11 coloca la ventana.
    preparePopupPosition(name);
    App.openWindow(name);

    Utils.timeout(25, () => {
        const win = App.getWindow(name);

        if (!win)
            return false;

        win.set_opacity(1);

        if (revealVariable)
            revealVariable.value = true;

        animatePopupResize(name, 320);

        const generation = popupWatchGeneration;
        watchOutsideClick(name, revealVariable, generation);

        return false;
    });
};
const preparePopupPosition = name => {
    const win = App.getWindow(name);

    if (!win)
        return;

    win.set_opacity(0);
};

const setupPopupWindow = self => {
    self.set_app_paintable(true);

    const screen = self.get_screen();
    const visual = screen.get_rgba_visual();

    if (visual)
        self.set_visual(visual);

    self.set_type_hint(Gdk.WindowTypeHint.DROPDOWN_MENU);

    self.set_keep_above(true);
    self.set_skip_taskbar_hint(true);
    self.set_skip_pager_hint(true);

    self.set_accept_focus(true);
    self.stick();

    const enforceSkipTaskbar = () => {
        self.set_skip_taskbar_hint(true);
        self.set_skip_pager_hint(true);
        return false;
    };

    self.connect("realize", () => {
        Utils.timeout(50, enforceSkipTaskbar);
    });

    self.connect("map", () => {
        Utils.timeout(50, enforceSkipTaskbar);
    });
};

/* =========================================================
   RESERVA SUPERIOR X11
   Evita que las ventanas maximizadas queden bajo las islas
   ========================================================= */

const PANEL_RESERVED_HEIGHT = 44;


const PanelReserve = Widget.Window({
    name: "panel-reserve",
    class_name: "panel-reserve",

    visible: true,
    decorated: false,

    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DOCK,
    acceptFocus: false,


    setup: self => {
        self.set_app_paintable(true);

        const screen = self.get_screen();
        const visual = screen.get_rgba_visual();

        if (visual)
            self.set_visual(visual);

        self.set_skip_taskbar_hint(true);
        self.set_skip_pager_hint(true);
        self.stick();

        // Muffin debe tratar esta pequeña ventana como un dock/panel.
        self.set_type_hint(Gdk.WindowTypeHint.DOCK);

        // La ventana física solo mide 1×1 px.
        // La zona de 44 px se reserva mediante el STRUT.
        self.set_default_size(1, 1);
const applyStrut = () => {
    const screen = self.get_screen();
    const monitorIndex = screen.get_primary_monitor();
    const monitor = screen.get_monitor_geometry(monitorIndex);

    self.move(monitor.x, monitor.y);

    const gdkWindow = self.get_window();
    if (!gdkWindow)
        return;


    const xid = gdkWindow.get_xid();

    const startX = monitor.x;
    const endX = monitor.x + monitor.width - 1;

    const cmd = `
xprop -id ${xid} \
  -f _NET_WM_STRUT 32c \
  -set _NET_WM_STRUT "0, 0, ${PANEL_RESERVED_HEIGHT}, 0"

xprop -id ${xid} \
  -f _NET_WM_STRUT_PARTIAL 32c \
  -set _NET_WM_STRUT_PARTIAL "0, 0, ${PANEL_RESERVED_HEIGHT}, 0, 0, 0, 0, 0, ${startX}, ${endX}, 0, 0"
`;

    Utils.execAsync([
        "bash",
        "-lc",
        cmd,
    ]).catch(err => print(err));
};

        self.connect("realize", () => {
            Utils.timeout(200, () => {
                applyStrut();
                return false;
            });
        });
},
    child: Widget.Box({
        css: `
            min-width: 1px;
            min-height: 1px;
            background-color: transparent;
        `,
    }),
});

/* =========================
   ISLA IZQUIERDA
   ========================= */

const IslandLeft = Widget.Window({
    name: "island-left",
    class_name: "island-window",
    visible: true,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DOCK,
    acceptFocus: false,

    setup: self => {
       setupFloatingWindow(self);
        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            self.move(
                monitor.x + 12,
                monitor.y + 2
            );
        };

        moveWindow();
        self.connect("realize", moveWindow);
        self.connect("map", moveWindow);
    },

    child: Widget.Box({
        class_name: "island island-left",

        children: [
            Widget.Button({
                class_name: "island-button launcher-button",

                halign: "center",
                valign: "center",

                onClicked: () =>
                    run("$HOME/.local/bin/miku-launcher-toggle"),

child: Widget.Icon({
    icon: `${AGS_DIR}/assets/Mikumenu.png`,

    size: 24,
    valign: "center",
    halign: "center",
     }),

 }),

        ],
    }),
});


/* =========================
   ISLA CENTRAL
   ========================= */

const IslandCenter = Widget.Window({
    name: "island-center",
    class_name: "island-window",
    visible: true,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DOCK,
    acceptFocus: false,

    setup: self => {
        setupFloatingWindow(self);

        const WIDTH = 230;

        self.set_default_size(WIDTH, -1);

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const x =
                monitor.x
                + Math.floor(
                    (monitor.width - WIDTH) / 2
                );

            self.move(
                x,
                monitor.y + 2
            );
        };

        moveWindow();

        self.connect(
            "realize",
            moveWindow
        );
    },

    child: Widget.Box({
        class_name: "island island-center",
        vexpand: true,
        valign: "center",

        child: Widget.Button({
            class_name: "island-clock-button",
            onClicked: () => togglePopup("calendarpanel"),

            child: Widget.Label({
                class_name: "island-clock",
                label: clock.bind(),

                xalign: 0.5,
                yalign: 0.5,

                hexpand: true,
                vexpand: true,

                halign: "fill",
                valign: "fill",
            }),
        }),
    }),
});


/* =========================
   ISLA DERECHA
   ========================= */

const IslandRight = Widget.Window({
    name: "island-right",
    class_name: "island-window",
    visible: true,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DOCK,
    acceptFocus: false,


    setup: self => {
        setupFloatingWindow(self);

        const WIDTH = 430;
        const RIGHT_MARGIN = 12;

        self.set_default_size(
            WIDTH,
            -1
        );

        const moveWindow = () => {
            const screen = self.get_screen();

            const monitor =
                screen.get_monitor_geometry(
                    screen.get_primary_monitor()
                );

            const x =
                monitor.x
                + monitor.width
                - WIDTH
                - RIGHT_MARGIN;

            self.move(
                x,
                monitor.y + 2
            );
        };

        moveWindow();

        self.connect(
            "realize",
            moveWindow
        );
    },

    child: Widget.Box({
        class_name: "island island-right",

        spacing: 4,

        children: [

/* Batería */
Widget.Button({
    class_name: "island-button battery-button",
    onClicked: () => {
    togglePopup("audiopanel", () => {
        refreshAudioApps();
    });
},

    child: Widget.Box({
        spacing: 4,
        children: [
            Widget.Icon({
                icon: battery.bind().as(v => {
                    const n = Number(v) || 0;

                    if (n >= 90)
                        return "battery-full-symbolic";
                    if (n >= 60)
                        return "battery-good-symbolic";
                    if (n >= 30)
                        return "battery-low-symbolic";

                    return "battery-caution-symbolic";
                }),
                size: 17,
            }),

            Widget.Label({
                label: battery.bind().as(v => `${v}%`),
            }),
        ],
    }),
}),

Widget.Button({
    class_name: "island-button weather-button",

    onClicked: () => {
        togglePopup("weatherpanel", refreshWeather);
    },

    child: Widget.Box({
        spacing: 4,

        children: [
Widget.Icon({
    icon: weather.bind().as(value => {
        const parts = value.split("|");
        const condition = (parts[0] || "").toLowerCase();

        const base = "/usr/share/icons/Yaru/scalable/status/";

        if (
            condition.includes("thunder") ||
            condition.includes("storm")
        )
            return base + "weather-storm-symbolic.svg";

        if (
            condition.includes("rain") ||
            condition.includes("drizzle") ||
            condition.includes("snow") ||
            condition.includes("sleet")
        )
            return base + "weather-cloudy-symbolic.svg";

        if (
            condition.includes("partly") ||
            condition.includes("few")
        )
            return base + "weather-few-clouds-symbolic.svg";

        if (
            condition.includes("cloud") ||
            condition.includes("overcast")
        )
            return base + "weather-cloudy-symbolic.svg";

        return base + "weather-clear-symbolic.svg";
    }),
    size: 17,
}),
            Widget.Label({
                label: weather.bind().as(value => {
                    const parts = value.split("|");
                    const temp = parts[1] || "--°";

                    return temp.replace("+", "");
                }),
            }),
        ],
    }),
}),
/* Volumen */
Widget.Button({
    class_name: "island-button",

    onClicked: () => {
        togglePopup("audiopanel", () => {
            refreshAudioApps();
        });
    },

    child: Widget.Box({
        spacing: 4,
        children: [
            Widget.Icon({
                icon: volume.bind().as(v => {
                    const n = Number(v) || 0;

                    if (n === 0)
                        return "audio-volume-muted-symbolic";

                    if (n < 35)
                        return "audio-volume-low-symbolic";

                    if (n < 70)
                        return "audio-volume-medium-symbolic";

                    return "audio-volume-high-symbolic";
                }),
                size: 17,
            }),

            Widget.Label({
                label: volume.bind().as(
                    v => `${Math.round(Number(v) || 0)}%`
                ),
            }),
        ],
    }),
}),

/* WI-FI */
Widget.Button({
    class_name: "island-button",

    onClicked: () => {
        togglePopup("wifipanel", () => {
            refreshNetworks();
        });
    },

    child: Widget.Box({
        spacing: 4,

        children: [
            Widget.Icon({
                icon: wifi.bind().as(v =>
                    v === "enabled"
                        ? "network-wireless-symbolic"
                        : "network-wireless-offline-symbolic"
                ),
                size: 17,
            }),

            Widget.Label({
                label: activeSsid.bind(),
                truncate: "end",
                maxWidthChars: 12,
            }),
        ],
    }),
}),

            /* Bluetooth */
Widget.Button({
    class_name: "island-button",

onClicked: () => {
    togglePopup("bluetoothpanel", () => {
        refreshBluetoothDevices();
    });
},

    child: Widget.Icon({
        icon: bluetooth.bind().as(v =>
            v === "yes"
                ? "bluetooth-symbolic"
                : "bluetooth-disabled-symbolic"
        ),
        size: 17,
    }),
}),

            /* Ajustes rápidos */
Widget.Button({
    class_name: "island-button quickpanel-button",

    onClicked: () => {
    togglePopup("sessionpanel");
},

    child: Widget.Icon({
        icon: "preferences-system-symbolic",
        size: 18,
    }),
}),

        ],
    }),
});

/* =========================================================
   CLIMA DESPLEGABLE
   ========================================================= */

const WeatherPanel = Widget.Window({
    name: "weatherpanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,


    setup: self => {
        setupPopupWindow(self);
        self.set_type_hint(Gdk.WindowTypeHint.DROPDOWN_MENU);

        const WIDTH = 320;
        const RIGHT_MARGIN = 205;
        const TOP_MARGIN = 46;

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const x =
                monitor.x +
                monitor.width -
                WIDTH -
                RIGHT_MARGIN;

            const y = monitor.y + TOP_MARGIN;

            self.set_default_size(WIDTH, -1);
            self.move(x, y);

            const gdkWindow = self.get_window();
            if (gdkWindow)
                gdkWindow.move(x, y);
        };

        if (!self.get_realized())
            self.realize();

        moveWindow();
        self.connect("realize", moveWindow);

        self.connect("focus-out-event", () => {
            Utils.timeout(80, () => {
                const win = App.getWindow("weatherpanel");

                if (win?.visible)
                    closePopupAnimated("weatherpanel", showWeatherPanel);

                return false;
            });

            return false;
        });
    },

    child: Widget.Revealer({
        revealChild: showWeatherPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel weather-popup",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    class_name: "weather-header",
                    spacing: 8,
                    children: [
                        Widget.Icon({
                            icon: "weather-few-clouds-symbolic",
                            size: 19,
                        }),
                        Widget.Box({
                            vertical: true,
                            hexpand: true,
                            children: [
                                Widget.Label({
                                    class_name: "section-title",
                                    label: "Clima en Quito",
                                    xalign: 0,
                                }),
                                Widget.Label({
                                    class_name: "weather-condition",
                                    label: weatherDetails.bind().as(value =>
                                        (value.split("|")[0] || "Sin datos").trim()
                                    ),
                                    xalign: 0,
                                }),
                            ],
                        }),
                        Widget.Label({
                            class_name: "weather-main-temp",
                            label: weatherDetails.bind().as(value =>
                                (value.split("|")[1] || "--°").replace("+", "").trim()
                            ),
                            xalign: 1,
                        }),
                    ],
                }),

                Widget.Box({
                    class_name: "weather-info-box",
                    vertical: true,
                    spacing: 6,
                    children: [
                        Widget.Box({
                            children: [
                                Widget.Label({ label: "Sensación", xalign: 0, hexpand: true }),
                                Widget.Label({
                                    class_name: "weather-value",
                                    label: weatherDetails.bind().as(value =>
                                        (value.split("|")[2] || "--°").replace("+", "").trim()
                                    ),
                                    xalign: 1,
                                }),
                            ],
                        }),
                        Widget.Box({
                            children: [
                                Widget.Label({ label: "Humedad", xalign: 0, hexpand: true }),
                                Widget.Label({
                                    class_name: "weather-value",
                                    label: weatherDetails.bind().as(value =>
                                        (value.split("|")[3] || "--").trim()
                                    ),
                                    xalign: 1,
                                }),
                            ],
                        }),
                        Widget.Box({
                            children: [
                                Widget.Label({ label: "Viento", xalign: 0, hexpand: true }),
                                Widget.Label({
                                    class_name: "weather-value",
                                    label: weatherDetails.bind().as(value =>
                                        (value.split("|")[4] || "--").trim()
                                    ),
                                    xalign: 1,
                                }),
                            ],
                        }),
                        Widget.Box({
                            children: [
                                Widget.Label({ label: "Precipitación", xalign: 0, hexpand: true }),
                                Widget.Label({
                                    class_name: "weather-value",
                                    label: weatherDetails.bind().as(value =>
                                        (value.split("|")[5] || "--").trim()
                                    ),
                                    xalign: 1,
                                }),
                            ],
                        }),
                    ],
                }),

                Widget.Button({
                    class_name: "small-button weather-refresh-button",
                    onClicked: refreshWeather,
                    child: Widget.Label({ label: "↻  Actualizar" }),
                }),
            ],
        }),
    }),
});

/* =========================================================
   CALENDARIO DESPLEGABLE
   ========================================================= */

const CalendarPanel = Widget.Window({
    name: "calendarpanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,


    setup: self => {
        setupPopupWindow(self);

        // En X11 se realiza y posiciona antes de mapear para evitar
        // el destello inicial en la esquina superior izquierda.
        self.set_type_hint(Gdk.WindowTypeHint.DROPDOWN_MENU);

        const WIDTH = 300;
        const TOP_MARGIN = 46;

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const x =
                monitor.x +
                Math.floor((monitor.width - WIDTH) / 2);

            const y = monitor.y + TOP_MARGIN;

            self.set_default_size(WIDTH, -1);
            self.move(x, y);

            const gdkWindow = self.get_window();
            if (gdkWindow)
                gdkWindow.move(x, y);
        };

        if (!self.get_realized())
            self.realize();

        moveWindow();

        self.connect("realize", () => {
            moveWindow();
        });

        self.connect("focus-out-event", () => {
            Utils.timeout(80, () => {
                const win = App.getWindow("calendarpanel");

                if (win?.visible) {
                    closePopupAnimated(
                        "calendarpanel",
                        showCalendarPanel
                    );
                }

                return false;
            });

            return false;
        });
    },

    child: Widget.Revealer({
        revealChild: showCalendarPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel calendar-popup",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    class_name: "calendar-header",
                    spacing: 6,
                    children: [
                        Widget.Icon({
                            icon: "x-office-calendar-symbolic",
                            size: 18,
                        }),
                        Widget.Label({
                            class_name: "section-title",
                            label: "Calendario",
                            xalign: 0,
                            hexpand: true,
                        }),
                    ],
                }),

                Widget.Calendar({
                    class_name: "calendar-widget",
                    showHeading: true,
                    showDayNames: true,
                    showWeekNumbers: false,
                }),
            ],
        }),
    }),
});

const WifiPanel = Widget.Window({
    name: "wifipanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,

    setup: self => {
        setupPopupWindow(self);

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitorIndex = screen.get_primary_monitor();
            const monitor = screen.get_monitor_geometry(monitorIndex);

            const WIDTH = 360;
            const RIGHT_MARGIN = 95;
            const TOP_MARGIN = 46;

            const x =
                monitor.x +
                monitor.width -
                WIDTH -
                RIGHT_MARGIN;

            const y =
                monitor.y +
                TOP_MARGIN;

            self.set_default_size(WIDTH, -1);
            self.move(x, y);
        };

        moveWindow();

        self.connect("realize", moveWindow);
        self.connect("map", moveWindow);

        self.connect("focus-out-event", () => {
            Utils.timeout(80, () => {
                const win = App.getWindow("wifipanel");

                if (win?.visible) {
                    closePopupAnimated(
                        "wifipanel",
                        showWifiPanel
                    );
                }

                return false;
            });

            return false;
        });
    },

    child: Widget.Revealer({
        revealChild: showWifiPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel wifi-popup",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    class_name: "popup-header",
                    spacing: 6,

                    children: [
                        Widget.Icon({
                            icon: wifi.bind().as(v =>
                                v === "enabled"
                                    ? "network-wireless-symbolic"
                                    : "network-wireless-offline-symbolic"
                            ),
                            size: 18,
                        }),

                        Widget.Label({
                            class_name: "section-title",
                            label: "Wi-Fi",
                            xalign: 0,
                            hexpand: true,
                        }),

                        Widget.Button({
                            class_name: "small-button",
                            onClicked: toggleWifiPower,

                            child: Widget.Label({
                                label: wifi.bind().as(v =>
                                    v === "enabled"
                                        ? "Apagar"
                                        : "Encender"
                                ),
                            }),
                        }),

                        Widget.Button({
                            class_name: "small-button",
                            onClicked: refreshNetworks,

                            child: Widget.Label({
                                label: "Actualizar",
                            }),
                        }),
                    ],
                }),

                Widget.Box({
                    class_name: "popup-inner-section",
                    vertical: true,
                    spacing: 8,

                    children: [
                        Widget.Label({
                            class_name: "wifi-current-network",

                            label: activeSsid.bind().as(ssid =>
                                ssid && ssid !== "Sin red"
                                    ? `Conectado a ${ssid}`
                                    : "Sin conexión"
                            ),

                            xalign: 0,
                        }),

                        WifiList(),
                    ],
                }),
            ],
        }),
    }),
});

const BluetoothPanel = Widget.Window({
    name: "bluetoothpanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,


setup: self => {
    setupPopupWindow(self);

    /*
     * En X11 hacemos que Muffin trate esta ventana como
     * un menú desplegable y no intente colocarla por su cuenta.
     */
    self.set_type_hint(Gdk.WindowTypeHint.DROPDOWN_MENU);

    const moveWindow = () => {
        const screen = self.get_screen();
        const monitorIndex = screen.get_primary_monitor();
        const monitor = screen.get_monitor_geometry(monitorIndex);

        const WIDTH = 340;
        const RIGHT_MARGIN = 55;
        const TOP_MARGIN = 46;

        const x =
            monitor.x +
            monitor.width -
            WIDTH -
            RIGHT_MARGIN;

        const y =
            monitor.y +
            TOP_MARGIN;

        self.set_default_size(WIDTH, -1);

        /*
         * GtkWindow
         */
        self.move(x, y);

        /*
         * GdkWindow/X11 directamente.
         * Esto es importante porque la ventana ya tiene
         * posición antes de que llegue a mostrarse.
         */
        const gdkWindow = self.get_window();

        if (gdkWindow)
            gdkWindow.move(x, y);
    };

    /*
     * Realizamos la ventana AHORA, mientras todavía está oculta.
     * Realize != Map:
     *
     * realize -> se crea la ventana X11
     * map     -> aparece en pantalla
     *
     * Así podemos moverla entre ambos pasos.
     */
    if (!self.get_realized())
        self.realize();

    moveWindow();

    self.connect("realize", () => {
        moveWindow();
    });

    self.connect("focus-out-event", () => {
        Utils.timeout(80, () => {
            const win = App.getWindow("bluetoothpanel");

            if (win?.visible) {
                closePopupAnimated(
                    "bluetoothpanel",
                    showBluetoothPanel
                );
            }

            return false;
        });

        return false;
    });
},

    child: Widget.Revealer({
        revealChild: showBluetoothPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel bluetooth-popup",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    class_name: "popup-header",
                    spacing: 6,

                    children: [
                        Widget.Icon({
                            icon: bluetooth.bind().as(v =>
                                v === "yes"
                                    ? "bluetooth-symbolic"
                                    : "bluetooth-disabled-symbolic"
                            ),
                            size: 18,
                        }),

                        Widget.Label({
                            class_name: "section-title",
                            label: "Bluetooth",
                            xalign: 0,
                            hexpand: true,
                        }),

                        Widget.Button({
                            class_name: "small-button",
                            onClicked: toggleBluetoothPower,

                            child: Widget.Label({
                                label: bluetooth.bind().as(v =>
                                    v === "yes"
                                        ? "Apagar"
                                        : "Encender"
                                ),
                            }),
                        }),

                        Widget.Button({
                            class_name: "small-button",
                            onClicked: refreshBluetoothDevices,

                            child: Widget.Label({
                                label: "Buscar",
                            }),
                        }),
                    ],
                }),

                Widget.Box({
                    class_name: "popup-inner-section",
                    vertical: true,
                    spacing: 8,

                    children: [
                        BluetoothList(),
                    ],
                }),
            ],
        }),
    }),
});
/* =========================================================
   PANEL DE AUDIO Y BRILLO
   ========================================================= */

const AudioPanel = Widget.Window({
    name: "audiopanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
   skipTaskbarHint: true,
   skipPagerHint: true,
   typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,


    setup: self => {
        setupPopupWindow(self);

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const WIDTH = 390;
            const RIGHT_MARGIN = 165;
            const TOP_MARGIN = 46;

            self.set_default_size(WIDTH, -1);

            self.move(
                monitor.x + monitor.width - WIDTH - RIGHT_MARGIN,
                monitor.y + TOP_MARGIN
            );
        };

        moveWindow();
        self.connect("realize", moveWindow);
        self.connect("map", moveWindow);

        self.connect("focus-out-event", () => {
            Utils.timeout(80, () => {
                const win = App.getWindow("audiopanel");

                if (win?.visible) {
                    closePopupAnimated(
                        "audiopanel",
                        showAudioPanel
                    );
                }

                return false;
            });

            return false;
        });
    },

    child: Widget.Revealer({
        revealChild: showAudioPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel audio-popup",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    spacing: 6,

                    children: [
                        Widget.Icon({
                            icon: "audio-volume-high-symbolic",
                            size: 18,
                        }),

                        Widget.Label({
                            class_name: "section-title",
                            label: "Audio y brillo",
                            xalign: 0,
                            hexpand: true,
                        }),
                    ],
                }),

                AudioSliderRow(),
                BrightnessPowerRow(),
            ],
        }),
    }),
});


/* =========================================================
   PANEL DE SESIÓN Y SISTEMA
   ========================================================= */

const SessionPanel = Widget.Window({
    name: "sessionpanel",
    class_name: "popup-window",
    visible: false,
    decorated: false,
    skipTaskbarHint: true,
    skipPagerHint: true,
    typeHint: Gdk.WindowTypeHint.DROPDOWN_MENU,


    setup: self => {
        setupPopupWindow(self);

        const moveWindow = () => {
            const screen = self.get_screen();
            const monitor = screen.get_monitor_geometry(
                screen.get_primary_monitor()
            );

            const WIDTH = 320;
            const RIGHT_MARGIN = 12;
            const TOP_MARGIN = 46;

            self.set_default_size(WIDTH, -1);

            self.move(
                monitor.x + monitor.width - WIDTH - RIGHT_MARGIN,
                monitor.y + TOP_MARGIN
            );
        };

        moveWindow();
        self.connect("realize", moveWindow);
        self.connect("map", moveWindow);

        self.connect("focus-out-event", () => {
            Utils.timeout(80, () => {
                const win = App.getWindow("sessionpanel");

                if (win?.visible) {
                    closePopupAnimated(
                        "sessionpanel",
                        showSessionPanel
                    );
                }

                return false;
            });

            return false;
        });
    },

    child: Widget.Revealer({
        revealChild: showSessionPanel.bind(),
        transition: "slide_down",
        transitionDuration: 320,

        child: Widget.Box({
            class_name: "popup-panel session-popup session-popup-compact",
            vertical: true,
            spacing: 10,

            children: [
                Widget.Box({
                    class_name: "popup-header session-header",
                    spacing: 8,
                    children: [
                        Widget.Icon({
                            icon: "preferences-system-symbolic",
                            size: 18,
                        }),

                        Widget.Box({
                            vertical: true,
                            hexpand: true,
                            children: [
                                Widget.Label({
                                    class_name: "section-title",
                                    label: "Sesión y sistema",
                                    xalign: 0,
                                }),
                                Widget.Label({
                                    class_name: "session-subtitle",
                                    label: "Acciones rápidas y apariencia",
                                    xalign: 0,
                                }),
                            ],
                        }),
                    ],
                }),

                Widget.Box({
                    class_name: "info-box session-control-box",
                    vertical: true,
                    spacing: 6,
                    children: [
                        InfoRow(
                            "Perfil de energía",
                            powerProfile.bind().as(v =>
                                v === "power-saver"
                                    ? "Ahorro"
                                    : v === "performance"
                                        ? "Rendimiento"
                                        : v === "balanced"
                                            ? "Balanceado"
                                            : v
                            )
                        ),

                        Widget.Button({
                            class_name: "session-theme-toggle",
                            onClicked: toggleThemeList,
                            child: Widget.Box({
                                children: [
                                    Widget.Label({
                                        label: "  Tema",
                                        xalign: 0,
                                        hexpand: true,
                                    }),
                                    Widget.Label({
                                        class_name: "expand-arrow-label",
                                        label: showThemeList.bind().as(v => v ? "▴" : "▾"),
                                        xalign: 1,
                                    }),
                                ],
                            }),
                        }),

                        ThemeSelector(false),
                    ],
                }),

                Widget.Label({
                    class_name: "session-section-label",
                    label: "Sistema",
                    xalign: 0,
                }),

                Widget.Box({
                    class_name: "power-grid session-power-grid",
                    vertical: true,
                    spacing: 7,

                    children: [
                        Widget.Box({
                            class_name: "power-row",
                            homogeneous: true,
                            spacing: 7,
                            children: [
                                PowerButton(
                                    "  Bloquear",
                                    "cinnamon-screensaver-command --lock"
                                ),
                                PowerButton(
                                    "  Ajustes",
                                    "cinnamon-settings"
                                ),
                            ],
                        }),

                        Widget.Box({
                            class_name: "power-row",
                            homogeneous: true,
                            spacing: 7,
                            children: [
                                PowerButton(
                                    "  Suspender",
                                    "systemctl suspend"
                                ),
                                PowerButton(
                                    "  Cerrar sesión",
                                    "cinnamon-session-quit --logout"
                                ),
                            ],
                        }),

                        Widget.Box({
                            class_name: "power-row",
                            homogeneous: true,
                            spacing: 7,
                            children: [
                                PowerButton(
                                    "  Reiniciar",
                                    "systemctl reboot"
                                ),
                                PowerButton(
                                    "  Apagar",
                                    "systemctl poweroff"
                                ),
                            ],
                        }),
                    ],
                }),
            ],
        }),
    }),
});

App.config({
    style: `${AGS_DIR}/style.css`,
    windows: [
        PanelReserve,

        IslandLeft,
        IslandCenter,
        IslandRight,

        WifiPanel,
        BluetoothPanel,
        AudioPanel,
        SessionPanel,
        CalendarPanel,
        WeatherPanel,

        QuickPanel,
    ],
});
