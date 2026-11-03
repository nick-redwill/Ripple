import EffectStorage from './effect_storage.js';
import ShaderFactory from '../shader/shader_factory.js';

import { logInfo, logError, logWarn } from '../../utils/logging.js';

/** Loads effects through EffectStorage and turns them into GLSL shaders. */
export default class EffectManager {
    /** Called after a deleted effect was evicted.
     *  @type {((name: string) => void) | null} */
    onDeleted = null;

    /** Called after a renamed effect was evicted.
     *  @type {((oldName: string, newName: string) => void) | null} */
    onRenamed = null;

    constructor(configPath, defaultPath) {
        this._factory = new ShaderFactory();
        this._storage = new EffectStorage(configPath, defaultPath);

        this._storage.onCreated = effect => {
            logInfo(`EffectManager: ${effect.name} created`);
        };

        this._storage.onUpdated = effect => {
            logInfo(`EffectManager: ${effect.name} updated`);
            this._factory.evict(effect.name);
        };

        this._storage.onDeleted = name => {
            logInfo(`EffectManager: ${name} deleted`);
            this._factory.evict(name);
            this.onDeleted?.(name);
        };

        this._storage.onRenamed = (oldName, newName) => {
            logInfo(`EffectManager: ${oldName} renamed to ${newName}`);
            this._factory.evict(oldName);
            this.onRenamed?.(oldName, newName);
        };
    }

    enable() {
        // Loading effects asynchronously (no blocking IO)
        // Until the effects are loaded there are no shaders, modules use the
        // GNOME animations meanwhile
        this._storage.load()
            .then(() => this._storage.startWatching())
            .catch(e => {
                logError(`EffectManager: could not load the effects: ${e}`);
            });
    }

    disable() {
        this._storage.stopWatching();
        this._factory.clear();
    }

    /** A new shader for an effect, null if it doesn't exist. */
    getShader(name) {
        const effect = this._storage.read(name);
        if (!effect) {
            logWarn(`EffectManager: effect "${name}" not found`);
            return null;
        }
        return this._factory.getShader(effect);
    }

    /**
     * A random name from `names`, or from all effects when it is empty.
     * Null if there are no effects at all.
     */
    pickEffectName(names = []) {
        const candidates = names.length > 0
            ? names
            : this._storage.list().map(effect => effect.name);

        if (candidates.length === 0) {
            logWarn('EffectManager: no effects available');
            return null;
        }
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    getRandomShader(names = []) {
        const name = this.pickEffectName(names);
        return name ? this.getShader(name) : null;
    }

    /**
     * A shader for GLSL that isn't an effect yet.
     * @param {string} body
     * @param {boolean} [outline] - Outline the padded area
     */
    createPreviewShader(body, outline = false) {
        return this._factory.createShader(body, outline);
    }
}