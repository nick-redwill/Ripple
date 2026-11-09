import GLib from 'gi://GLib';

import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import BlurAnimation from './blur_animation.js';
import { isBlurMyShellActive } from '../compat/bms.js';
import { applyShader } from '../shader/transition.js';
import { POPUP_COOLDOWN } from '../../constants.js';
import { Keys } from '../../enums.js';
import { isModuleActive } from '../../utils/power.js';
import { SHELL_VERSION } from '../../utils/shell_version.js';

const TAG = '_popupTimeline';
const CLOSING = '_rippleClosing';

/**
 * The monitor a BoxPointer is on. Passed as a callback in applyShader function
 */
function getMonitor(box) {
    return Main.layoutManager.findMonitorForActor(box)
        ?? Main.layoutManager.currentMonitor;
}

/**
 * Turn one of a BoxPointer's input mutes on or off. GNOME 46-50 keep them as
 * booleans, GNOME 51+ as event controllers toggled through `enabled`.
 * Assigning a boolean on 51+ breaks the setup.
 */
function setMuted(box, property, muted) {
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

        this._lastShaderTime = 0; // µs, monotonic
    }

    /**
     * A shader for the transition, or null for GNOME's animation: nothing to
     * animate, module off, or still in the cooldown.
     */
    _pickShader(animate) {
        if (!(animate & BoxPointer.PopupAnimation.FULL)
            || !isModuleActive(this._settings, Keys.POPUP_ENABLED, this._isOnBattery))
            return null;

        const now = GLib.get_monotonic_time();
        if (now - this._lastShaderTime < POPUP_COOLDOWN * 1000)
            return null;

        const shader = this._effectManager.getRandomShader(
            this._settings.get_strv(Keys.POPUP_EFFECTS));
        if (shader)
            this._lastShaderTime = now;
        return shader;
    }

    enable() {
        // A closing popup stays where it is. Popups that share their source,
        // like the background menus of all monitors sharing the dummy cursor,
        // would otherwise jump to where the next one opens.
        this._injectionManager.overrideMethod(
            BoxPointer.BoxPointer.prototype,
            '_reposition',
            originalMethod => function (allocationBox) {
                if (this[CLOSING])
                    allocationBox.set_origin(this.allocation.x1, this.allocation.y1);
                else
                    originalMethod.call(this, allocationBox);
            },
        );

        this._injectionManager.overrideMethod(
            BoxPointer.BoxPointer.prototype,
            'open',
            originalMethod => {
                const self = this;

                return function (animate, onComplete) {
                    this[CLOSING] = false;

                    const shader = self._pickShader(animate);
                    if (!shader) {
                        // A running shader close would hide the popup when done
                        this[TAG]?.stop();
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
                        getMonitor,
                    );
                    if (isBlurMyShellActive())
                        new BlurAnimation(this, shader, this[TAG], getMonitor);
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
                    this[CLOSING] = true;

                    applyShader(
                        this,
                        shader,
                        0,
                        1,
                        self._settings.get_int(Keys.POPUP_DURATION),
                        () => {
                            this[CLOSING] = false;
                            this.hide();
                            this.opacity = 0;
                            onComplete?.();
                        },
                        TAG,
                        getMonitor,
                    );
                    if (isBlurMyShellActive())
                        new BlurAnimation(this, shader, this[TAG], getMonitor);
                };
            },
        );
    }

    disable() {
        this._injectionManager.clear();
    }
}
