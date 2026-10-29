import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { SpellRevealService } from "../core/domain/magic/SpellRevealService";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { JsonPersistenceRepository } from "../infastructure/persistance/json/JsonPersistenceRepository";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import { SpellRevealOpportunity } from "../core/domain/quest/Curriculum";
import { moveToClass, moveToNpc } from "./helpers/placePlayer";

/**
 * Characterization tests for the defects listed in docs/systems/00-synthesis.md
 * (marked [verify]) and docs/systems/21-testing.md.
 *
 * Each defect is an `it.failing`: the suite stays green while the bug exists,
 * and goes red the moment someone fixes it, which is the cue to change
 * `it.failing` to `it`. Every `it.failing` has a passing control next to it so
 * a mistake in the test itself cannot pass as "bug confirmed".
 */

let registry: Registry;
let state: GameState;
let resolver: TurnResolver;

beforeAll(() => {
	registry = buildRegistry();
});

beforeEach(() => {
	state = new GameState();
	resolver = new TurnResolver(createGameBus());
});

// The world has a schedule: put the player where the action is valid.
const talk = (npcId: string, conversationTopic?: string) => {
	if (registry.getNPC(npcId)) moveToNpc(state, registry, npcId);
	return resolver.apply({ type: "TALK", npcId, conversationTopic }, state, registry);
};

const attend = (subjectId: string) => {
	moveToClass(state, registry, subjectId);
	return resolver.apply(
		{ type: "ATTEND_CLASS", subjectId, duration: 1 },
		state,
		registry,
	);
};

describe("relationships (docs 13, 14)", () => {
	it("control: a seeded relationship exists and accepts deltas", () => {
		state.relationships["hagrid"] = new RelationshipStats();
		talk("hagrid");
		expect(state.relationships["hagrid"]).toBeInstanceOf(RelationshipStats);
	});

	it("first TALK creates a relationship record for the NPC", () => {
		talk("hagrid");
		expect(state.relationships["hagrid"]).toBeDefined();
	});

	// Hagrid's profile rates "daily_chat" +2, which lifts the opening score
	// (-1 at trust 0) to a "success", the only outcome that grants trust here.
	it("control: with a record and a liked topic, a talk raises trust", () => {
		state.relationships["hagrid"] = new RelationshipStats();
		talk("hagrid", "daily_chat");
		expect(state.relationships["hagrid"].trust).toBeGreaterThan(0);
	});

	it("a liked topic raises trust from a fresh game", () => {
		talk("hagrid", "daily_chat");
		expect(state.relationships["hagrid"].trust).toBeGreaterThan(0);
	});

	// Every conversation moves trust a little (docs 13): a plain chat with no
	// topic is a "partial" outcome worth +0.5.
	it("a plain talk with no topic builds trust slowly", () => {
		for (let i = 0; i < 5; i++) talk("hagrid");
		expect(state.relationships["hagrid"].trust).toBe(2.5);
	});
});

describe("TALK with an unknown NPC (doc 21)", () => {
	it("control: a known NPC takes time", () => {
		expect(talk("hagrid").timeCost.type).toBe("minutes");
	});

	it("is rejected without spending time or recording a conversation", () => {
		const result = talk("nobody_by_this_name");
		expect(result.timeCost.type).toBe("none");
		expect(result.events).toHaveLength(0);
	});
});

describe("spell reveal (doc 11)", () => {
	const opportunity: SpellRevealOpportunity = {
		spellId: "levitate",
		chance: 1,
		requirements: [],
		source: "lesson",
	} as SpellRevealOpportunity;

	it("control: reveal moves a hidden spell to available", () => {
		state.spellbook.setSpellState("levitate", {
			...createLearnedSpellState("levitate", "test"),
			knowledgeState: "hidden",
		});
		new SpellRevealService().attemptSpellReveal(
			opportunity,
			state.academicState,
			state.spellbook,
		);
		expect(state.spellbook.getSpellState("levitate")?.knowledgeState).toBe(
			"available",
		);
	});

	it("reveal never downgrades a learned spell", () => {
		state.spellbook.setSpellState(
			"levitate",
			createLearnedSpellState("levitate", "test"),
		);
		new SpellRevealService().attemptSpellReveal(
			opportunity,
			state.academicState,
			state.spellbook,
		);
		expect(state.spellbook.getSpellState("levitate")?.knowledgeState).toBe(
			"learned",
		);
	});
});

describe("save/load rehydration (docs 08, 19)", () => {
	let tmpRoot: string;
	let repository: JsonPersistenceRepository;

	beforeEach(async () => {
		tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "holly-saves-"));
		repository = new JsonPersistenceRepository(path.join(tmpRoot, "saves"));
	});

	afterEach(async () => {
		await fs.rm(tmpRoot, { recursive: true, force: true });
	});

	it("control: attending class works on a freshly constructed state", () => {
		expect(() => attend("charms")).not.toThrow();
	});

	it("a loaded state can still apply attribute effects", async () => {
		await repository.save("roundtrip", state);
		state = await repository.load("roundtrip");

		expect(() => attend("charms")).not.toThrow();
	});
});
