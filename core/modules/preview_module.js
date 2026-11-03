import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { applyShader } from '../shader/transition.js';
import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from '../../constants.js';
import { Keys } from '../../enums.js';
import { capitalizeWords } from '../../utils/format.js';
import { logWarn } from '../../utils/logging.js';
import { getPreviewPath } from '../../utils/paths.js';
import Gio from '../../utils/gio_async.js';

const TAG = '_previewTimeline';

/**
 * Shows the popup the preferences use to preview an effect. It ignores all
 * settings: prefs writes the shader to getPreviewPath() and sets
 * Keys.PREVIEW_NAME, the effect plays when the popup opens and in reverse when
 * it is clicked.
 */
export default class PreviewModule {
    constructor(effectManager, settings) {
        this._effectManager = effectManager;
        this._settings = settings;
        this._popup = null;
    }

    enable() {
        // A request made while the extension was off
        this._settings.set_string(Keys.PREVIEW_NAME, '');
        this._changedId = this._settings.connect(
            `changed::${Keys.PREVIEW_NAME}`,
            () => this._onPreviewRequested(),
        );
    }

    disable() {
        this._settings.disconnect(this._changedId);
        this._changedId = 0;
        this._destroyPopup();
    }

    async _onPreviewRequested() {
        const name = this._settings.get_string(Keys.PREVIEW_NAME);
        if (!name)
            return;

        // Clearing it lets the same effect be previewed again
        this._settings.set_string(Keys.PREVIEW_NAME, '');

        try {
            const file = Gio.File.new_for_path(getPreviewPath());
            const [bytes] = await file.load_contents_async(null);

            // Disabled while reading
            if (!this._changedId)
                return;

            this._open(name, new TextDecoder().decode(bytes));
        } catch (e) {
            logWarn(`PreviewModule: could not preview "${name}" – ${e.message}`);
        }
    }

    _createPopup(name) {
        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(new St.Label({
            text: capitalizeWords(name),
            x_align: Clutter.ActorAlign.CENTER,
            style: 'font-size: 18pt; font-weight: bold; margin-bottom: 8px;',
        }));
        box.add_child(new St.Label({
            text: 'Click again to close (reversed effect)',
            x_align: Clutter.ActorAlign.CENTER,
        }));

        const popup = new St.Button({
            child: box,
            width: PREVIEW_WIDTH,
            height: PREVIEW_HEIGHT,
            style: 'background-color: #36363a; color: #ffffff; border-radius: 18px;',
        });

        Main.layoutManager.addTopChrome(popup);

        const { x, y, width, height } = Main.layoutManager.primaryMonitor;
        popup.set_position(
            Math.round(x + (width - PREVIEW_WIDTH) / 2),
            Math.round(y + (height - PREVIEW_HEIGHT) / 2),
        );

        return popup;
    }

    _open(name, body) {
        this._destroyPopup();

        const popup = this._createPopup(name);
        this._popup = popup;

        popup.connect('clicked', () => this._close(popup, body));

        applyShader(
            popup,
            this._effectManager.createPreviewShader(
                body, this._settings.get_boolean(Keys.PREVIEW_OUTLINE)),
            1,
            0,
            this._settings.get_int(Keys.PREVIEW_DURATION),
            null,
            TAG,
            Main.layoutManager.primaryMonitor,
        );
    }

    _close(popup, body) {
        popup.reactive = false;

        applyShader(
            popup,
            this._effectManager.createPreviewShader(
                body, this._settings.get_boolean(Keys.PREVIEW_OUTLINE)),
            0,
            1,
            this._settings.get_int(Keys.PREVIEW_DURATION),
            () => this._destroyPopup(),
            TAG,
            Main.layoutManager.primaryMonitor,
        );
    }

    _destroyPopup() {
        this._popup?.[TAG]?.stop();
        this._popup?.destroy();
        this._popup = null;
    }
}
