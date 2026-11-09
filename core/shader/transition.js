import Clutter from 'gi://Clutter';

import { Mirror } from './mirror.js';
import { PaddingEffect } from './shader.js';

const SHADER_EFFECT_NAME = 'custom-transition';
const PADDING_EFFECT_NAME = 'custom-transition-padding';

/**
 * Add a PaddingEffect before every offscreen effect of the actor, or they
 * crop the shader to the actor's size. An offscreen redirect crops it the
 * same way: BoxPointers use ALWAYS, which draws them through a texture of
 * their own size. It's turned off (0, Clutter's default) until the shader is
 * removed, then restored.
 *
 * Effects can only be appended, so the first offscreen effect and every
 * effect after it are removed and added back after the PaddingEffect. The
 * ones before it stay untouched, as removing an effect resets it, e.g. Blur
 * my Shell's backdrop capture would lose its blur.
 */
function addPadding(actor, area, shader) {
    const redirect = actor.get_offscreen_redirect();
    actor.set_offscreen_redirect(0);

    const effects = actor.get_effects();
    const first = effects.findIndex(effect => effect instanceof Clutter.OffscreenEffect);
    const moved = first < 0 ? [] : effects.slice(first);
    moved.forEach(effect => actor.remove_effect(effect));

    const paddingEffect = new PaddingEffect(area, shader);
    paddingEffect.set_name(PADDING_EFFECT_NAME);
    paddingEffect.actorRedirect = redirect;
    actor.add_effect(paddingEffect);

    moved.forEach(effect => actor.add_effect(effect));

    // Adding an effect doesn't update the area Clutter redraws for the actor,
    // everything outside its old paint volume would stay unpainted
    actor.invalidate_paint_volume();
}

function removePadding(actor) {
    const effect = actor.get_effect(PADDING_EFFECT_NAME);
    if (effect) {
        actor.remove_effect(effect);
        actor.set_offscreen_redirect(effect.actorRedirect);
        actor.invalidate_paint_volume();
    }
}

/**
 * Animate a shader effect's progress property from → to over duration ms.
 * Returns the timeline so the caller can abort it if needed.
 */
function animateShader(shader, from, to, duration, onDone) {
    const timeline = new Clutter.Timeline({
        duration,
        repeat_count: 0,
        actor: global.stage,
    });

    timeline.connect('new-frame', (_tl, ms) => {
        const t = Math.min(ms / duration, 1.0);
        const eased = t * t * (3 - 2 * t); // smooth-step
        shader.progress = from + (to - from) * eased;
    });

    timeline.connect('stopped', (_tl, isFinished) => {
        if (isFinished)
            shader.progress = to;
        onDone(isFinished);
    });

    timeline.start();
    return timeline;
}

/**
 * Attach a shader without animating it, e.g. a Mirror. With an area it gets
 * padding, see applyShader().
 */
export function attachShader(actor, shader, area = null) {
    if (area)
        addPadding(actor, area, shader);

    shader.set_name(SHADER_EFFECT_NAME);
    shader.randomize();
    shader.capturePointer();
    actor.add_effect(shader);
}

/** Remove a shader and its padding from `actor`. */
export function detachShader(actor, shader) {
    actor.remove_effect(shader);
    removePadding(actor);
}

/**
 * Run `source`'s transition on another actor too, in step with it, see
 * Mirror. `source` must already be applied.
 * @returns {() => void} detaches it
 */
export function mirrorShader(actor, source, area = null) {
    const mirror = new Mirror(source);
    attachShader(actor, mirror, area);
    return () => detachShader(actor, mirror);
}

/**
 * Attach a shader to `actor`, animate progress
 * from → to, then call onDone.
 * Aborts and cleans up any previous transition on the actor; an
 * aborted transition does not run its onDone.
 *
 * The shader is detached when the transition ends, whether it finished or
 * was aborted. Use a new shader for every transition.
 *
 * Padding comes from the effect's //@padding line, `area` (e.g. the actor's
 * monitor) sets a hard limit for it.
 *
 * Padding texture based on global.stage's width/height (for popups)
 * was a horrific idea that caused massive memory usage when popups were
 * opened/closed frequently.
 * Hence the idea is to minimize padding as much as possible.
 */
export function applyShader(
    actor, shader, from, to, duration, onDone, tag = '_shaderTimeline', area = null) {
    // Abort a running transition, which detaches its shader
    actor[tag]?.stop();

    shader.progress = from;
    attachShader(actor, shader, area);

    actor[tag] = animateShader(shader, from, to, duration, finished => {
        detachShader(actor, shader);
        actor[tag] = null;
        if (finished)
            onDone?.();
    });
}
