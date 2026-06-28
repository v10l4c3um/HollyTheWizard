// Composition root: initializes all services and wires dependencies
// This is the single entry point for creating a configured game instance

interface GameConfig {
	narrationProvider: "mock" | "ai" | "fallback";
	persistenceBackend: "json" | "sqlite";
	randomSeed?: number;
	contentPackPath: string;
}

interface RandomProvider {
	seed(value: number): void;
	next(): number;
	nextInt(min: number, max: number): number;
}

interface NarrationProvider {
	narrate(context: {
		actionType: string;
		location: string;
		outcome: unknown;
	}): Promise<string>;
}

interface PersistenceRepository {
	save(gameState: unknown, filename: string): Promise<void>;
	load(filename: string): Promise<unknown>;
	exists(filename: string): Promise<boolean>;
}

class SeededRandom implements RandomProvider {
	private seed_: number;

	constructor(seed: number = Date.now()) {
		this.seed_ = seed;
	}

	seed(value: number): void {
		this.seed_ = value;
	}

	next(): number {
		this.seed_ = (this.seed_ * 9301 + 49297) % 233280;
		return this.seed_ / 233280;
	}

	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min + 1)) + min;
	}
}

class MockNarrationProvider implements NarrationProvider {
	async narrate(context: {
		actionType: string;
		location: string;
		outcome: unknown;
	}): Promise<string> {
		return `[MOCK] ${context.actionType} at ${context.location}`;
	}
}

class FallbackNarrationProvider implements NarrationProvider {
	async narrate(context: {
		actionType: string;
		location: string;
		outcome: unknown;
	}): Promise<string> {
		// Deterministic, rule-based narration without external API calls
		const descriptions: Record<string, string> = {
			move: `You move through ${context.location}.`,
			study: `You study diligently in ${context.location}.`,
			practice: `You practice your spell in ${context.location}.`,
			rest: `You rest in ${context.location}.`,
			talk: `You speak with someone in ${context.location}.`,
		};
		return (
			descriptions[context.actionType] ||
			`Something happens in ${context.location}.`
		);
	}
}

class JsonPersistenceRepository implements PersistenceRepository {
	private basePath: string;

	constructor(basePath: string = "./saves") {
		this.basePath = basePath;
	}

	async save(gameState: unknown, filename: string): Promise<void> {
		// TODO: Implement JSON file writing
		console.log(`[PERSISTENCE] Would save to ${this.basePath}/${filename}`);
	}

	async load(filename: string): Promise<unknown> {
		// TODO: Implement JSON file reading
		console.log(
			`[PERSISTENCE] Would load from ${this.basePath}/${filename}`,
		);
		return null;
	}

	async exists(filename: string): Promise<boolean> {
		// TODO: Implement file existence check
		return false;
	}
}

interface BootstrappedGame {
	randomProvider: RandomProvider;
	narrationProvider: NarrationProvider;
	persistenceRepository: PersistenceRepository;
	config: GameConfig;
}

export function bootstrap(config: GameConfig): BootstrappedGame {
	// 1. Initialize random provider with optional seed
	const randomProvider = new SeededRandom(config.randomSeed);

	// 2. Initialize narration provider based on config
	let narrationProvider: NarrationProvider;
	switch (config.narrationProvider) {
		case "mock":
			narrationProvider = new MockNarrationProvider();
			break;
		case "ai":
			// TODO: Wire up real AI provider adapter when ready
			narrationProvider = new FallbackNarrationProvider();
			break;
		case "fallback":
		default:
			narrationProvider = new FallbackNarrationProvider();
	}

	// 3. Initialize persistence repository based on config
	let persistenceRepository: PersistenceRepository;
	switch (config.persistenceBackend) {
		case "sqlite":
			// TODO: Wire up SQLite repository when ready
			persistenceRepository = new JsonPersistenceRepository();
			break;
		case "json":
		default:
			persistenceRepository = new JsonPersistenceRepository("./saves");
	}

	// 4. Load configuration and content packs
	// TODO: Load spell definitions from content pack
	// TODO: Load location definitions from content pack
	// TODO: Load NPC templates from content pack
	// TODO: Load item definitions from content pack
	// TODO: Load faction and archetype definitions from content pack

	// 5. Return composed services for dependency injection
	return {
		randomProvider,
		narrationProvider,
		persistenceRepository,
		config,
	};
}

export type {
	GameConfig,
	RandomProvider,
	NarrationProvider,
	PersistenceRepository,
	BootstrappedGame,
};
