import GObject from "gi://GObject";

import { Shader } from "./shader.js";

/**
 * Runs a shader's effect on another actor in step with it, e.g. on a blur
 * behind a popup.
 *
 * It shares the source's effect, padding, random value, pointer and progress.
 * uv covers the source's actor (the reference), and pixel() is empty outside
 * of it.
 *
 * It has no timeline: attach it with attachShader() while the source runs
 * and detach it when that ends.
 */
export const Mirror = GObject.registerClass(
class Mirror extends Shader {
    /** @param {Shader} source - Already applied to its actor */
    constructor(source) {
        super(source.snippet, source.padding);
        this._source = source;
        this._reference = source.get_actor();
    }

    /** The reference's rectangle, relative to the actor. */
    getActorRect(actor) {
        const [actorX, actorY] = actor.get_transformed_position();
        const [x, y] = this._reference.get_transformed_position();
        return {
            x: x - actorX,
            y: y - actorY,
            width: this._reference.get_width(),
            height: this._reference.get_height(),
        };
    }

    _getUniforms(actor) {
        return { ...super._getUniforms(actor), _clipToRect: 1 };
    }

    randomize() {
        this._random = this._source._random;
    }

    capturePointer() {
        this._mouse = [...this._source._mouse];
    }

    get progress() {
        return this._source.progress;
    }

    // Follows the source, see progress
    set progress(_v) {
    }
});
