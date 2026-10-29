import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus, GameEvents } from "../core/domain/events/GameEvents";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { fixedRandom } from "../core/domain/random/Random";
import { buildRegistry } from "../bootstrap/engineFactory";
import { moveToClass, moveToNpc } from "./helpers/placePlayer";
import { validState } from "./helpers/validState";

let registry: Registry;
let state: GameState;
let bus: ReturnType<typeof createGameBus>;
let resolver: TurnResolver;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = validState(registry);
	bus = createGameBus();
	applyEffects(state, arrivalEffects(registry, state, state.currentLocationId), bus);
	resolver = new TurnResolver(bus, undefined, { random: () => fixedRandom(0) });
});

/** What the world looked like at the moment each event was announced. */
function watch(...names: (keyof GameEvents)[]) {
	const seen: { name: string; minutes: number; logged: string[] }[] = [];
	for (const name of names) {
		bus.on(name, () =>
			seen.push({
				name,
				minutes: state.worldClock.getTotalMinutes(),
				logged: [...state.recentEvents],
			}),
		);
	}
	return seen;
}

describe("events are announced after the turn is finished", () => {
	it("a move: listeners already see the clock moved and the turn in the log", () => {
		const seen = watch("LocationVisited", "LocationDiscovered", "ActionResolved");
		const start = state.worldClock.getTotalMinutes();

		resolver.apply({ type: "MOVE", destinationId: "hallway" }, state, registry);

		expect(seen.length).toBeGreaterThan(2);
		for (const entry of seen) {
			expect(entry.minutes).toBe(start + 5);
			expect(entry.logged).toContain("Moved from Great Hall to Main Corridor");
		}
		expect(seen.map((s) => s.name)[0]).toBe("LocationVisited");
		expect(seen[seen.length - 1].name).toBe("ActionResolved");
	});

	it("a lesson: LessonAttended, then what it revealed and taught, after the hour has passed", () => {
		const seen = watch("LessonAttended", "SpellRevealed", "SpellLearned");
		moveToClass(state, registry, "charms");
		resolver.apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }, state, registry);
		moveToClass(state, registry, "charms", { next: true });
		const start = state.worldClock.getTotalMinutes();
		seen.length = 0;

		resolver.apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }, state, registry);

		expect(seen.map((s) => s.name)).toEqual(["LessonAttended", "SpellRevealed", "SpellLearned"]);
		for (const entry of seen) expect(entry.minutes).toBe(start + 60);
	});

	it("a conversation: the five conversation events keep their order", () => {
		const seen = watch("NpcTalkedTo", "ConversationResolved", "TopicDiscussed");
		moveToNpc(state, registry, "hagrid");
		const start = state.worldClock.getTotalMinutes();
		resolver.apply({ type: "TALK", npcId: "hagrid", conversationTopic: "daily_chat" }, state, registry);
		expect(seen.map((s) => s.name)).toEqual(["NpcTalkedTo", "ConversationResolved", "TopicDiscussed"]);
		for (const entry of seen) expect(entry.minutes).toBe(start + 15);
	});

	it("practice: listeners see the new random state already saved", () => {
		state.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "test"));
		const resolverWithSeed = new TurnResolver(bus);
		state.randomState = 7;
		let randomAtAnnouncement = -1;
		bus.on("SpellPracticed", () => (randomAtAnnouncement = state.randomState));
		resolverWithSeed.apply({ type: "PRACTICE", spellId: "levitate", duration: 1 }, state, registry);
		expect(randomAtAnnouncement).not.toBe(7);
		expect(randomAtAnnouncement).toBe(state.randomState);
	});

	it("a refused action announces no domain events, only that it was resolved", () => {
		const seen = watch("LocationVisited", "LocationDiscovered", "NpcTalkedTo", "ActionResolved");
		resolver.apply({ type: "MOVE", destinationId: "narnia" }, state, registry);
		resolver.apply({ type: "TALK", npcId: "gandalf" }, state, registry);
		expect(seen.map((s) => s.name)).toEqual(["ActionResolved", "ActionResolved"]);
	});
});
