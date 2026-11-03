// First "//@padding" line of an effect
const PADDING_PATTERN = /^[ \t]*\/\/[ \t]*@padding\b(.*)$/m;

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

    /**
     * Padding of the effect, from its first `//@padding` line. Takes 1 to 4
     * values exactly like CSS padding:
     *   `//@padding all`
     *   `//@padding vertical horizontal`
     *   `//@padding top horizontal bottom`
     *   `//@padding top right bottom left`
     * Top and bottom are in percent of the actor's height, left and right in
     * percent of its width. A `%` after a value is allowed but can be omitted.
     * A `d` after a value makes it a percent of the actor's diagonal instead,
     * for effects that rotate the actor: `//@padding 100d 0 0 50`.
     * Invalid values are 0, values after the fourth are ignored.
     * @param {string} text - GLSL of an effect
     * @returns {{top: Side, right: Side, bottom: Side, left: Side}}, with
     *   Side = {value: number, diagonal: boolean}
     */
    static parsePadding(text) {
        const values = (text.match(PADDING_PATTERN)?.[1].trim().split(/\s+/) ?? [])
            .filter(v => v !== '')
            .slice(0, 4)
            .map(v => {
                const value = parseFloat(v);
                return { value: value >= 0 ? value : 0, diagonal: v.endsWith('d') };
            });

        const none = { value: 0, diagonal: false };
        const [top = none, right = top, bottom = top, left = right] = values;
        return { top, right, bottom, left };
    }

    get padding() {
        return Effect.parsePadding(this.body);
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