import * as fs from "fs";
import * as path from "path";
import Registry from "../Registry";
import { Spell } from "../domain/magic/Spell";
import NPC from "../domain/npc/Npc";

interface ContentPackManifest {
	name: string;
	version: string;
	description?: string;
	spells?: Spell[];
	npcs?: NPC[];
}

export interface ContentPackLoadProgress {
	processedPacks: number;
	totalPacks: number;
	currentPackName?: string;
}

class ContentLoader {
	private packDirectory: string;

	constructor(
		packDirectory: string = path.join(__dirname, "../../content/packs"),
	) {
		this.packDirectory = packDirectory;
	}

	private listPackFiles(): string[] {
		if (!fs.existsSync(this.packDirectory)) {
			return [];
		}

		return fs
			.readdirSync(this.packDirectory)
			.filter((file) => file.endsWith(".json"))
			.sort();
	}

	private loadPackManifest(packName: string): ContentPackManifest {
		const packPath = path.join(this.packDirectory, `${packName}.json`);
		if (!fs.existsSync(packPath)) {
			throw new Error(`Content pack not found: ${packPath}`);
		}

		const content = fs.readFileSync(packPath, "utf-8");
		return JSON.parse(content) as ContentPackManifest;
	}

	loadSpellPack(packName: string, registry: Registry): void {
		const manifest = this.loadPackManifest(packName);

		if (!manifest.spells || !Array.isArray(manifest.spells)) {
			console.warn(`No spells found in pack: ${packName}`);
			return;
		}

		for (const spell of manifest.spells) {
			registry.registerSpell(spell);
		}

		console.log(
			`Loaded spell pack '${manifest.name}' with ${manifest.spells.length} spells`,
		);
	}

	loadNpcPack(packName: string, registry: Registry): void {
		const manifest = this.loadPackManifest(packName);

		if (!manifest.npcs || !Array.isArray(manifest.npcs)) {
			console.warn(`No NPCs found in pack: ${packName}`);
			return;
		}

		for (const npc of manifest.npcs) {
			registry.registerNPC(npc);
		}

		console.log(
			`Loaded NPC pack '${manifest.name}' with ${manifest.npcs.length} NPCs`,
		);
	}

	loadAllPacks(
		registry: Registry,
		onProgress?: (progress: ContentPackLoadProgress) => void,
	): void {
		const files = this.listPackFiles();

		if (!fs.existsSync(this.packDirectory)) {
			console.warn(
				`Content pack directory not found: ${this.packDirectory}`,
			);
			onProgress?.({
				processedPacks: 0,
				totalPacks: 0,
			});
			return;
		}

		if (files.length === 0) {
			console.warn("No content pack files found");
			onProgress?.({
				processedPacks: 0,
				totalPacks: 0,
			});
			return;
		}

		let processedPacks = 0;
		for (const file of files) {
			const packName = file.replace(".json", "");
			try {
				const manifest = this.loadPackManifest(packName);
				const spells =
					Array.isArray(manifest.spells) ? manifest.spells : [];
				const npcs = Array.isArray(manifest.npcs) ? manifest.npcs : [];

				for (const spell of spells) {
					registry.registerSpell(spell);
				}
				for (const npc of npcs) {
					registry.registerNPC(npc);
				}

				console.log(
					`Loaded content pack '${manifest.name}' with ${spells.length} spells and ${npcs.length} NPCs`,
				);
			} catch (error) {
				console.error(`Failed to load content pack '${packName}':`, error);
			} finally {
				processedPacks++;
				onProgress?.({
					processedPacks,
					totalPacks: files.length,
					currentPackName: packName,
				});
			}
		}
	}

	loadAllSpellPacks(registry: Registry): void {
		if (!fs.existsSync(this.packDirectory)) {
			console.warn(
				`Content pack directory not found: ${this.packDirectory}`,
			);
			return;
		}

		const files = this.listPackFiles();

		if (files.length === 0) {
			console.warn("No spell pack files found");
			return;
		}

		for (const file of files) {
			const packName = file.replace(".json", "");
			try {
				this.loadSpellPack(packName, registry);
			} catch (error) {
				console.error(
					`Failed to load spell pack '${packName}':`,
					error,
				);
			}
		}
	}

	loadAllNpcPacks(registry: Registry): void {
		if (!fs.existsSync(this.packDirectory)) {
			console.warn(
				`Content pack directory not found: ${this.packDirectory}`,
			);
			return;
		}

		const files = this.listPackFiles();

		if (files.length === 0) {
			console.warn("No NPC pack files found");
			return;
		}

		for (const file of files) {
			const packName = file.replace(".json", "");
			try {
				this.loadNpcPack(packName, registry);
			} catch (error) {
				console.error(`Failed to load NPC pack '${packName}':`, error);
			}
		}
	}
}

export default ContentLoader;
