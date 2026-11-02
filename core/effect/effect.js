export default class Effect {
    /**
     * @param {object} params
     * @param {string} params.name - matches the file name (without .ripple)
     * @param {string} params.body - GLSL shader body
     * @param {boolean} [params.builtin] - Whether it ships with the extension
     */
    constructor({ name, body, builtin = false }) {
        if (!name || typeof name !== 'string')
            throw new TypeError('Effect: "name" must be a non-empty string');

        if (!body || typeof body !== 'string')
            throw new TypeError('Effect: "body" must be a non-empty string');

        this.name = name;
        this.body = body;
        this.builtin = builtin;
    }

    /**
     * Whether a name can be used for a new effect. It becomes the filename.
     * @param {string} name
     * @returns {boolean}
     */
    static isValidName(name) {
        return name.length > 0
            && name === name.trim()  // no leading/trailing whitespaces allowed
            && !name.startsWith('.') // no hidden files
            && !name.includes('/');
    }

    toText() {
        return this.body;
    }

    static fromText(name, text, builtin = false) {
        return new Effect({ name, body: text, builtin });
    }

    /** Convenience clone with optional overrides. */
    clone(overrides = {}) {
        return new Effect({ ...this, ...overrides });
    }
}