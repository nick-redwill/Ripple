import GLib from "gi://GLib";

import Gio from "../../utils/gio_async.js";
import Effect from "./effect.js";

import { logWarn } from '../../utils/logging.js';

export const EXTENSION = ".ripple";
const DEBOUNCE_MS = 200;

/** "fade.ripple" → "fade", null for other files */
function nameOf(file) {
    const basename = file?.get_basename();
    return basename?.endsWith(EXTENSION)
        ? basename.slice(0, -EXTENSION.length)
        : null;
}

/**
 * Manages .ripple effect files. Effects shipped with the extension are read
 * from defaultPath and can't be changed, the user's own live in configPath.
 * A default takes precedence over a file of the same name in configPath:
 * such a file is ignored entirely, so users can't hide a shipped effect and
 * its changes don't fire callbacks for the default.
 *
 * Read-only, EffectWriter changes the files. load() reads all effects into
 * memory once, everything else is answered from there, and changed files are
 * reloaded while watching. Nothing here blocks on the disk.
 *
 * The callbacks fire once per change of the user's effects while watching,
 * whoever made it: EffectWriter, a file manager, a text editor.
 */
export default class EffectStorage {
    /** @type {((effect: Effect) => void) | null} */
    onCreated = null;

    /** @type {((effect: Effect) => void) | null} Body changed */
    onUpdated = null;

    /** @type {((name: string) => void) | null} */
    onDeleted = null;

    /** @type {((oldName: string, newName: string) => void) | null} */
    onRenamed = null;

    /**
     * @param {string} configPath  - Directory of the user's .ripple files
     * @param {string} defaultPath - Directory of the shipped .ripple files
     */
    constructor(configPath, defaultPath) {
        this.configPath = configPath;
        this.defaultPath = defaultPath;

        this._cache = new Map(); // all effects, user and default (cached by name)
        this._userNames = new Set(); // names of the user's effects as last seen
        this._defaultNames = new Set(); // names of the shipped effects

        this._cancellable = new Gio.Cancellable();
        this._monitor = null;

        this._pending = new Map(); // debounce source ids keyed by name
    }

    /** Read all effects into memory, creating configPath if needed. */
    async load() {
        await this._ensureDir(Gio.File.new_for_path(this.configPath));

        const [defaultNames, userNames] = await Promise.all([
            this._listNames(this.defaultPath),
            this._listNames(this.configPath),
        ]);

        this._defaultNames = new Set(defaultNames);
        for (const name of userNames) {
            if (this._defaultNames.has(name))
                logWarn(
                    `EffectStorage: ignoring "${name}${EXTENSION}" in ` +
                    `${this.configPath}, a default effect has the same name`
                );
            else
                this._userNames.add(name);
        }

        const effects = await Promise.all([
            ...defaultNames.map(name => this._load(name, this._defaultFile(name))),
            ...[...this._userNames].map(name => this._load(name, this._userFile(name))),
        ]);
        for (const effect of effects) {
            if (effect)
                this._cache.set(effect.name, effect);
        }
    }

    exists(name) {
        return this._cache.has(name);
    }

    /** Whether a name belongs to a shipped effect, known after load(). */
    isDefault(name) {
        return this._defaultNames.has(name);
    }

    read(name) {
        return this._cache.get(name)?.clone() ?? null;
    }

    /** All effects, default and the user's, sorted by name. */
    list() {
        return [...this._cache.values()]
            .map(effect => effect.clone())
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /** Fire the callbacks for changes to configPath. */
    startWatching() {
        if (this._monitor)
            return;

        this._monitor = Gio.File.new_for_path(this.configPath)
            .monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);

        this._monitor.connect("changed", (_monitor, file, otherFile, event) => {
            const name = this._userNameOf(file);
            const otherName = this._userNameOf(otherFile);

            // Both user effects: a rename. Otherwise a save through a
            // temporary file, a file moved in or out of the folder, or a
            // rename to or from the name of a default.
            if (event === Gio.FileMonitorEvent.RENAMED && name && otherName) {
                this._syncRename(name, otherName);
                return;
            }

            for (const changed of [name, otherName]) {
                if (changed)
                    this._scheduleSync(changed);
            }
        });
    }

