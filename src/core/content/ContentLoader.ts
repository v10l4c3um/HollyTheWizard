import * as fs from "fs";
import * as path from "path";
import Registry from "../Registry";
import Location from "../domain/world/Location";
import { ContentError } from "./ContentError";
import { PackManifest, PackManifestSchema } from "./ContentSchemas";
import { readContentFile } from "./readContentFile";

export interface ContentPackLoadProgress {
	processedPacks: number;
	totalPacks: number;
	currentPackName?: string;
}

/**
 * Loads every `*.json` pack in a directory into the registry. A pack may hold
 * any mix of locations, NPCs, NPC profiles and spells. Every file is
 * validated; all problems are gathered and thrown together as a
 * `ContentError`, so a broken pack can never be silently skipped.
 */
class ContentLoader {
	private packDirectory: string;

	constructor(
		packDirectory: string = path.join(__dirname, "../../content/packs"),
	) {
		this.packDirectory = packDirectory;
	}

	loadAllPacks(
		registry: Registry,
		onProgress?: (progress: ContentPackLoadProgress) => void,
	): void {
		if (!fs.existsSync(this.packDirectory)) {
			throw new ContentError([
				`Content pack directory not found: ${this.packDirectory}`,
			]);
		}

		const files = fs
			.readdirSync(this.packDirectory)
			.filter((file) => file.endsWith(".json"))
			.sort();
		if (files.length === 0) {
			throw new ContentError([
				`No content packs (*.json) found in ${this.packDirectory}`,
			]);
		}

		const problems: string[] = [];
		let processedPacks = 0;
		for (const file of files) {
			const manifest = readContentFile(
				path.join(this.packDirectory, file),
				PackManifestSchema,
				problems,
			);
			if (manifest) {
				this.register(manifest, file, registry, problems);
			}
			processedPacks++;
			onProgress?.({
				processedPacks,
				totalPacks: files.length,
				currentPackName: file.replace(/\.json$/, ""),
			});
		}

		if (problems.length > 0) {
			throw new ContentError(problems);
		}
	}

	private register(
		manifest: PackManifest,
		file: string,
		registry: Registry,
		problems: string[],
	): void {
		for (const l of manifest.locations ?? []) {
			if (registry.getLocation(l.id)) {
				problems.push(`${file}: Duplicate location id "${l.id}"`);
				continue;
			}
			registry.registerLocation(
				new Location(
					l.id,
					l.displayName,
					l.description,
					l.connectedLocationsIds,
					l.aliases,
					l.private,
				),
			);
		}
		for (const npc of manifest.npcs ?? []) {
			if (registry.getNPC(npc.id)) {
				problems.push(`${file}: Duplicate NPC id "${npc.id}"`);
				continue;
			}
			registry.registerNPC(npc);
		}
		for (const profile of manifest.profiles ?? []) {
			if (registry.getNpcProfile(profile.npcId)) {
				problems.push(`${file}: Duplicate NPC profile for "${profile.npcId}"`);
				continue;
			}
			registry.registerNpcProfile(profile);
		}
		for (const spell of manifest.spells ?? []) {
			if (registry.getSpell(spell.definition.id)) {
				problems.push(`${file}: Duplicate spell id "${spell.definition.id}"`);
				continue;
			}
			registry.registerSpell(spell);
		}
	}
}

export default ContentLoader;
