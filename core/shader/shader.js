import GObject from "gi://GObject";
import Cogl from "gi://Cogl";
import Clutter from "gi://Clutter";
import Graphene from "gi://Graphene";

// NOTE:
// Every value is sent as a single float. Sending plain arrays
// can cause a Shell crash with SIGSEGV on some MUTTER versions
// Honestly this is the safest and simplest option
const FLOAT_UNIFORMS = [
    '_progress', '_random',
    '_resolutionX', '_resolutionY',
    '_rectX', '_rectY', '_rectW', '_rectH',
    '_mouseX', '_mouseY',
    '_mouseUVX', '_mouseUVY',
    '_clipToRect',
];

// Everything an effect file can use. The file itself is appended to this and
// must define: vec4 effect(vec2 uv)
const DECLARATIONS = `
${FLOAT_UNIFORMS.map(name => `uniform float ${name};`).join('\n')}
uniform sampler2D _texture;

#define _resolution vec2(_resolutionX, _resolutionY)
#define _rect vec4(_rectX, _rectY, _rectW, _rectH)
#define _mouse vec2(_mouseX, _mouseY)
#define _mouseUV vec2(_mouseUVX, _mouseUVY)

vec4 pixel(vec2 uv) {
    vec2 st = _rect.xy + uv * _rect.zw;
    if (st.x < 0.0 || st.x > 1.0 || st.y < 0.0 || st.y > 1.0)
        return vec4(0.0);
    // Set by a Mirror, see mirror.js
    if (_clipToRect > 0.5 && (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0))
        return vec4(0.0);
    return texture2D(_texture, st);
}
`;

const MAIN = `
vec2 uv = (cogl_tex_coord_in[0].st - _rect.xy) / _rect.zw;
cogl_color_out = effect(uv) * cogl_color_in;
`;

// 2px red outline around the padded area (the offscreen texture)
const OUTLINE = `
vec2 outlineSize = _resolution / _rect.zw;
vec2 outlinePx = cogl_tex_coord_in[0].st * outlineSize;
if (min(min(outlinePx.x, outlinePx.y),
        min(outlineSize.x - outlinePx.x, outlineSize.y - outlinePx.y)) < 2.0)
    cogl_color_out = vec4(1.0, 0.0, 0.0, 1.0);
`;

/**
 * Compile-ready snippet for an effect file. Share it between the instances of
 * an effect so that Cogl can reuse the compiled shader.
 * @param {string} body
 * @param {boolean} [outline] - Draw the edge of the padded area
 * @returns {Cogl.Snippet}
 */
export function createSnippet(body, outline = false) {
    return Cogl.Snippet.new(
        Cogl.SnippetHook.FRAGMENT, `${DECLARATIONS}\n${body}\n`,
        outline ? MAIN + OUTLINE : MAIN
    );
}

/**
 * Where the actor lies along one axis of the offscreen texture, as a fraction
 * of it. Follows _clutter_actor_box_enlarge_for_effects, which pads the box by
 * 3px, mostly on the top / left.
 *
 * @param {number} start  - Start of the paint box
 * @param {number} end    - End of the paint box
 * @param {number} origin - Where the actor starts, in the same coordinates
 * @param {number} size   - Size of the actor
 * @returns {[number, number]} offset and size
 */
function locateInTexture(start, end, origin, size) {
    const length = Math.round(end - start);
    const textureLength = length + 3;
    const textureStart = Math.ceil(end + 0.75) - textureLength;

    return [(origin - textureStart) / textureLength, size / textureLength];
}

/**
 * Makes the Shader's texture cover the padded area instead of just the actor.
 *
 * An offscreen effect renders the actor into a texture the size of its paint
 * volume (the area Clutter thinks it draws on) and can only draw inside it.
 * This effect sets that volume to the actor grown by its padding, cut to a
 * limit such as its monitor.
 *
 * Must be added before the Shader: Clutter only lets the effects before an
 * effect change the volume its texture is made from.
 */
