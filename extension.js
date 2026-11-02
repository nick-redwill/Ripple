import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import EffectManager from "./core/effect/effect_manager.js";
import WallpaperModule from "./core/modules/wallpaper_module.js";
import PopupModule from "./core/modules/popup_module.js";
import LockscreenModule from "./core/modules/lockscreen_module.js";
import PreviewModule from "./core/modules/preview_module.js";
import { getDefaultsPath, getEffectsPath } from "./utils/paths.js";
import { removeFromEffectLists, renameInEffectLists } from "./utils/effect_lists.js";
import { BatteryWatcher } from "./helpers/battery_watcher.js";

export default class RippleExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._manager = new EffectManager(getEffectsPath(), getDefaultsPath(this.path));

        // Keep the effects selected for each module in sync with the files,
        // whoever changed them (the preferences, a file manager, ...)
        this._manager.onDeleted = name =>
            removeFromEffectLists(this._settings, name);
        this._manager.onRenamed = (oldName, newName) =>
            renameInEffectLists(this._settings, oldName, newName);

        this._batteryWatcher = new BatteryWatcher({});
        const isOnBattery = () => this._batteryWatcher.isOnBattery();

        this._wallpaperModule = new WallpaperModule(this._manager, this._settings, isOnBattery);
        this._popupModule = new PopupModule(this._manager, this._settings, isOnBattery);
        this._lockscreenModule = new LockscreenModule(this._manager, this._settings, isOnBattery);
        this._previewModule = new PreviewModule(this._manager, this._settings);

        this._manager.enable();
        this._wallpaperModule.enable();
        this._popupModule.enable();
        this._lockscreenModule.enable();
        this._previewModule.enable();
    }

    /**
     * The extension animates the lockscreen unlock transition
     * hence the unlock-dialog in metadata.json
     */
    disable() {
        this._manager.disable();
        this._wallpaperModule.disable();
        this._popupModule.disable();
        this._lockscreenModule.disable();
        this._previewModule.disable();
        this._batteryWatcher.destroy();

        this._settings = null;
        this._manager = null;
        this._wallpaperModule = null;
        this._popupModule = null;
        this._lockscreenModule = null;
        this._previewModule = null;
        this._batteryWatcher = null;
    }
}
