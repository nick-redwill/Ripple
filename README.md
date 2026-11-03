<div align="center">

<img src="assets/icon.png" alt="Ripple icon">

# Ripple

**Make your shell more fluid.**<br>
Shader-based transitions for GNOME Shell menus, the wallpaper and the lock screen.

<p>
  <img alt="GNOME Shell 46+" src="https://img.shields.io/badge/GNOME_Shell-46%2B-4A86CF?style=for-the-badge&logo=gnome&logoColor=white&labelColor=2B2B2B">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/nick-redwill/Ripple?style=for-the-badge&color=7E57C2&labelColor=2B2B2B"></a>
  <a href="https://github.com/nick-redwill/Ripple/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nick-redwill/Ripple?style=for-the-badge&logo=github&color=FFB300&labelColor=2B2B2B"></a>
  <img alt="Status" src="https://img.shields.io/badge/Status-Alpha-FB8C00?style=for-the-badge&labelColor=2B2B2B">
</p>

<p>
  <a href="https://github.com/sponsors/nick-redwill"><img alt="Sponsor" src="https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white"></a>
</p>

<p>
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#requirements">Requirements</a> •
  <a href="#writing-effects">Writing Effects</a> •
  <a href="#known-issues">Known Issues</a> •
  <a href="#troubleshooting">Troubleshooting</a> •
  <a href="#todo">TODO</a> •
  <a href="#support">Support</a>
</p>

</div>

---

> [!WARNING]
> Ripple is in early development. Expect rough edges and incompatibilities with other extensions. Please report anything that breaks.

## Features

| | Feature | |
|:-:|---|---|
| 💬 | **Menus & popups** | Animates every panel menu, Quick Settings, the calendar and context menus when they open and close |
| 🖼️ | **Wallpaper** | Animates wallpaper changes, by animating the old wallpaper away, like GNOME does, or the new one in |
| 🔒 | **Lock screen** | Animates locking and, optionally, unlocking |
| ✨ | **Built-in effects** | Burn, dissolve, glitch, melt, page curl, iris, ripple, tiles, wipe and zoom blur |
| 🎲 | **Per-module effects** | Pick which effects each part of the shell uses, or let Ripple choose randomly from all of them |
| ⏱️ | **Adjustable timing** | Set the duration of each kind of transition |
| 🛠️ | **Effect editor** | Write your own effects in GLSL right in the preferences and preview them instantly |
| 📁 | **Plain text effects** | Effects are simple `.ripple` files that reload as soon as you save them and are easy to share |
| 🖱️ | **Mouse-aware effects** | Effects can start from where the pointer is |
| 🔋 | **Battery saving** | Optionally falls back to the default animations when running on battery |

## Credits

Ripple is heavily inspired by:

