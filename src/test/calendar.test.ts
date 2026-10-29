import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { createHiddenSpellState } from "../core/domain/magic/SpellStateFactory";
import { moveToClass, moveToNpc } from "./helpers/placePlayer";

/**
 * Timestamps recorded in the game state must be absolute, so something that
 * happens on day 2 is later than something that happens on day 1.
 */
const MINUTES_PER_DAY = 1440;

let registry: Registry;
let state: GameState;
let resolver: TurnResolver;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = new GameState();
	resolver = new TurnResolver(createGameBus());
	for (const spellId of registry.getAllSpellIds()) {
		state.spellbook.setSpellState(spellId, createHiddenSpellState(spellId));
	}
});

describe("absolute timestamps", () => {
	it("a conversation is remembered with the total minutes, not the minute of the day", () => {
		state.worldClock.advanceTime(MINUTES_PER_DAY + 60); // day 2
		moveToNpc(state, registry, "hagrid");
		const startedAt = state.worldClock.getTotalMinutes();

		resolver.apply({ type: "TALK", npcId: "hagrid" }, state, registry);

		const [entry] = state.conversationHistory["hagrid"];
		expect(entry.turnIndex).toBe(startedAt);
		expect(entry.turnIndex).toBeGreaterThan(MINUTES_PER_DAY);
	});

	it("a later conversation always has a larger turnIndex, even across midnight", () => {
		moveToNpc(state, registry, "hagrid");
		resolver.apply({ type: "TALK", npcId: "hagrid" }, state, registry);
		state.worldClock.advanceTime(MINUTES_PER_DAY); // same time tomorrow
		moveToNpc(state, registry, "hagrid");
		resolver.apply({ type: "TALK", npcId: "hagrid" }, state, registry);

		const [first, second] = state.conversationHistory["hagrid"];
		expect(second.turnIndex).toBeGreaterThan(first.turnIndex);
	});

	it("a spell taught on a later day records when, in total minutes", () => {
		const attend = () =>
			resolver.apply(
				{ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 },
				state,
				registry,
			);
		moveToClass(state, registry, "charms");
		attend();
		moveToClass(state, registry, "charms", { next: true }); // Thursday
		const total = state.worldClock.getTotalMinutes();
		attend();

		expect(
			state.spellbook.getSpellState("levitate")?.becameAvailableAt,
		).toBe(total);
		expect(total).toBeGreaterThan(MINUTES_PER_DAY);
	});
});
