import Clutter from 'gi://Clutter';

import { PaddingEffect } from './shader.js';

const SHADER_EFFECT_NAME = 'custom-transition';
const PADDING_EFFECT_NAME = 'custom-transition-padding';

/** Padding that lets an effect reach every part of the screen. */
export function getStagePadding() {
    return Math.max(global.stage.get_width(), global.stage.get_height());
}

/**
 * Add a PaddingEffect in front of the actor's effects. Other offscreen effects
 * would otherwise render into a texture of the original size and crop the
 * shader: the dimming of the quick settings menu, and the internal flatten
 * effect of actors with an offscreen redirect, such as every BoxPointer.
 */
function addPadding(actor, padding) {
    const redirect = actor.get_offscreen_redirect();
    actor.set_offscreen_redirect(Clutter.OffscreenRedirect.AUTOMATIC_FOR_OPACITY);

    const effects = actor.get_effects();
    effects.forEach(effect => actor.remove_effect(effect));

    const paddingEffect = new PaddingEffect(padding);
    paddingEffect.set_name(PADDING_EFFECT_NAME);
    paddingEffect.actorRedirect = redirect;
    actor.add_effect(paddingEffect);

    effects.forEach(effect => actor.add_effect(effect));

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
 * Attach a shader (from factory) effect to `actor`, animate progress
 * from → to, then call onDone.
 * Aborts and cleans up any previous transition on the actor; an
 * aborted transition does not run its onDone.
 *
 * The shader is detached when the transition ends, whether it finished or
 * was aborted. Use a new shader for every transition.
 */
export function applyShader(
    actor, shader, from, to, duration, onDone, tag = '_shaderTimeline', padding = 0) {
    // Abort any in-flight transition on this actor, its stopped handler
    // detaches the old shader and padding
    actor[tag]?.stop();

    if (padding > 0)
        addPadding(actor, padding);

    shader.set_name(SHADER_EFFECT_NAME);
    shader.randomize();
    shader.capturePointer();
    shader.progress = from;
    actor.add_effect(shader);

    actor[tag] = animateShader(shader, from, to, duration, finished => {
        actor.remove_effect(shader);
        removePadding(actor);
        actor[tag] = null;
        if (finished)
            onDone?.();
    });
}
