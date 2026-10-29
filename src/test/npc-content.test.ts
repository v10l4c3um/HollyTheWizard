import { buildRegistry } from "../bootstrap/engineFactory";
import { normalizeName } from "../core/engine/EntityMatcher";

/**
 * Aliases are in-world epithets, meant to be sparse and distinctive. These
 * checks guard the content, not the engine.
 */
const MAX_ALIASES_PER_NPC = 2;

const withoutArticles = (text: string) =>
	normalizeName(text)
		.split(" ")
		.filter((word) => !["the", "a", "an"].includes(word))
		.join(" ");

describe("NPC aliases in the content packs", () => {
	const registry = (() => {
		jest.spyOn(console, "log").mockImplementation();
		const built = buildRegistry();
		jest.restoreAllMocks();
		return built;
	})();
	const npcs = registry.getAllNpcIds().map((id) => registry.getNPC(id)!);

	it("are non-empty strings, at most two per NPC", () => {
		for (const npc of npcs) {
			const aliases = npc.aliases ?? [];
			expect(aliases.length).toBeLessThanOrEqual(MAX_ALIASES_PER_NPC);
			for (const alias of aliases) {
				expect(typeof alias).toBe("string");
				expect(withoutArticles(alias)).not.toBe("");
			}
		}
	});

	it("never repeat or collide with any NPC's id or name", () => {
		const taken = new Map<string, string>();
		for (const npc of npcs) {
			for (const label of [npc.id, npc.name]) {
				taken.set(withoutArticles(label), npc.id);
			}
		}
		for (const npc of npcs) {
			for (const alias of npc.aliases ?? []) {
				const key = withoutArticles(alias);
				expect({ alias, claimedBy: taken.get(key) }).toEqual({
					alias,
					claimedBy: undefined,
				});
				taken.set(key, npc.id);
			}
		}
	});

	it("exist for the characters players call by an epithet", () => {
		expect(registry.getNPC("harry_potter")?.aliases).toContain("the boy who lived");
		expect(registry.getNPC("hagrid")?.aliases).toContain("the gamekeeper");
	});
});