    /** Also stops a load() that is still running. */
    stopWatching() {
        this._cancellable.cancel();

        this._pending.forEach(id => GLib.source_remove(id));
        this._pending.clear();

        this._monitor?.cancel();
        this._monitor = null;
    }

    /** Batch the events of one file, saving can produce several. */
    _scheduleSync(name) {
        if (this._pending.has(name))
            GLib.source_remove(this._pending.get(name));

        this._pending.set(name, GLib.timeout_add(GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
            this._pending.delete(name);
            this._sync(name);
            return GLib.SOURCE_REMOVE;
        }));
    }

    /**
     * Reload a file and report how it differs from what is known about it.
     */
    async _sync(name) {
        const known = this._userNames.has(name);
        const effect = await this._load(name, this._userFile(name), true);
        if (effect === undefined)
            return;

        if (effect === null) {
            if (known) {
                this._forget(name);
                this.onDeleted?.(name);
            }
            return;
        }

        const before = this._cache.get(name)?.body;
        this._cache.set(name, effect);
        this._userNames.add(name);

        if (!known)
            this.onCreated?.(effect.clone());
        else if (effect.body !== before)
            this.onUpdated?.(effect.clone());
    }

    _syncRename(oldName, newName) {
        if (!this._userNames.has(oldName) || this._userNames.has(newName)) {
            // Not a rename this class can explain
            this._scheduleSync(oldName);
            this._scheduleSync(newName);
            return;
        }

        this._moveKnown(oldName, newName);
        this.onRenamed?.(oldName, newName);
    }

    _forget(name) {
        this._userNames.delete(name);
        this._cache.delete(name);
    }

    /** A rename keeps the contents, carry over what is known. */
    _moveKnown(oldName, newName) {
        const cached = this._cache.get(oldName);

        this._forget(oldName);
        this._userNames.add(newName);
        if (cached)
            this._cache.set(newName, cached.clone({ name: newName }));
    }

    _userFile(name) {
        return Gio.File.new_for_path(
            GLib.build_filenamev([this.configPath, `${name}${EXTENSION}`]));
    }

    _defaultFile(name) {
        return Gio.File.new_for_path(
            GLib.build_filenamev([this.defaultPath, `${name}${EXTENSION}`]));
    }

    /**
     * @param {string} name
     * @param {Gio.File} file
     * @param {boolean} [missingIsNull] - report a missing file as null
     * @returns {Promise<Effect | null | undefined>} undefined when it couldn't
     *   be read (or was cancelled), null when missing and missingIsNull
     */
    async _load(name, file, missingIsNull = false) {
        try {
            const [bytes] = await file.load_contents_async(this._cancellable);
            return Effect.fromText(name, new TextDecoder().decode(bytes),
                this._defaultNames.has(name));
        } catch (e) {
            if (missingIsNull && e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return null;
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                logWarn(`EffectStorage: can't read "${name}" – ${e.message}`);
            return undefined;
        }
    }

    async _ensureDir(dir) {
        try {
            await dir.make_directory_async(GLib.PRIORITY_DEFAULT, this._cancellable);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                return;
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;

            await this._ensureDir(dir.get_parent());
            await this._ensureDir(dir);
        }
    }

    /** Effect name of a file in configPath, null if it isn't one or a
     *  default has its name */
    _userNameOf(file) {
        const name = nameOf(file);
        return name && !this._defaultNames.has(name) ? name : null;
    }

    async _listNames(path) {
        const names = [];

        try {
            const iter = await Gio.File.new_for_path(path).enumerate_children_async(
                "standard::name", Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT, this._cancellable);

            for await (const info of iter) {
                const name = nameOf(iter.get_child(info));
                if (name)
                    names.push(name);
            }
        } catch (e) {
            // A missing folder simply has no effects
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
        }

        return names;
    }
}
