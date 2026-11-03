import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

import EffectStorage from "./core/effect/effect_storage.js";
import { DURATION_STEP, MAX_DURATION, MIN_DURATION } from "./constants.js";
import { Keys } from "./enums.js";
import { logError } from "./utils/logging.js";
import { getDefaultsPath, getEffectsPath } from "./utils/paths.js";

import { AboutPage } from "./ui/about_page.js";
import { EffectSelectionDialog } from "./ui/effect_selection_dialog.js";
import { LibraryPage } from "./ui/library_page.js";

const MODULES = [
    {
        title: "Wallpaper",
        enableKey: Keys.WALLPAPER_ENABLED,
        durationKey: Keys.WALLPAPER_DURATION,
        effectsKey: Keys.WALLPAPER_EFFECTS,
        switches: [
            {
                key: Keys.WALLPAPER_ANIMATE_NEW,
                title: "Animate New Wallpaper",
                subtitle: "Reveal the new wallpaper instead of removing the old one",
            },
        ],
    },
    {
        title: "Popup",
        enableKey: Keys.POPUP_ENABLED,
        durationKey: Keys.POPUP_DURATION,
        effectsKey: Keys.POPUP_EFFECTS,
    },
    {
        title: "Lock Screen",
        enableKey: Keys.LOCKSCREEN_ENABLED,
        durationKey: Keys.LOCKSCREEN_DURATION,
        effectsKey: Keys.LOCKSCREEN_EFFECTS,
        switches: [
            {
                key: Keys.LOCKSCREEN_ANIMATE_UNLOCK,
                title: "Animate Unlock",
                subtitle: "When off, unlocking uses the default GNOME animation",
            },
        ],
    },
];

export default class RipplePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(540, 680);

        const settings = this.getSettings();
        const storage = new EffectStorage(getEffectsPath(), getDefaultsPath(this.path));
        const libraryPage = new LibraryPage(window, settings, storage);

        // Shared by all pages, loaded once
        storage.load()
            .then(() => {
                libraryPage.refresh();
                storage.startWatching();
            })
            .catch(e => logError(
                `Preferences: could not load the effects: ${e}`
            ));

        window.connect("close-request", () => {
            storage.stopWatching();
            return false;
        });

        window.add(this._createGeneralPage(window, settings, storage));
        window.add(libraryPage);
        window.add(new AboutPage(this.metadata, this.path));
    }

    _createGeneralPage(window, settings, storage) {
        const page = new Adw.PreferencesPage({
            title: "General",
            icon_name: "preferences-system-symbolic",
        });

        const generalGroup = new Adw.PreferencesGroup({});
        const batteryRow = new Adw.SwitchRow({ title: "Disable on Battery" });
        settings.bind(Keys.DISABLE_ON_BATTERY, batteryRow, "active",
            Gio.SettingsBindFlags.DEFAULT);
        generalGroup.add(batteryRow);
        page.add(generalGroup);

        for (const module of MODULES)
            page.add(this._createModuleGroup(window, settings, storage, module));

        return page;
    }

    _createModuleGroup(window, settings, storage,
        { title, enableKey, durationKey, effectsKey, switches = [] }) {
        const group = new Adw.PreferencesGroup({ title });

        const enableRow = new Adw.SwitchRow({ title: "Enabled" });
        settings.bind(enableKey, enableRow, "active", Gio.SettingsBindFlags.DEFAULT);

        const durationRow = Adw.SpinRow.new_with_range(
            MIN_DURATION, MAX_DURATION, DURATION_STEP
        );
        durationRow.set_title("Duration");
        durationRow.set_subtitle("In milliseconds");
        settings.bind(durationKey, durationRow, "value", Gio.SettingsBindFlags.DEFAULT);

        const effectsRow = new Adw.ActionRow({
            title: "Effects",
            activatable: true,
        });
        effectsRow.add_suffix(new Gtk.Image({ icon_name: "go-next-symbolic" }));
        effectsRow.connect("activated", () => {
            const dialog = new EffectSelectionDialog(
                this._listEffects(storage),
                settings.get_strv(effectsKey),
            );
            dialog.set_transient_for(window);
            dialog.connect("saved", () => {
                settings.set_strv(effectsKey, dialog.selectedEffects);
            });
            dialog.present();
        });

        const updateEffectsRow = () => {
            const count = settings.get_strv(effectsKey).length;
            effectsRow.set_subtitle(count > 0
                ? `${count} selected`
                : "Random from all effects");
        };
        settings.connect(`changed::${effectsKey}`, updateEffectsRow);
        updateEffectsRow();

        settings.bind(enableKey, durationRow, "sensitive", Gio.SettingsBindFlags.GET);
        settings.bind(enableKey, effectsRow, "sensitive", Gio.SettingsBindFlags.GET);

        group.add(enableRow);
        group.add(durationRow);
        group.add(effectsRow);

        // Settings only some modules have
        for (const { key, title: switchTitle, subtitle } of switches) {
            const row = new Adw.SwitchRow({ title: switchTitle, subtitle });
            settings.bind(key, row, "active", Gio.SettingsBindFlags.DEFAULT);
            settings.bind(enableKey, row, "sensitive", Gio.SettingsBindFlags.GET);
            group.add(row);
        }

        return group;
    }

    _listEffects(storage) {
        return storage.list().map(effect => effect.name);
    }
}
