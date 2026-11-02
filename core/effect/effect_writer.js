import Gio from "gi://Gio";
import GLib from "gi://GLib";

import Effect from "./effect.js";
import { EXTENSION } from "./effect_storage.js";

/**
 * Creates, changes and deletes the user's effect files. Used by the
 * preferences only:
 * **SHOULD NOT** be used in Shell code, since the file operations block.
 *
 * It only changes files. The EffectStorage it is given must be watching to see
 * the changes, its callbacks then fire as for any other change.
 */
export default class EffectWriter {
    /** @param {import("./effect_storage.js").default} storage */
    constructor(storage) {
        this._storage = storage;
    }

    /** @param {{name: string, body: string}} params */
    create({ name, body }) {
        this._checkNewName(name);
        this._write(new Effect({ name, body }));
    }

    /**
     * Change the body of a user's effect, and rename it if `changes.name`
     * differs.
     * @param {string} name
     * @param {{name?: string, body?: string}} changes
     */
    update(name, { name: newName = name, body } = {}) {
        this._checkOwn(name);

        if (newName !== name) {
            this._checkNewName(newName);
            this._file(name).move(this._file(newName), Gio.FileCopyFlags.NONE, null, null);
        }

        // An unchanged body is written too, EffectStorage reports nothing
        // for it
        if (body !== undefined)
            this._write(new Effect({ name: newName, body }));
    }

    /** @param {string} name */
    delete(name) {
        this._checkOwn(name);
        this._file(name).delete(null);
    }

    /**
     * Throw unless the name is an effect of the user. Defaults come from the
     * storage, which knows them from the start, the file from the disk, as
     * the storage only sees changes a moment later.
     */
    _checkOwn(name) {
        if (this._storage.isDefault(name))
            throw new Error(`EffectWriter: "${name}" is a default effect`);
        if (!this._file(name).query_exists(null))
            throw new Error(`EffectWriter: effect "${name}" not found`);
    }

    _checkNewName(name) {
        if (!Effect.isValidName(name))
            throw new Error(`EffectWriter: invalid name "${name}"`);
        if (this._storage.isDefault(name) || this._file(name).query_exists(null))
            throw new Error(`EffectWriter: effect "${name}" already exists`);
    }

    _write(effect) {
        this._file(effect.name).replace_contents(
            new TextEncoder().encode(effect.toText()),
            null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }

    _file(name) {
        return Gio.File.new_for_path(
            GLib.build_filenamev([this._storage.configPath, `${name}${EXTENSION}`]));
    }
}
