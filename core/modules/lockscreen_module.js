import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { ScreenShield } from 'resource:///org/gnome/shell/ui/screenShield.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import { applyShader } from '../shader/transition.js';
import { Keys } from '../../enums.js';
import { isModuleActive } from '../../utils/power.js';

const TAG = '_lockTimeline';

// Extra time before input comes back on its own if the lock animation
// never finishes, so the lock screen can't stay unusable
const INPUT_FALLBACK_DELAY = 2000;

const { State } = MessageTray;

/**
 * Replaces the curtain slide of the lock screen with a shader transition.
 *
 * Effects are authored as "disappear" transitions (progress 0 = visible,
 * 1 = gone), so locking runs them backwards.
 *
 * Non-animated locks (idle fade, resume, logind) keep the original code path,
 * because they must not leave the desktop visible. Unlocks always animate, as
 * they do in GNOME.
 */
export default class LockscreenModule {
    constructor(effectManager, settings, isOnBattery) {
        this._settings = settings;
        this._isOnBattery = isOnBattery;
        this._injectionManager = new InjectionManager();
        this._effectManager = effectManager;

        this._blockedShield = null;
        this._inputFallbackId = 0;
    }

    _pickShader(shield) {
        if (shield._isGreeter
            || !St.Settings.get().enable_animations
            || !isModuleActive(this._settings, Keys.LOCKSCREEN_ENABLED, this._isOnBattery))
            return null;

        return this._effectManager.getRandomShader(
            this._settings.get_strv(Keys.LOCKSCREEN_EFFECTS));
    }

    _getDuration() {
        return this._settings.get_int(Keys.LOCKSCREEN_DURATION);
    }

    /**
     * Ignore input to the unlock dialog while the lock screen animates in, a
     * key or click would bring up the password prompt mid-effect. The focus
     * moves away from the dialog, which already got it in
     * _ensureUnlockDialog().
     */
    _blockInput(shield) {
        shield._dialog.reactive = false;
        shield._lockDialogGroup.grab_key_focus();

        this._blockedShield = shield;
        this._inputFallbackId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            this._getDuration() + INPUT_FALLBACK_DELAY,
            () => {
                this._inputFallbackId = 0;
                this._unblockInput(shield);
                return GLib.SOURCE_REMOVE;
            },
        );
    }

    _unblockInput(shield) {
        if (this._inputFallbackId) {
            GLib.source_remove(this._inputFallbackId);
            this._inputFallbackId = 0;
        }
        this._blockedShield = null;

        if (!shield._dialog)
            return;

        shield._dialog.reactive = true;

        // Leave the focus alone if something else took it meanwhile, such as
        // the PIN entry after a smartcard was inserted
        if (global.stage.key_focus === shield._lockDialogGroup)
            shield._dialog.grab_key_focus();
    }

    enable() {
        const self = this;

        this._injectionManager.overrideMethod(
            ScreenShield.prototype,
            '_resetLockScreen',
            originalMethod => {
                return function (params) {
                    const shader = params.animateLockScreen
                        && this._lockScreenState === State.HIDDEN
                        ? self._pickShader(this)
                        : null;

                    if (!shader) {
                        originalMethod.call(this, params);
                        return;
                    }

                    const { fadeToBlack } = params;
                    const group = this._lockDialogGroup;

                    this._lockScreenGroup.show();
                    this._lockScreenState = State.SHOWING;

                    group.remove_all_transitions();
                    group.translation_y = 0;

                    self._blockInput(this);

                    applyShader(
                        group,
                        shader,
                        1,
                        0,
                        self._getDuration(),
                        () => {
                            self._unblockInput(this);
                            this._lockScreenShown({ fadeToBlack, animateFade: true });
                        },
                        TAG,
                    );
                };
            },
        );

        this._injectionManager.overrideMethod(
            ScreenShield.prototype,
            '_continueDeactivate',
            originalMethod => {
                return function (animate) {
                    const group = this._lockDialogGroup;

                    // An unlock can interrupt the lock animation, which skips
                    // giving input back to the dialog
                    self._unblockInput(this);

                    // `animate` is ignored like in the original, which always
                    // slides the curtain away. A password unlock goes through
                    // logind and arrives here with animate = false.
                    const shader = this._lockScreenState !== State.HIDDEN
                        && self._settings.get_boolean(Keys.LOCKSCREEN_ANIMATE_UNLOCK)
                        ? self._pickShader(this)
                        : null;

                    if (!shader) {
                        // Drop a running shader so it can't fight the original
                        // slide, or finish a lock that is being undone
                        group[TAG]?.stop();
                        originalMethod.call(this, animate);
                        return;
                    }

                    // Same teardown as the original, minus the slide
                    this._lockScreenState = State.HIDING;
                    group.remove_all_transitions();
                    this._showPointer();

                    // Must happen before the animation: GNOME hides the windows
                    // in this mode, so the effect would reveal nothing
                    if (Main.sessionMode.currentMode === 'unlock-dialog')
                        Main.sessionMode.popMode('unlock-dialog');

                    this.emit('wake-up-screen');

                    this._dialog.popModal();

                    if (this._grab) {
                        Main.popModal(this._grab);
                        this._grab = null;
                    }

                    this._longLightbox.lightOff();
                    this._shortLightbox.lightOff();

                    applyShader(
                        group,
                        shader,
                        0,
                        1,
                        self._getDuration(),
                        () => {
                            this._hideLockScreenComplete();
                            this._completeDeactivate();
                        },
                        TAG,
                    );
                };
            },
        );

        this._injectionManager.overrideMethod(
            ScreenShield.prototype,
            'activate',
            originalMethod => {
                return function (animate) {
                    // A lock arrived during the unlock animation. The original
                    // would ignore it here and then unlock when the animation
                    // ends, so finish the unlock now and lock from clean state.
                    if (this._lockScreenState === State.HIDING
                        && this._lockDialogGroup[TAG]) {
                        this._lockDialogGroup[TAG].stop();
                        this._hideLockScreenComplete();
                        this._completeDeactivate();
                    }

                    originalMethod.call(this, animate);
                };
            },
        );
    }

    /**
     * A transition still running here is left to finish: stopping an unlock
     * would skip _completeDeactivate and leave the shield up.
     */
    disable() {
        if (this._blockedShield)
            this._unblockInput(this._blockedShield);

        this._injectionManager.clear();
    }
}