- [awww](https://codeberg.org/LGFae/awww) (formerly [swww](https://github.com/LGFae/swww))
- [Burn My Windows](https://github.com/Schneegans/Burn-My-Windows)

Make sure to check them out!

## Installation

### From GNOME Extensions (recommended for most users)

<a href="https://extensions.gnome.org/extension/11595/ripple/">
  <img src="https://github.com/user-attachments/assets/d15de748-11b8-4a85-ad34-ec7786547b3c" width="220" alt="Get it on GNOME Extensions">
</a>

### Manual installation

**1. Clone the repository**

```bash
git clone https://github.com/nick-redwill/Ripple.git
```

**2. Copy it to your extensions folder**

```bash
cp -r Ripple ~/.local/share/gnome-shell/extensions/ripple@nick-redwill
```

**3. Log out and back in, then enable the extension**

```bash
gnome-extensions enable ripple@nick-redwill
```
**4. Enjoy beautiful effects** 🎉

## Requirements

- **GNOME Shell 46+**

## Writing Effects

Effects are plain GLSL files with the `.ripple` extension. Create them from the **Library** page in the preferences or put them in `~/.config/ripple_effects` yourself.

Every effect defines one function:

```glsl
// Fades the actor out.

vec4 effect(vec2 uv) {
    return pixel(uv) * (1.0 - _progress);
}
```

| Name | Description |
|---|---|
| `uv` | Position in the actor, `0..1` across it. Outside that range is the [padded area](#padding) around it |
| `pixel(uv)` | Color of the actor at `uv`, transparent outside of it |
| `_progress` | `0` = fully visible, `1` = gone. Effects run backwards when something appears |
| `_random` | A random number in `0..1`, new for every transition |
| `_resolution` | Size of the actor in pixels, to keep circles round |
| `_mouseUV` | Where the pointer was when the transition started, in the same coordinates as `uv` |
| `_mouse` | The same position on the screen, in pixels |

Shader errors can't be detected by the preferences. If an effect has an error, the preview shows nothing during the animation and the popup suddenly appears at the end. The error is written to the log, see [Troubleshooting](#troubleshooting).

### Padding

By default an effect only draws inside the actor. To also draw around it, for example so particles can fly away from a popup, add a `//@padding` line near the top of the file:

```glsl
// Cracks the actor into glass shards that fall away.
//@padding 20 50 120 50
```

It takes 1 to 4 values in the same order as CSS padding:

| Line | Padding |
|---|---|
| `//@padding 10` | 10 on every side |
| `//@padding 10 20` | 10 above and below, 20 left and right |
| `//@padding 10 20 30` | 10 above, 20 left and right, 30 below |
| `//@padding 10 20 30 40` | top, right, bottom, left |

- Top and bottom are percentages of the actor's height, left and right of its width.
- The padded area never goes past the actor's monitor.
- The padded area is rendered into a texture every frame. The bigger the padding, the bigger the texture: it takes more memory and the animation gets slower. Only pad the sides your effect reaches, and only as much as it needs.
- Only the first `//@padding` line counts.

Turn on **Enable Preview Outline** on the **Library** page to see the padded area in previews, and use **Preview Duration** to slow them down. The wallpaper and lock screen cover the whole monitor, so they ignore padding.

## Known Issues

- Extensions that only run on the lock screen, such as Live Lock Screen, are disabled as soon as unlocking starts, so their content disappears before the unlock animation ends.
- The Unblank lock screen extension overrides the unlock function so the unlock animation doesn't play.
- With popup blur enabled in Blur my Shell, the blurred background behind popups isn't animated.

## Troubleshooting

If an animation doesn't play or an effect shows nothing, check the logs while it happens:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep -i -E "ripple|shader"
```

Common causes:
- **An effect has a GLSL error**: the log shows `Shader compilation failed` with the line of the error
- **Disable on battery is enabled** and the system runs on battery
- **The module is disabled** under **General** in the preferences

When [reporting a bug](https://github.com/nick-redwill/Ripple/issues), please include your GNOME Shell version and the log output.

## TODO

- [ ] Add basic syntax highlighting to the editor
- [ ] Add animations for windows (like Burn My Windows), workspaces and overview (if there's demand)
- [ ] Find a way to show shader errors in the editor
- [ ] Add support for custom textures (base64 inside the .ripple files)

## Support

If you enjoy this extension, consider supporting its development.

<p align="center">
  <a href="https://github.com/sponsors/nick-redwill">
    <img src="https://img.shields.io/badge/Sponsor_on_GitHub-EA4AAA?style=for-the-badge&logo=githubsponsors&logoColor=white" height="50" alt="Sponsor on GitHub">
  </a>
</p>

You can also donate with crypto:

**Bitcoin (BTC)**
```
bc1qw6eclug78e2fhx6g5kk88mljcsf4l48y8sxg02
```

**USDT (TRC20)**
```
TFk1UM72jCXCVX53hbVoncFp5k8bVGbhAe
```

## Development

This project is developed with the assistance of AI tools. All changes are planned or approved by the author, and all AI-generated code is reviewed and tested before it is merged.

## License

Released under the [GPL-3.0](LICENSE) license.
