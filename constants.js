// Values shared across the extension and the preferences, or worth tuning in
// one place. Plain values only, no imports allowed!

export const EFFECT_FILE_EXTENSION = ".ripple";

/** Limits of every duration setting, in ms. Keep in sync with the schema. */
export const MIN_DURATION = 100;
export const MAX_DURATION = 60000;
export const DURATION_STEP = 50;

/** Wait for more events of a changed effect file, in ms */
export const STORAGE_DEBOUNCE = 200;

/** Minimum time between popup shaders, in ms. Sooner ones use GNOME's animation */
export const POPUP_COOLDOWN = 100;

/** Extra time after the lock animation, in ms, before input comes back anyway */
export const LOCKSCREEN_INPUT_FALLBACK_DELAY = 2000;

export const PREVIEW_WIDTH = 420;
export const PREVIEW_HEIGHT = 180;
