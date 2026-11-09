import Adw from "gi://Adw";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";

import { capitalizeWords } from "../utils/format.js";
import { createDialogHeader } from "./dialog_header.js";

/**
 * Modal window listing effects with a checkbox each.
 *
 * Cancelling or closing the window emits nothing.
 */
export const EffectSelectionDialog = GObject.registerClass(
    {
        Signals: {
            saved: {},
        },
    },
    class EffectSelectionDialog extends Adw.Window {
        /**
         * @param {string[]} effects - Names of all effects
         * @param {string[]} selectedEffects - Names of the checked effects
         */
        constructor(effects, selectedEffects) {
            super({
                title: "Select Effects",
                modal: true,
                default_width: 380,
                default_height: 520,
            });

            /** @type {Map<string, Gtk.CheckButton>} */
            this._checkButtons = new Map();
            this._syncing = false;

            const { headerBar } = createDialogHeader(this);

            const list = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
                valign: Gtk.Align.START,
            });
            list.add_css_class("boxed-list");

            for (const effect of effects)
                list.append(this._createRow(effect, selectedEffects.includes(effect)));

            const selectAllList = new Gtk.ListBox({
                selection_mode: Gtk.SelectionMode.NONE,
            });
            selectAllList.add_css_class("boxed-list");
            selectAllList.append(this._createSelectAllRow());

            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 12,
                valign: Gtk.Align.START,
            });
            box.append(selectAllList);
            box.append(list);

            const toolbarView = new Adw.ToolbarView({
                content: new Gtk.ScrolledWindow({
                    hscrollbar_policy: Gtk.PolicyType.NEVER,
                    child: new Adw.Clamp({
                        margin_top: 12,
                        margin_bottom: 12,
                        margin_start: 12,
                        margin_end: 12,
                        child: box,
                    }),
                }),
            });
            toolbarView.add_top_bar(headerBar);
            toolbarView.add_bottom_bar(new Gtk.Label({
                label: "With nothing selected, a random effect from the whole list is played.",
                wrap: true,
                justify: Gtk.Justification.CENTER,
                css_classes: ["dim-label", "caption"],
                margin_top: 8,
                margin_bottom: 8,
                margin_start: 12,
                margin_end: 12,
            }));

            this.set_content(toolbarView);
            this._syncSelectAll();
        }

        _createSelectAllRow() {
            this._selectAllButton = new Gtk.CheckButton({
                valign: Gtk.Align.CENTER,
            });
            this._selectAllButton.connect("toggled", () => {
                if (this._syncing)
                    return;

                // Anything unchecked: check everything, otherwise clear all
                const checkAll = this.selectedEffects.length < this._checkButtons.size;
                this._syncing = true;
                this._checkButtons.forEach(checkButton => (checkButton.active = checkAll));
                this._syncing = false;
                this._syncSelectAll();
            });

            const row = new Adw.ActionRow({
                title: "Select All",
                activatable_widget: this._selectAllButton,
            });
            row.add_prefix(this._selectAllButton);

            return row;
        }

        /** Checked when all effects are, half checked when some are. */
        _syncSelectAll() {
            if (this._syncing)
                return;

            const count = this.selectedEffects.length;
            const all = count > 0 && count === this._checkButtons.size;

            this._syncing = true;
            this._selectAllButton.active = all;
            this._selectAllButton.inconsistent = count > 0 && !all;
            this._syncing = false;
        }

        _createRow(effect, active) {
            const checkButton = new Gtk.CheckButton({
                active,
                valign: Gtk.Align.CENTER,
            });
            checkButton.connect("toggled", () => this._syncSelectAll());
            this._checkButtons.set(effect, checkButton);

            const row = new Adw.ActionRow({
                title: capitalizeWords(effect),
                activatable_widget: checkButton,
            });
            row.add_prefix(checkButton);

            return row;
        }

        /** The checked names, in the order of the given effects. */
        get selectedEffects() {
            return [...this._checkButtons]
                .filter(([, checkButton]) => checkButton.active)
                .map(([effect]) => effect);
        }
    },
);
