import GameState from "./GameState";
import Registry from "../../Registry";

/**
 * Checks a structurally valid save against the content the game has now.
 * Saves are tied to the content they were made with, so any disagreement
 * refuses the load rather than patching the save up. Returns the problems.
 */
export function validateLoadedState(
	state: GameState,
	registry: Registry,
): string[] {
	const problems: string[] = [];

	const places = new Set(registry.getAllLocationIds());
	const unknownPlace = (id: string) => !places.has(id);

	if (unknownPlace(state.currentLocationId)) {
		problems.push(
			`the place "${state.currentLocationId}" no longer exists in the game`,
		);
	}
	for (const [label, ids] of [
		["discovered", state.discoveredLocationIds],
		["visited", state.visitedLocationIds],
	] as const) {
		for (const id of ids.filter(unknownPlace)) {
			problems.push(`a ${label} place "${id}" no longer exists in the game`);
		}
	}

	const savedSpells = new Set(state.spellbook.getAllSpells().map((s) => s.spellId));
	const knownSpells = new Set(registry.getAllSpellIds());
	for (const id of knownSpells) {
		if (!savedSpells.has(id)) problems.push(`the spell "${id}" is not in the save (added since)`);
	}
	for (const id of savedSpells) {
		if (!knownSpells.has(id)) problems.push(`the saved spell "${id}" no longer exists in the game`);
	}

	const npcs = new Set(registry.getAllNpcIds());
	const referencedNpcs = new Set([
		...Object.keys(state.relationships),
		...Object.keys(state.conversationHistory),
		...state.knownNPCIds,
	]);
	for (const id of referencedNpcs) {
		if (!npcs.has(id)) problems.push(`the character "${id}" no longer exists in the game`);
	}

	if (!state.campaignBlueprint) {
		problems.push("it has no campaign story (blueprint)");
	}
	if (!state.yearBlueprints[state.currentYear]) {
		problems.push(`it has no story for year ${state.currentYear} (blueprint)`);
	}

	return problems;
}
