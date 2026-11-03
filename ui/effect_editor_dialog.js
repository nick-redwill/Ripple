import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";

import Effect from "../core/effect/effect.js";
import { createDialogHeader } from "./dialog_header.js";

const TEMPLATE = `// Describe your effect here.
//@padding 0

vec4 effect(vec2 uv) {
    return pixel(uv) * (1.0 - _progress);
}
`;

/**
 * Modal window to create, edit or view an effect.
 *
 * Without an effect it creates a new one, and with a default effect it is
 * read-only. Cancelling or closing the window emits nothing.
 */
export const EffectEditorDialog = GObject.registerClass(
    {
        Signals: {
            saved: {},
            preview: {},
        },
    },
    class EffectEditorDialog extends Adw.Window {
        /**
         * @param {Effect | null} effect - The effect to edit, if any
         * @param {string[]} takenNames  - Names of all existing effects
         */
        _init(effect, takenNames) {
            const readOnly = effect?.builtin ?? false;
            let title = "New Effect";
            if (effect)
                title = readOnly ? "View Effect" : "Edit Effect";

            super._init({
                title,
                modal: true,
                default_width: 640,
                default_height: 600,
            });

            this._takenNames = takenNames
                .filter(name => name !== effect?.name)
                .map(name => name.toLowerCase());

            const { headerBar, saveButton } = createDialogHeader(this, {
                cancelLabel: readOnly ? "Close" : "Cancel",
                showSave: !readOnly,
            });
            this._saveButton = saveButton;

            const previewButton = new Gtk.Button({ label: "Preview" });
            previewButton.connect("clicked", () => this.emit("preview"));
            headerBar.pack_end(previewButton);

            this._nameRow = new Adw.EntryRow({
                title: "Name",
                text: effect?.name ?? "",
                editable: !readOnly,
            });
            this._nameRow.connect("changed", () => this._validate());

            const nameList = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
            });
            nameList.add_css_class("boxed-list");
            nameList.append(this._nameRow);

            this._bodyView = new Gtk.TextView({
                monospace: true,
                editable: !readOnly,
                top_margin: 8,
                bottom_margin: 8,
                left_margin: 8,
                right_margin: 8,
            });
            this._bodyView.buffer.text = effect?.body ?? TEMPLATE;
            this._bodyView.buffer.connect("changed", () => this._validate());

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                margin_top: 12,
                margin_bottom: 12,
                margin_start: 12,
                margin_end: 12,
            });
            box.append(nameList);
            box.append(new Gtk.Frame({
                child: new Gtk.ScrolledWindow({
                    vexpand: true,
                    child: this._bodyView,
                }),
            }));
            box.append(new Gtk.Label({
                label: "Errors in the shader can't be detected. If there is one, the " +
                    "preview shows nothing during the animation and the popup " +
                    "suddenly appears at the end. To see the error, run " +
                    "<tt>journalctl -f /usr/bin/gnome-shell</tt> (if available) " +
                    "and preview again.",
                use_markup: true,
                selectable: true,
                wrap: true,
                xalign: 0,
                css_classes: ["dim-label", "caption"],
            }));

            const toolbarView = new Adw.ToolbarView({ content: box });
            toolbarView.add_top_bar(headerBar);

            this.set_content(toolbarView);
            this._validate();
        }

        get effectName() {
            return this._nameRow.text;
        }

        get effectBody() {
            return this._bodyView.buffer.text;
        }

        _isNameValid() {
            return Effect.isValidName(this.effectName)
                && !this._takenNames.includes(this.effectName.toLowerCase());
        }

        _validate() {
            const nameValid = this._isNameValid();

            if (nameValid || this.effectName.length === 0)
                this._nameRow.remove_css_class("error");
            else
                this._nameRow.add_css_class("error");

            this._saveButton.sensitive = nameValid && this.effectBody.trim().length > 0;
        }
    },
);
