import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";

import { Keys } from "../enums.js";
import { removeFromEffectLists, renameInEffectLists } from "../utils/effect_lists.js";
import { capitalizeWords } from "../utils/format.js";
import { getEffectsPath, getPreviewPath } from "../utils/paths.js";
import { EffectEditorDialog } from "./effect_editor_dialog.js";
import EffectWriter from "../core/effect/effect_writer.js";

/**
 * Lists the effects and manages the user's own. The storage is loaded and
 * watched by the caller, which calls refresh() once it is loaded.
 */
export const LibraryPage = GObject.registerClass(
    class LibraryPage extends Adw.PreferencesPage {
        /**
         * @param {Adw.PreferencesWindow} window
         * @param {import("gi://Gio").Settings} settings
         * @param {import("../core/effect/effect_storage.js").default} storage
         */
        _init(window, settings, storage) {
            super._init({
                title: "Library",
                icon_name: "folder-symbolic",
            });

            this._window = window;
            this._settings = settings;
            this._storage = storage;
            this._writer = new EffectWriter(storage);
            this._rows = [];

            this.add(this._createActionsGroup());

            this._userGroup = new Adw.PreferencesGroup({ title: "My Effects" });
            this._defaultGroup = new Adw.PreferencesGroup({ title: "Default Effects" });
            this.add(this._userGroup);
            this.add(this._defaultGroup);

            const refresh = () => this.refresh();
            storage.onCreated = refresh;
            storage.onUpdated = refresh;
            storage.onDeleted = refresh;
            storage.onRenamed = refresh;
        }

        _createActionsGroup() {
            const folderButton = new Gtk.Button({ label: "Open Effects Folder" });
            folderButton.connect("clicked", () => {
                Gio.AppInfo.launch_default_for_uri(
                    GLib.filename_to_uri(getEffectsPath(), null), null);
            });

            const newButton = new Gtk.Button({ label: "New Effect" });
            newButton.add_css_class("suggested-action");
            newButton.connect("clicked", () => this._openEditor(null));

            const box = new Gtk.Box({
                spacing: 12,
                homogeneous: true,
            });
            box.append(folderButton);
            box.append(newButton);

            const group = new Adw.PreferencesGroup();
            group.add(box);
            return group;
        }

        refresh() {
            this._rows.forEach(([group, row]) => group.remove(row));
            this._rows = [];

            for (const effect of this._storage.list()) {
                const group = effect.builtin ? this._defaultGroup : this._userGroup;
                const row = this._createRow(effect);

                group.add(row);
                this._rows.push([group, row]);
            }
        }

        _createRow(effect) {
            const row = new Adw.ActionRow({ title: capitalizeWords(effect.name) });

            row.add_suffix(this._createButton(
                effect.builtin ? "view-reveal-symbolic" : "document-edit-symbolic",
                effect.builtin ? "View" : "Edit",
                () => this._openEditor(effect),
            ));
            row.add_suffix(this._createButton(
                "media-playback-start-symbolic",
                "Preview",
                () => this._preview(effect.name, effect.body),
            ));

            if (!effect.builtin) {
                row.add_suffix(this._createButton(
                    "user-trash-symbolic",
                    "Delete",
                    () => this._confirmDelete(effect),
                ));
            }

            return row;
        }

        _createButton(iconName, tooltip, onClicked) {
            const button = new Gtk.Button({
                icon_name: iconName,
                tooltip_text: tooltip,
                valign: Gtk.Align.CENTER,
            });
            button.add_css_class("flat");
            button.connect("clicked", onClicked);

            return button;
        }

        _openEditor(effect) {
            const takenNames = this._storage.list().map(({ name }) => name);
            const dialog = new EffectEditorDialog(effect, takenNames);

            dialog.set_transient_for(this._window);
            dialog.connect("preview", () => {
                this._preview(dialog.effectName || "New Effect", dialog.effectBody);
            });
            dialog.connect("saved", () => {
                this._save(effect, dialog.effectName, dialog.effectBody);
            });
            dialog.present();
        }

        _save(effect, name, body) {
            try {
                if (effect) {
                    this._writer.update(effect.name, { name, body });
                    renameInEffectLists(this._settings, effect.name, name);
                } else {
                    this._writer.create({ name, body });
                }
            } catch (e) {
                this._showError(e);
            }
        }

        _preview(name, body) {
            const path = getPreviewPath();

            try {
                GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
                //NOTE: replace_content throws exception
                Gio.File.new_for_path(path).replace_contents(
                    new TextEncoder().encode(body),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    null,
                );
                this._settings.set_string(Keys.PREVIEW_NAME, name);
            } catch (e) {
                this._showError(e);
            }
        }

        _confirmDelete(effect) {
            const dialog = new Adw.AlertDialog({
                heading: `Delete ${capitalizeWords(effect.name)}?`,
                body: "This removes the effect file and can't be undone.",
            });
            dialog.add_response("cancel", "Cancel");
            dialog.add_response("delete", "Delete");
            dialog.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.set_close_response("cancel");

            dialog.connect("response", (_dialog, response) => {
                if (response === "delete")
                    this._delete(effect);
            });
            dialog.present(this._window);
        }

        _delete(effect) {
            try {
                this._writer.delete(effect.name);
                removeFromEffectLists(this._settings, effect.name);
            } catch (e) {
                this._showError(e);
            }
        }

        _showError(error) {
            this._window.add_toast(new Adw.Toast({ title: error.message }));
        }
    },
);