export const PaddingEffect = GObject.registerClass(
    class PaddingEffect extends Clutter.Effect {
        /**
         * @param {{x: number, y: number, width: number, height: number} |
         *   ((actor: Clutter.Actor) => object)} area - Limit in stage
         *   coordinates, such as a monitor. A function is called once, on the
         *   first paint, when the actor is in place.
         * @param {Shader} shader - The shader the texture is for
         */
        _init(area, shader) {
            super._init();
            this._area = area;
            this._shader = shader;
        }

        vfunc_modify_paint_volume(volume) {
            const actor = this.get_actor();
            if (typeof this._area === 'function')
                this._area = this._area(actor);
            const area = this._area;
            const { top, right, bottom, left } = this._shader.padding;
            const { width, height } = this._shader.getUVRect(actor);
            const toPixels = (side, size) =>
                side.value / 100 * (side.diagonal ? Math.hypot(width, height) : size);

            // Relative to the actor, which may move after the effect is added
            const [x, y] = actor.get_transformed_position();
            const origin = volume.get_origin();

            const x1 = Math.max(origin.x - toPixels(left, width), area.x - x);
            const y1 = Math.max(origin.y - toPixels(top, height), area.y - y);
            const x2 = Math.min(origin.x + volume.get_width() + toPixels(right, width),
                area.x + area.width - x);
            const y2 = Math.min(origin.y + volume.get_height() + toPixels(bottom, height),
                area.y + area.height - y);

            // The actor is outside the limit
            if (x2 <= x1 || y2 <= y1)
                return true;

            volume.set_origin(new Graphene.Point3D({ x: x1, y: y1, z: origin.z }));
            volume.set_width(x2 - x1);
            volume.set_height(y2 - y1);
            return true;
        }
    },
);

export const Shader = GObject.registerClass(
class Shader extends Clutter.OffscreenEffect {
    _init(snippet, padding) {
        super._init();

        this._snippet = snippet;
        this._padding = padding;
        this._pipeline = null;
        this._progress = 0.0;
        this._random = Math.random();
        this._mouse = [0, 0];
    }

    /**
     * The rectangle uv covers, in the actor's coordinates. By default the
     * actor itself; a Mirror uses its source's actor.
     * @param {Clutter.Actor} actor
     * @returns {{x: number, y: number, width: number, height: number}}
     */
    getUVRect(actor) {
        return { x: 0, y: 0, width: actor.get_width(), height: actor.get_height() };
    }

    /** Find the rectangle uv covers inside the offscreen texture. */
    _getActorRect(actor) {
        const rect = this.getUVRect(actor);
        const volume = actor.get_paint_volume();

        if (volume) {
            const origin = volume.get_origin();
            return [
                locateInTexture(origin.x, origin.x + volume.get_width(), rect.x, rect.width),
                locateInTexture(origin.y, origin.y + volume.get_height(), rect.y, rect.height),
            ];
        }

        const box = actor.get_allocation_box();
        return [
            locateInTexture(box.x1, box.x2, box.x1 + rect.x, rect.width),
            locateInTexture(box.y1, box.y2, box.y1 + rect.y, rect.height),
        ];
    }

    /** Values of FLOAT_UNIFORMS, missing ones are 0. */
    _getUniforms(actor) {
        const [[x, w], [y, h]] = this._getActorRect(actor);
        const texture = this.get_texture();
        const [mouseX, mouseY] = this._mouse;
        const rect = this.getUVRect(actor);
        const [actorX, actorY] = actor.get_transformed_position();

        return {
            _progress: this.progress,
            _random: this._random,

            // Size of what uv covers, in pixels, so effects can keep circles
            // round and blocks square
            _resolutionX: texture.get_width() * w,
            _resolutionY: texture.get_height() * h,

            _rectX: x,
            _rectY: y,
            _rectW: w,
            _rectH: h,

            // Pointer at the start, on the stage and in uv
            _mouseX: mouseX,
            _mouseY: mouseY,
            _mouseUVX: (mouseX - actorX - rect.x) / rect.width,
            _mouseUVY: (mouseY - actorY - rect.y) / rect.height,
        };
    }

    _updateUniforms(pipeline) {
        const values = this._getUniforms(this.get_actor());

        pipeline.set_uniform_1i(this._textureLocation, 0);
        for (const name of FLOAT_UNIFORMS)
            pipeline.set_uniform_1f(this._locations[name], values[name] ?? 0);
    }

    vfunc_paint_target(...params) {
        const pipeline = this.get_pipeline();

        // Clutter creates a new pipeline whenever the texture changes
        if (pipeline !== this._pipeline) {
            pipeline.add_snippet(this._snippet);

            this._pipeline = pipeline;
            this._textureLocation = pipeline.get_uniform_location('_texture');
            this._locations = Object.fromEntries(FLOAT_UNIFORMS.map(
                name => [name, pipeline.get_uniform_location(name)]));
        }

        this._updateUniforms(pipeline);
        super.vfunc_paint_target(...params);
    }

    randomize() {
        this._random = Math.random();
    }

    /** Remember the pointer position for the coming transition. */
    capturePointer() {
        const [x, y] = global.get_pointer();
        this._mouse = [x, y];
    }

    get padding() {
        return this._padding;
    }

    get snippet() {
        return this._snippet;
    }

    get progress() {
        return this._progress;
    }

    set progress(v) {
        this._progress = v;
        this.get_actor()?.queue_redraw();
    }
});
