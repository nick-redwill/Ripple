import GObject from "gi://GObject";
import Cogl from "gi://Cogl";
import Clutter from "gi://Clutter";

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
    return texture2D(_texture, st);
}
`;

const MAIN = `
vec2 uv = (cogl_tex_coord_in[0].st - _rect.xy) / _rect.zw;
cogl_color_out = effect(uv) * cogl_color_in;
`;

/**
 * Compile-ready snippet for an effect file. Share it between the instances of
 * an effect so that Cogl can reuse the compiled shader.
 * @param {string} body
 * @returns {Cogl.Snippet}
 */
export function createSnippet(body) {
    return Cogl.Snippet.new(
        Cogl.SnippetHook.FRAGMENT, `${DECLARATIONS}\n${body}\n`, MAIN
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
 * Grows the actor's paint volume so a Shader added after it gets a larger
 * offscreen texture. This has to be a separate effect: during painting, Clutter
 * only applies the effects before the current one to the paint volume, so a
 * Shader can't enlarge its own texture.
 */
export const PaddingEffect = GObject.registerClass(
    class PaddingEffect extends Clutter.Effect {
        _init(padding) {
            super._init();
            this._padding = padding;
        }

        vfunc_modify_paint_volume(volume) {
            const origin = volume.get_origin();
            const p = this._padding;

            volume.union_box(new Clutter.ActorBox({
                x1: origin.x - p,
                y1: origin.y - p,
                x2: origin.x + volume.get_width() + p,
                y2: origin.y + volume.get_height() + p,
            }));
            return true;
        }
    },
);

export const Shader = GObject.registerClass(
    class Shader extends Clutter.OffscreenEffect {
        _init(snippet) {
            super._init();

            this._snippet = snippet;
            this._pipeline = null;
            this._progress = 0.0;
            this._random = Math.random();
            this._mouse = [0, 0];
        }

        /** Find the actor's rectangle inside the offscreen texture. */
        _getActorRect(actor) {
            const width = actor.get_width();
            const height = actor.get_height();
            const volume = actor.get_paint_volume();

            if (volume) {
                const origin = volume.get_origin();
                return [
                    locateInTexture(origin.x, origin.x + volume.get_width(), 0, width),
                    locateInTexture(origin.y, origin.y + volume.get_height(), 0, height),
                ];
            }

            const box = actor.get_allocation_box();
            return [
                locateInTexture(box.x1, box.x2, box.x1, width),
                locateInTexture(box.y1, box.y2, box.y1, height),
            ];
        }

        _updateUniforms(pipeline) {
            const actor = this.get_actor();
            const [[x, w], [y, h]] = this._getActorRect(actor);
            const texture = this.get_texture();
            const [mouseX, mouseY] = this._mouse;
            const [actorX, actorY] = actor.get_transformed_position();

            pipeline.set_uniform_1i(this._textureLocation, 0);

            const values = {
                _progress: this._progress,
                _random: this._random,

                // Size of the actor in pixels, so effects can keep circles
                // round and blocks square
                _resolutionX: texture.get_width() * w,
                _resolutionY: texture.get_height() * h,

                _rectX: x,
                _rectY: y,
                _rectW: w,
                _rectH: h,

                // Where the pointer was when the transition started, on the
                // stage and in the same coordinates as uv
                _mouseX: mouseX,
                _mouseY: mouseY,
                _mouseUVX: (mouseX - actorX) / actor.get_width(),
                _mouseUVY: (mouseY - actorY) / actor.get_height(),
            };

            for (const name of FLOAT_UNIFORMS)
                pipeline.set_uniform_1f(this._locations[name], values[name]);
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

        get progress() {
            return this._progress;
        }

        set progress(v) {
            this._progress = v;
            this.get_actor()?.queue_redraw();
        }
    },
);
