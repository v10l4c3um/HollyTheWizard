import { IGameEngine } from "../types";
import { GameEngine } from "../core/engine/GameEngine";
import Registry from "../core/Registry";
import { createGameBus, GameBus } from "../core/domain/events/GameEvents";
import ContentLoader from "../core/content/ContentLoader";
import { SchoolDataLoader } from "../core/content/SchoolDataLoader";
import { ContentError } from "../core/content/ContentError";
import { lintContent } from "../core/content/ContentLinter";
import {
	OllamaConfig,
	DEFAULT_BLUEPRINT_OLLAMA_CONFIG,
	DEFAULT_RENDERER_OLLAMA_CONFIG,
	DEFAULT_RESOLVER_OLLAMA_CONFIG,
} from "../ai/OllamaConfig";
import { probeOllamaConnection } from "../ai/OllamaClient";
import { BlueprintLLMProvider } from "../ai/providers/BlueprintLLMProvider";
import { WorldTick } from "../core/engine/WorldTick";
import { Autosave } from "../core/engine/Autosave";
import { createCommandHandlers } from "../core/engine/handlers";
import Resolver from "../core/engine/Resolver";
import TurnResolver from "../core/engine/TurnResolver";
import Renderer from "../core/engine/Renderer";
import { GenerateCampaignBlueprint } from "../core/application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../core/application/use-cases/GenerateYearBlueprint";
import { AdvanceYear } from "../core/application/use-cases/AdvanceYear";
import { BlueprintProgressService } from "../core/domain/campaign/BlueprintProgressService";
import { PersistenceRepository } from "../core/application/ports/PersistenceRepository";
import { Logger } from "../core/application/ports/Logger";
import { FileLogger } from "../infrastructure/logging/FileLogger";
import { JsonPersistenceRepository } from "../infrastructure/persistence/json/JsonPersistenceRepository";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects, undiscoveredExits } from "../core/domain/world/Exploration";
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
	// Loading is over: content can no longer change.
	registry.freeze();
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
/** The player starts in a place they have been to and can see its exits. */
function discoverStartingArea(
	engine: GameEngine,
	registry: Registry,
	bus: GameBus,
): void {
	const { state } = engine;
	const seen = undiscoveredExits(registry, state, state.currentLocationId);
	applyEffects(
		state,
		arrivalEffects(registry, state, state.currentLocationId),
		bus,
	);
	for (const locationId of seen) bus.emit("LocationDiscovered", { locationId });
}

export function wireEngine(
	engine: GameEngine,
	registry: Registry,
	bus: GameBus,
): void {
	discoverStartingArea(engine, registry, bus);

	for (const spellId of registry.getAllSpellIds()) {
		engine.state.spellbook.setSpellState(
			spellId,
			createHiddenSpellState(spellId),
		);
	}
}

export interface EngineOptions {
	resolverConfig?: OllamaConfig;
	rendererConfig?: OllamaConfig;
	blueprintConfig?: OllamaConfig;
	persistenceRepository?: PersistenceRepository;
	logger?: Logger;
	/** Test seam: the rules engine the turn handler uses. */
	turnResolver?: TurnResolver;
	/** Dev/test only: use the deterministic blueprint when the LLM output is invalid. */
	allowBlueprintFallback?: boolean;
}

/**
 * Builds the engine and its whole object graph. Performs no I/O, so tests can
 * call it with a mocked LLM; `engineFactory` adds the availability probe.
 */
export function createEngine(
	registry: Registry,
	bus: GameBus,
	options: EngineOptions = {},
): GameEngine {
	const resolverConfig =
		options.resolverConfig ?? DEFAULT_RESOLVER_OLLAMA_CONFIG;
	const rendererConfig =
		options.rendererConfig ?? DEFAULT_RENDERER_OLLAMA_CONFIG;
	const blueprintConfig =
		options.blueprintConfig ?? DEFAULT_BLUEPRINT_OLLAMA_CONFIG;
	const allowFallback = options.allowBlueprintFallback ?? false;

	const persistenceRepository =
		options.persistenceRepository ?? new JsonPersistenceRepository();
	const logger = options.logger ?? new FileLogger();

	const llmProvider = new BlueprintLLMProvider(blueprintConfig, logger);
	const generateYearBlueprint = new GenerateYearBlueprint(
		llmProvider,
		registry,
		bus,
		allowFallback,
	);
	const engine = new GameEngine({
		registry,
		bus,
		resolver: new Resolver(resolverConfig, registry, logger),
		renderer: new Renderer(rendererConfig, logger),
		worldTick: new WorldTick(),
		autosave: new Autosave(persistenceRepository, logger),
		handlers: createCommandHandlers({
			registry,
			bus,
			turnResolver: options.turnResolver ?? new TurnResolver(bus, logger),
			advanceYear: new AdvanceYear(generateYearBlueprint, bus),
			persistenceRepository:
				persistenceRepository,
		}),
		generateCampaignBlueprint: new GenerateCampaignBlueprint(
			llmProvider,
			registry,
			bus,
			allowFallback,
		),
		generateYearBlueprint,
		blueprintProgressService: new BlueprintProgressService(),
		logger,
	});
	wireEngine(engine, registry, bus);
	return engine;
}

/** The LLM is required: throws if any configured model is unreachable. */
export async function verifyLlmAvailable(
	configs: OllamaConfig[],
): Promise<void> {
	const seen = new Set<string>();
	for (const config of configs) {
		const key = `${config.endpoint}::${config.model}`;
		if (seen.has(key)) continue;
		seen.add(key);
		try {
			await probeOllamaConnection(config);
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Ollama availability check failed";
			throw new Error(`Startup failed: ${message} at ${config.endpoint}`);
		}
	}
}

export async function engineFactory(
	onProgress?: StartupProgressReporter,
	options: EngineOptions = {},
): Promise<IGameEngine> {
	const registry = buildRegistry(onProgress);
	const logger = options.logger ?? new FileLogger();
	const bus = createGameBus(logger);

	onProgress?.({
		id: "spellbook",
		label: "Preparing spellbook state",
		status: "in_progress",
	});
	const engine = createEngine(registry, bus, { ...options, logger });
	onProgress?.({
		id: "spellbook",
		label: "Preparing spellbook state",
		status: "done",
	});

	onProgress?.({
		id: "ollama-check",
		label: "Checking Ollama availability",
		status: "in_progress",
	});
	await verifyLlmAvailable([
		options.resolverConfig ?? DEFAULT_RESOLVER_OLLAMA_CONFIG,
		options.rendererConfig ?? DEFAULT_RENDERER_OLLAMA_CONFIG,
		options.blueprintConfig ?? DEFAULT_BLUEPRINT_OLLAMA_CONFIG,
	]);
	onProgress?.({
		id: "ollama-check",
		label: "Checking Ollama availability",
		status: "done",
	});

	await engine.initializeCampaignBlueprint(undefined, (milestoneId, status) => {
		onProgress?.({
			id: milestoneId,
			label:
				milestoneId === "campaign-blueprint"
					? "Generating campaign blueprint"
					: "Generating year blueprint",
			status,
		});
	});
	return engine;
}

let cachedRegistry: Registry | null = null;

export function locationNameResolver(id: string): string {
	if (!cachedRegistry) {
		cachedRegistry = buildRegistry();
	}

	return cachedRegistry.getLocation(id)?.displayName ?? id;
}
