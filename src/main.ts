import { GameEngine } from "./core/engine/GameEngine";
import Registry from "./core/Registry";
import { createGameBus } from "./core/domain/events/GameEvents";
import Location from "./core/domain/world/Location";
import { CliApp } from "./ui/cli/App";
import NPC from "./core/domain/npc/Npc";
import ContentLoader from "./core/content/ContentLoader";
import { SchoolDataLoader } from "./core/content/SchoolDataLoader";
import { createHiddenSpellState } from "./core/domain/magic/SpellStateFactory";

// Seed registry with starter world data
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

// Load spell content packs
contentLoader.loadAllSpellPacks(registry);

// Load school data (curriculum, subjects, timetables)
const schoolDataLoader = new SchoolDataLoader();
const schoolData = schoolDataLoader.loadSchoolData();
registry.registerSchoolData(schoolData);

const bus = createGameBus();
const engine = new GameEngine(registry, {}, bus);

bus.on("LessonAttended", ({ subjectId, lessonId }) => {
	const flag = `lesson_completed:${subjectId}:${lessonId}`;
	if (!engine.state.questFlags.active.includes(flag)) {
		engine.state.questFlags.active.push(flag);
	}
});

bus.on("LocationDiscovered", ({ locationId }) => {
	const flag = `discovered:${locationId}`;
	if (!engine.state.questFlags.active.includes(flag)) {
		engine.state.questFlags.active.push(flag);
	}
});

bus.on("SpellRevealed", ({ spellId }) => {
	const flag = `spell_revealed:${spellId}`;
	if (!engine.state.questFlags.active.includes(flag)) {
		engine.state.questFlags.active.push(flag);
	}
});

bus.on("SpellMastered", ({ spellId }) => {
	const flag = `mastered:${spellId}`;
	if (!engine.state.questFlags.completed.includes(flag)) {
		engine.state.questFlags.completed.push(flag);
	}
});

// Initialize all spells in hidden state
const allSpellIds = registry.getAllSpellIds();
for (const spellId of allSpellIds) {
	const state = createHiddenSpellState(spellId);
	engine.state.spellbook.setSpellState(spellId, state);
}

const app = new CliApp(engine);

(async () => {
	await engine.initializeCampaignBlueprint();
	await app.start();
})();
