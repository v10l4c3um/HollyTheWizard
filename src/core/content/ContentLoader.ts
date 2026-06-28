import * as fs from "fs";
import * as path from "path";
import Registry from "../Registry";
import { Spell } from "../domain/magic/SpellBook";

interface ContentPackManifest {
	name: string;
	version: string;
	description?: string;
	spells?: Spell[];
}

class ContentLoader {
	private packDirectory: string;

	constructor(packDirectory: string = path.join(__dirname, "../../content/packs")) {
		this.packDirectory = packDirectory;
	}

	loadSpellPack(packName: string, registry: Registry): void {
		const packPath = path.join(this.packDirectory, `${packName}.json`);

		if (!fs.existsSync(packPath)) {
			throw new Error(`Spell pack not found: ${packPath}`);
		}

		const content = fs.readFileSync(packPath, "utf-8");
		const manifest: ContentPackManifest = JSON.parse(content);

		if (!manifest.spells || !Array.isArray(manifest.spells)) {
			console.warn(`No spells found in pack: ${packName}`);
			return;
		}

		for (const spell of manifest.spells) {
			registry.registerSpell(spell);
		}

		console.log(`Loaded spell pack '${manifest.name}' with ${manifest.spells.length} spells`);
	}

	loadAllSpellPacks(registry: Registry): void {
		if (!fs.existsSync(this.packDirectory)) {
			console.warn(`Content pack directory not found: ${this.packDirectory}`);
			return;
		}

		const files = fs.readdirSync(this.packDirectory).filter((f) => f.endsWith(".json"));

		if (files.length === 0) {
			console.warn("No spell pack files found");
			return;
		}

		for (const file of files) {
			const packName = file.replace(".json", "");
			try {
				this.loadSpellPack(packName, registry);
			} catch (error) {
				console.error(`Failed to load spell pack '${packName}':`, error);
			}
		}
	}
}

export default ContentLoader;
