import { IGameEngine } from "../types";
import { GameEngine } from "../core/engine/GameEngine";
import Registry from "../core/Registry";
import { createGameBus, GameBus } from "../core/domain/events/GameEvents";
import ContentLoader from "../core/content/ContentLoader";
import { SchoolDataLoader } from "../core/content/SchoolDataLoader";
import { ContentError } from "../core/content/ContentError";
import { lintContent } from "../core/content/ContentLinter";
import { createHiddenSpellState } from "../core/domain/magic/SpellStateFactory";

export type StartupProgressStatus = "pending" | "in_progress" | "done";

export interface StartupProgressUpdate {
	id:
		| "content-packs"
		| "school-data"
		| "spellbook"
		| "ollama-check"
		| "campaign-blueprint"
		| "year-blueprint";
	label: string;
	status: StartupProgressStatus;
	completed?: number;
	total?: number;
	detail?: string;
}

type StartupProgressReporter = (update: StartupProgressUpdate) => void;

export interface RegistryOptions {
	/** Where the content packs are; defaults to the shipped ones. */
	packDirectory?: string;
	/** Where subjects, curriculum and timetables are; defaults to the shipped ones. */
	curriculumDirectory?: string;
}

/**
 * Loads all game content into a registry. Throws a `ContentError` listing
 * every problem if any content file is invalid or the content contradicts
 * itself, so the game never starts on broken content.
 */
export function buildRegistry(
	onProgress?: StartupProgressReporter,
	options: RegistryOptions = {},
): Registry {
	const registry = new Registry();

	onProgress?.({
		id: "content-packs",
		label: "Loading content packs",
		status: "in_progress",
	});
	new ContentLoader(options.packDirectory).loadAllPacks(registry, (progress) => {
		onProgress?.({
			id: "content-packs",
			label: "Loading content packs",
			status:
				progress.processedPacks === progress.totalPacks
					? "done"
					: "in_progress",
			completed: progress.processedPacks,
			total: progress.totalPacks,
			detail: progress.currentPackName
				? `Loaded ${progress.currentPackName}`
				: undefined,
		});
	});

	onProgress?.({
		id: "school-data",
		label: "Loading school data",
		status: "in_progress",
	});
	registry.registerSchoolData(
		new SchoolDataLoader(options.curriculumDirectory).loadSchoolData(),
	);

	const problems = lintContent(registry);
	if (problems.length > 0) {
		throw new ContentError(problems);
	}
	onProgress?.({
		id: "school-data",
		label: "Loading school data",
		status: "done",
	});

	return registry;
}

/**
 * Connects an engine to its gameplay listeners (quest flags derived from bus
 * events) and seeds the spellbook with every registered spell in the hidden
 * state. Split out of `engineFactory` so tests can wire an engine built with
 * injected dependencies the same way production does.
 */
export function wireEngine(
	engine: GameEngine,
	registry: Registry,
	bus: GameBus,
): void {
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
}

export async function engineFactory(
	onProgress?: StartupProgressReporter,
): Promise<IGameEngine> {
	const registry = buildRegistry(onProgress);
	const bus = createGameBus();
	const engine = new GameEngine(registry, {}, bus);

	onProgress?.({
		id: "spellbook",
		label: "Preparing spellbook state",
		status: "in_progress",
	});
	wireEngine(engine, registry, bus);
	onProgress?.({
		id: "spellbook",
		label: "Preparing spellbook state",
		status: "done",
	});

	await engine.initializeCampaignBlueprint(
		undefined,
		(milestoneId, status) => {
			switch (milestoneId) {
				case "ollama-check":
					onProgress?.({
						id: "ollama-check",
						label: "Checking Ollama availability",
						status,
					});
					break;
				case "campaign-blueprint":
					onProgress?.({
						id: "campaign-blueprint",
						label: "Generating campaign blueprint",
						status,
					});
					break;
				case "year-blueprint":
					onProgress?.({
						id: "year-blueprint",
						label: "Generating year blueprint",
						status,
					});
					break;
			}
		},
	);
	return engine;
}

let cachedRegistry: Registry | null = null;

export function locationNameResolver(id: string): string {
	if (!cachedRegistry) {
		cachedRegistry = buildRegistry();
	}

	return cachedRegistry.getLocation(id)?.displayName ?? id;
}
