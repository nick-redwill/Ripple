import { Keys } from "../enums.js";

/**
 * Whether effects should be skipped to save power.
 * @param {import("gi://Gio").Settings} settings
 * @param {() => boolean} isOnBattery
 */
export function isPausedOnBattery(settings, isOnBattery) {
    return settings.get_boolean(Keys.DISABLE_ON_BATTERY) && isOnBattery();
}

/**
 * Whether a module should animate: its switch is on and it isn't paused to
 * save power.
 * @param {import("gi://Gio").Settings} settings
 * @param {string} enabledKey - Keys.*_ENABLED of the module
 * @param {() => boolean} isOnBattery
 */
export function isModuleActive(settings, enabledKey, isOnBattery) {
    return settings.get_boolean(enabledKey)
        && !isPausedOnBattery(settings, isOnBattery);
}
