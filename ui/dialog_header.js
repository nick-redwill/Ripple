import Adw from "gi://Adw";
import Gtk from "gi://Gtk";

/**
 * Header bar with Cancel and Save for a dialog window. Cancel closes it, Save
 * emits "saved" and closes it, so the dialog must declare that signal.
 * @param {Adw.Window} dialog
 * @param {object} [options]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.showSave]
 * @returns {{headerBar: Adw.HeaderBar, saveButton: Gtk.Button}}
 */
export function createDialogHeader(dialog, { cancelLabel = "Cancel", showSave = true } = {}) {
    const cancelButton = new Gtk.Button({ label: cancelLabel });
    cancelButton.connect("clicked", () => dialog.close());

    const saveButton = new Gtk.Button({ label: "Save", visible: showSave });
    saveButton.add_css_class("suggested-action");
    saveButton.connect("clicked", () => {
        dialog.emit("saved");
        dialog.close();
    });

    const headerBar = new Adw.HeaderBar({
        show_start_title_buttons: false,
        show_end_title_buttons: false,
    });
    headerBar.pack_start(cancelButton);
    headerBar.pack_end(saveButton);

    return { headerBar, saveButton };
}
