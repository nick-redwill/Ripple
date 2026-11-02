import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import { applyShader, getStagePadding } from '../shader/transition.js';
import { Keys } from '../../enums.js';
import { isModuleActive } from '../../utils/power.js';
import { SHELL_VERSION } from '../../utils/shell_version.js';

const TAG = '_popupTimeline';

/**
 * Turn one of a BoxPointer's input mutes on or off. GNOME 46-50 keep them as
 * booleans, GNOME 51+ as event controllers toggled through `enabled`.
 * Assigning a boolean on 51+ breaks the setup.
 */
export function setMuted(box, property, muted) {
    if (SHELL_VERSION >= 51)
        box[property].enabled = muted;
    else
        box[property] = muted;
}


/**
 * Replaces the open/close animation of every BoxPointer (panel menus, quick
 * settings, calendar, app grid context menus, …) with a shader transition.
 */
export default class PopupModule {
    constructor(effectManager, settings, isOnBattery) {
        this._settings = settings;
        this._isOnBattery = isOnBattery;
        this._injectionManager = new InjectionManager();
        this._effectManager = effectManager;
    }

    _pickShader(animate) {
        if (!(animate & BoxPointer.PopupAnimation.FULL)
            || !isModuleActive(this._settings, Keys.POPUP_ENABLED, this._isOnBattery))
            return null;

        return this._effectManager.getRandomShader(
            this._settings.get_strv(Keys.POPUP_EFFECTS));
    }

    enable() {
        this._injectionManager.overrideMethod(
            BoxPointer.BoxPointer.prototype,
            'open',
            originalMethod => {
                const self = this;

                return function (animate, onComplete) {
                    const shader = self._pickShader(animate);
                    if (!shader) {
                        originalMethod.call(this, animate, onComplete);
                        return;
                    }

                    this.remove_all_transitions();
                    this.opacity = 255;
                    this.translation_x = 0;
                    this.translation_y = 0;
                    this.scale_x = 1;
                    this.scale_y = 1;
                    setMuted(this, '_muteKeys', false);
                    this.show();

                    applyShader(
                        this,
                        shader,
                        1,
                        0,
                        self._settings.get_int(Keys.POPUP_DURATION),
                        () => {
                            setMuted(this, '_muteInput', false);
                            onComplete?.();
                        },
                        TAG,
                        getStagePadding(),
                    );
                };
            },
        );

        this._injectionManager.overrideMethod(
            BoxPointer.BoxPointer.prototype,
            'close',
            originalMethod => {
                const self = this;

                return function (animate, onComplete) {
                    if (!this.visible)
                        return;

                    const shader = self._pickShader(animate);
                    if (!shader) {
                        // Drop a running shader open so it can't fight the
                        // original close animation
                        this[TAG]?.stop();
                        originalMethod.call(this, animate, onComplete);
                        return;
                    }

                    setMuted(this, '_muteInput', true);
                    setMuted(this, '_muteKeys', true);
                    this.remove_all_transitions();

                    applyShader(
                        this,
                        shader,
                        0,
                        1,
                        self._settings.get_int(Keys.POPUP_DURATION),
                        () => {
                            this.hide();
                            this.opacity = 0;
                            onComplete?.();
                        },
                        TAG,
                        getStagePadding(),
                    );
                };
            },
        );
    }

    disable() {
        this._injectionManager.clear();
    }
}
