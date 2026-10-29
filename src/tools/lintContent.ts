import { buildRegistry } from "../bootstrap/engineFactory";
import { ContentError } from "../core/content/ContentError";

/**
 * Checks the game's content (schemas, cross-references, blueprint allowlists)
 * without starting the game. Prints every problem with the file, line and
 * column it is at, and exits 1 if there is any. Usage:
 *   npm run lint:content [content directory]
 */
try {
	const registry = buildRegistry(undefined, { contentDirectory: process.argv[2] });
	console.log(
		`Content OK: ${registry.getAllLocationIds().length} places, ${registry.getAllNpcIds().length} characters, ${registry.getAllSpellIds().length} spells.`,
	);
} catch (error) {
	if (error instanceof ContentError) {
		console.error(error.message);
		process.exit(1);
	}
	throw error;
}
