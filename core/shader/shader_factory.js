import { Shader, createSnippet } from './shader.js';

/**
 * Creates a new Shader for every animation. The snippet of an effect is kept,
 * so its shaders share the compiled GLSL.
 */
export default class ShaderFactory {
    constructor() {
        this._snippets = new Map(); // Cogl snippets keyed by effect name
    }

    /** A new shader for an effect. */
    getShader(effect) {
        if (!this._snippets.has(effect.name))
            this._snippets.set(effect.name, createSnippet(effect.body));

        return new Shader(this._snippets.get(effect.name), effect.padding);
    }

    /**
     * A shader for some GLSL that isn't an effect.
     * @param {string} body
     * @param {object} padding - See Effect.parsePadding()
     * @param {boolean} [outline] - Outline the padded area
     */
    createShader(body, padding, outline = false) {
        return new Shader(createSnippet(body, outline), padding);
    }

    /** Forget an effect that changed, so its old GLSL isn't used again. */
    evict(name) {
        this._snippets.delete(name);
    }

    clear() {
        this._snippets.clear();
    }
}
