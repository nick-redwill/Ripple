import { Keys } from "../enums.js";

/** Settings keys holding the effects selected for each module */
const EFFECT_LIST_KEYS = [
    Keys.WALLPAPER_EFFECTS,
    Keys.POPUP_EFFECTS,
    Keys.LOCKSCREEN_EFFECTS,
];

/**
 * Replace a renamed effect in the effect list of every module.
 * @param {import("gi://Gio").Settings} settings
 * @param {string} oldName
 * @param {string} newName
 * 
 * NOTE: When renaming effect in Preferences window this function will be called
 * twice (once from ui and once from extension watcher (if enabled))
 * Thats harmless though, so no need to worry
 */
export function renameInEffectLists(settings, oldName, newName) {
    if (oldName == newName) return;

    for (const key of EFFECT_LIST_KEYS) {
        const names = settings.get_strv(key);
        if (names.includes(oldName))
            settings.set_strv(key, names.map(name => (name === oldName ? newName : name)));
    }
}

/**
 * Remove a deleted effect from the effect list of every module.
 * @param {import("gi://Gio").Settings} settings
 * @param {string} name
 * 
 * NOTE: Same thing as renaming, this function might be called twice if removed
 * from Preferences. Still harmless
 */
export function removeFromEffectLists(settings, name) {
    for (const key of EFFECT_LIST_KEYS) {
        const names = settings.get_strv(key);
        if (names.includes(name))
            settings.set_strv(key, names.filter(other => other !== name));
    }
}
