import GLib from "gi://GLib";

/** Directory of the effects created by the user. */
export function getEffectsPath() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), "ripple_effects"]);
}

/**
 * Directory of the effects shipped with the extension.
 * @param {string} extensionPath - Extension.path or ExtensionPreferences.path
 */
export function getDefaultsPath(extensionPath) {
    return GLib.build_filenamev([extensionPath, "assets", "defaults"]);
}

/** File prefs writes the previewed shader to, it is not saved yet. */
export function getPreviewPath() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), "ripple", "preview.ripple"]);
}
