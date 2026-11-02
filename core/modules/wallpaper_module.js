import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import { applyShader } from '../shader/transition.js';
import { Keys } from '../../enums.js';
import { isModuleActive } from '../../utils/power.js';

const TAG = '_wallpaperTimeline';

/**
 * Replaces the fade between two wallpapers with a shader transition, played
 * on the old wallpaper or, if Keys.WALLPAPER_ANIMATE_NEW is on, the new one.
 * All monitors use the effect picked for the primary one.
 */
export default class WallpaperModule {
    constructor(effectManager, settings, isOnBattery) {
        this._injectionManager = new InjectionManager();
        this._effectManager = effectManager;
        this._settings = settings;
        this._isOnBattery = isOnBattery;
        this._shaderName = null;
    }

    enable() {
        this._injectionManager.overrideMethod(
            Background.BackgroundManager.prototype,
            '_swapBackgroundActor',
            originalMethod => {
                const effectManager = this._effectManager;
                const self = this;

                return function () {
                    if (!isModuleActive(self._settings, Keys.WALLPAPER_ENABLED, self._isOnBattery)) {
                        originalMethod.call(this);
                        return;
                    }

                    const list = self._settings.get_strv(Keys.WALLPAPER_EFFECTS);
                    if (this._monitorIndex === 0)
                        self._shaderName = effectManager.pickEffectName(list);

                    const shader = self._shaderName
                        ? effectManager.getShader(self._shaderName)
                        : null;

                    if (!shader) {
                        // Nothing to animate with, let GNOME do the whole swap
                        originalMethod.call(this);
                        return;
                    }

                    const oldBackgroundActor = this.backgroundActor;
                    const newBackgroundActor = this._newBackgroundActor;
                    this.backgroundActor = newBackgroundActor;
                    this._newBackgroundActor = null;
                    this.emit('changed');

                    // The wallpaper changed again mid-animation: end that
                    // animation and drop the wallpaper it was replacing
                    const pending = this._ripplePendingActor;
                    pending?.[TAG]?.stop();
                    oldBackgroundActor[TAG]?.stop();
                    pending?.destroy();
                    this._ripplePendingActor = oldBackgroundActor;

                    const animateNew = self._settings.get_boolean(Keys.WALLPAPER_ANIMATE_NEW);

                    // GNOME keeps the new actor below the old one, the effect
                    // has to play on top
                    if (animateNew) {
                        this._container.set_child_above_sibling(
                            newBackgroundActor, oldBackgroundActor
                        );
                    }

                    applyShader(
                        animateNew ? newBackgroundActor : oldBackgroundActor,
                        shader,
                        animateNew ? 1 : 0,
                        animateNew ? 0 : 1,
                        self._settings.get_int(Keys.WALLPAPER_DURATION),
                        () => {
                            // Back to GNOME's order, the desktop background
                            // stays at the bottom
                            if (animateNew && this._controlPosition)
                                this._container.set_child_below_sibling(newBackgroundActor, null);

                            this._ripplePendingActor = null;
                            oldBackgroundActor.destroy();
                        },
                        TAG,
                    );
                };
            },
        );
    }

    disable() {
        this._injectionManager.clear();
    }
}