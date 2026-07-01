import { IGameEngine } from "../types";
import { GameEngine } from "../core/engine/GameEngine";
import Registry from "../core/Registry";
import { createGameBus } from "../core/domain/events/GameEvents";
import Location from "../core/domain/world/Location";
import NPC from "../core/domain/npc/Npc";
import ContentLoader from "../core/content/ContentLoader";
import { SchoolDataLoader } from "../core/content/SchoolDataLoader";
import { createHiddenSpellState } from "../core/domain/magic/SpellStateFactory";

export function buildRegistry(): Registry {
	const registry = new Registry();
	const contentLoader = new ContentLoader();

	registry.registerLocation(
		new Location(
			"startingVillage",
			"Starting Village",
			"A quiet village at the edge of an ancient forest. Cobblestone paths wind between thatched-roof cottages.",
			["forest", "market"],
		),
	);
	registry.registerLocation(
		new Location(
			"forest",
			"Ancient Forest",
			"Towering oaks block out much of the sky. The air smells of moss and old magic.",
			["startingVillage"],
		),
	);
	registry.registerLocation(
		new Location(
			"market",
			"Market Square",
			"A bustling square lined with merchant stalls selling herbs, potions, and curious artifacts.",
			["startingVillage"],
		),
	);
	registry.registerNPC(
		new NPC(
			"villager",
			"Villager",
			["A friendly villager who seems eager to chat."],
			0,
		),
	);

	contentLoader.loadAllSpellPacks(registry);
	contentLoader.loadAllNpcPacks(registry);

	const schoolDataLoader = new SchoolDataLoader();
	registry.registerSchoolData(schoolDataLoader.loadSchoolData());

	return registry;
}

export async function engineFactory(): Promise<IGameEngine> {
	const registry = buildRegistry();
	const bus = createGameBus();
	const engine = new GameEngine(registry, {}, bus);

	bus.on("LessonAttended", ({ subjectId, lessonId }) => {
		const flag = `lesson_completed:${subjectId}:${lessonId}`;
		if (!engine.state.questFlags.active.includes(flag))
			engine.state.questFlags.active.push(flag);
	});
	bus.on("LocationDiscovered", ({ locationId }) => {
		const flag = `discovered:${locationId}`;
		if (!engine.state.questFlags.active.includes(flag))
			engine.state.questFlags.active.push(flag);
	});
	bus.on("SpellRevealed", ({ spellId }) => {
		const flag = `spell_revealed:${spellId}`;
		if (!engine.state.questFlags.active.includes(flag))
			engine.state.questFlags.active.push(flag);
	});
	bus.on("SpellMastered", ({ spellId }) => {
		const flag = `mastered:${spellId}`;
		if (!engine.state.questFlags.completed.includes(flag))
			engine.state.questFlags.completed.push(flag);
	});

	for (const spellId of registry.getAllSpellIds()) {
		engine.state.spellbook.setSpellState(
			spellId,
			createHiddenSpellState(spellId),
		);
	}

	await engine.initializeCampaignBlueprint();
	return engine;
}

let cachedRegistry: Registry | null = null;

export function locationNameResolver(id: string): string {
	if (!cachedRegistry) {
		cachedRegistry = buildRegistry();
	}

	return cachedRegistry.getLocation(id)?.displayName ?? id;
}
