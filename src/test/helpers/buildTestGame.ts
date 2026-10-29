import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { GameEngine } from "../../core/engine/GameEngine";
import { createGameBus } from "../../core/domain/events/GameEvents";
import Registry from "../../core/Registry";
import { buildRegistry, createEngine } from "../../bootstrap/engineFactory";
import { JsonPersistenceRepository } from "../../infrastructure/persistence/json/JsonPersistenceRepository";

export interface TestGame {
	engine: GameEngine;
	registry: Registry;
	bus: ReturnType<typeof createGameBus>;
	savesDir: string;
	/** Removes the temp saves directory. */
	dispose(): Promise<void>;
}

/**
 * Builds a real engine over the real content packs, wired like production,
 * with saves redirected to a temp directory. The caller must have mocked
 * `OllamaClient` (see fakeOllama.ts) before calling anything on the engine.
 *
 * Calls `initializeCampaignBlueprint`, which with the fake LLM takes the
 * deterministic fallback path.
 */
export async function buildTestGame(): Promise<TestGame> {
	const registry = buildRegistry();
	const bus = createGameBus();
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "holly-game-"));
	const savesDir = path.join(root, "saves");
	const engine = createEngine(registry, bus, {
		persistenceRepository: new JsonPersistenceRepository(savesDir),
		allowBlueprintFallback: true,
	});
	await engine.initializeCampaignBlueprint("test-seed");

	return {
		engine,
		registry,
		bus,
		savesDir,
		dispose: () => fs.rm(root, { recursive: true, force: true }),
	};
}
