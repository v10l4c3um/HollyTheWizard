import * as fs from "fs/promises";
import * as path from "path";
import GameState from "../../../core/domain/world/GameState";
import { PersistenceRepository } from "../../../core/application/ports/PersistenceRepository";

const DEFAULT_SAVES_DIR = path.join(process.cwd(), "saves");

/**
 * Real fs-based save/load implementation. `GameState` round-trips through
 * plain JSON via `JSON.stringify`/`JSON.parse`; class-instance fields
 * (`worldClock`, `spellbook`) are rehydrated via `GameState.fromPlainObject`.
 *
 * The saves directory is injectable so tests can write to a temp directory
 * instead of the real `saves/` folder.
 */
export class JsonPersistenceRepository implements PersistenceRepository {
	constructor(private readonly savesDir: string = DEFAULT_SAVES_DIR) {}

	async save(filename: string = "autosave", state: GameState): Promise<void> {
		await fs.mkdir(this.savesDir, { recursive: true });
		const filePath = this._resolveFilePath(filename);
		const json = JSON.stringify(state, null, 2);
		await fs.writeFile(filePath, json, "utf-8");
	}

	async load(filename: string = "autosave"): Promise<GameState> {
		const filePath = this._resolveFilePath(filename);
		const json = await fs.readFile(filePath, "utf-8");
		const data = JSON.parse(json);
		return GameState.fromPlainObject(data);
	}

	private _resolveFilePath(filename: string): string {
		// Reject path separators/traversal so the filename can't escape
		// the saves directory (OWASP path traversal).
		var safeName = path.basename(filename).replace(/[^a-zA-Z0-9_-]/g, "_");
		if (safeName.length === 0) {
			safeName = "autosave"; // Default to autosave if the name is empty after sanitization
			//throw new Error("Invalid save filename.");
		}
		return path.join(this.savesDir, `${safeName}.json`);
	}
}
