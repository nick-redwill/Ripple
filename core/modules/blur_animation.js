import { findBlur, handleDynamic, handleStatic, isStaticBlur } from '../compat/bms.js';
import { mirrorShader } from '../shader/transition.js';

/**
 * Mirrors a popup's transition on its Blur my Shell blur too. The blur is
 * looked for on every frame, as Blur my Shell may add it late or replace it,
 * e.g. on the first open. Cleans up when the transition ends.
 */
export default class BlurAnimation {
    /**
     * @param {Clutter.Actor} box - The popup's BoxPointer
     * @param {Shader} shader - Already applied to the box
     * @param {Clutter.Timeline} timeline - The shader's transition
     * @param {object | Function} area - Limit for the padding, see applyShader()
     */
    constructor(box, shader, timeline, area) {
        this._box = box;
        this._shader = shader;
        this._area = area;

        this._forget();
        this._update();

        // Runs after Blur my Shell's BEFORE_REDRAW laters, which add the blur,
        // and before painting. The timeline's new-frame runs before them.
        this._updateId = global.stage.connect('before-update', () => this._update());
        timeline.connect('stopped', () => this._stop());
    }

    _update() {
        const blur = findBlur(this._box);
        if (blur === this._blur)
            return;

        this._release();
        if (blur)
            this._attach(blur);
    }

    _attach(blur) {
        const blurEffects = blur.get_effects();

        this._blur = blur;
        this._detach = mirrorShader(blur, this._shader, this._area);
        this._restore = isStaticBlur(blur)
            ? handleStatic(blur, blurEffects)
            : handleDynamic(blur);

        // Blur my Shell may destroy it meanwhile, nothing to undo then
        this._destroyId = blur.connect('destroy', () => this._forget());
    }

    _release() {
        if (!this._blur)
            return;

        this._blur.disconnect(this._destroyId);
        this._restore();
        this._detach();
        this._forget();
    }

    _forget() {
        this._blur = null;
        this._detach = null;
        this._restore = null;
        this._destroyId = 0;
    }

    _stop() {
        global.stage.disconnect(this._updateId);
        this._release();
    }
}
