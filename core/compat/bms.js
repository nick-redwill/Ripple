// Functions necessary for animating Blur my Shell's blur actors too
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BMS_BLUR = 'bms-popup-blurred-widget';
const BMS_STATIC_GROUP = 'bms-popup-backgroundgroup';

/**
 * Find the blur behind a popup. Blur my Shell puts it right below the popup's
 * top-level actor, e.g. the Quick Settings menu. 
 * 
 * The static blur is a wallpaper inside a background group, 
 * which has no paint volume, so the wallpaper is returned.
 */
export function findBlur(box) {
    for (let actor = box; actor && actor !== Main.uiGroup; actor = actor.get_parent()) {
        const sibling = actor.get_previous_sibling();
        if (sibling?.name === BMS_STATIC_GROUP)
            return sibling.get_children().find(child => child.name === BMS_BLUR) ?? null;
        if (sibling?.name === BMS_BLUR)
            return sibling;
    }
    return null;
}

export function isStaticBlur(blur) {
    return blur.get_parent()?.name === BMS_STATIC_GROUP;
}

/**
 * Remove the static blur's clip so it doesn't cut off the effect. However,
 * we override get_clip and has_clip and fake it so BMS can apply its
 * rounded corners correctly.
 *  
 * @returns {() => void} undoes everything
 */
function liftClip(blur) {
    let clip = blur.has_clip ? blur.get_clip() : null;
    blur.remove_clip();

    // Blur my Shell sets it again as the popup moves. Only setting a clip
    // notifies clip-rect.
    const clipId = blur.connect('notify::clip-rect', () => {
        clip = Clutter.Actor.prototype.get_clip.call(blur);
        blur.remove_clip();
    });

    blur.get_clip = () => clip;
    Object.defineProperty(blur, 'has_clip', {
        get: () => clip !== null,
        configurable: true,
    });

    return () => {
        blur.disconnect(clipId);
        delete blur.get_clip;
        delete blur.has_clip;
        if (clip && !blur.has_clip)
            blur.set_clip(...clip);
    };
}

/**
 * Stop the dynamic blur clipping to its allocation, the popup's size.
 * @returns {() => void} undoes everything
 */
function liftAllocationClip(blur) {
    const clipsToAllocation = blur.clip_to_allocation;
    blur.clip_to_allocation = false;

    return () => (blur.clip_to_allocation = clipsToAllocation);
}

/**
 * Post-process a static blur after a transition was attached to it.
 * @param {Clutter.Actor} blur - From findBlur()
 * @param {Clutter.Effect[]} blurEffects - Its effects before the transition
 * @returns {() => void} undoes it, call it before detaching the transition
 */
export function handleStatic(blur, blurEffects) {
    // We need our effects (padding and transition) to be the first ones,
    // otherwise the actor's effects will apply over those (and we will get
    // blurred animation)
    blurEffects.forEach(effect => {
        blur.remove_effect(effect);
        blur.add_effect(effect);
    });

    // Its clip would cut off the effect, the transition already limits it to
    // the popup
    return liftClip(blur);
}

/**
 * Post-process a dynamic blur after a transition was attached to it. Its
 * backdrop capture stays first, the blur is drawn by a child actor.
 * @param {Clutter.Actor} blur - From findBlur()
 * @returns {() => void} undoes it, call it before detaching the transition
 */
export function handleDynamic(blur) {
    // Its allocation would cut off the effect, the transition already limits
    // it to the popup
    return liftAllocationClip(blur);
}
