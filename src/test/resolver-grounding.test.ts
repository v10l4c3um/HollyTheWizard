import Resolver from "../core/engine/Resolver";
import Registry from "../core/Registry";
import GameState from "../core/domain/world/GameState";
import Item from "../core/domain/world/Item";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { createGameBus } from "../core/domain/events/GameEvents";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { buildRegistry } from "../bootstrap/engineFactory";
import { buildWorldView, WorldView } from "../core/engine/WorldView";
import { OllamaConfig } from "../ai/OllamaConfig";
import { moveToNpc } from "./helpers/placePlayer";
import { validState } from "./helpers/validState";

const TEST_CONFIG: OllamaConfig = {
	endpoint: "http://localhost:11434/api/generate",
	model: "test-model",
};

let registry: Registry;
const originalFetch = global.fetch;
const spies: jest.SpyInstance[] = [];

beforeAll(() => {
	for (const m of ["log", "debug", "warn", "error"] as const) {
		spies.push(jest.spyOn(console, m).mockImplementation());
	}
	registry = buildRegistry();
});
afterAll(() => spies.forEach((s) => s.mockRestore()));
beforeEach(() => {
	global.fetch = jest.fn() as unknown as typeof fetch;
});
afterEach(() => {
	global.fetch = originalFetch;
});

/** Each call to the model returns the next of these JSON replies. */
function model(...replies: object[]) {
	let call = 0;
	(global.fetch as jest.Mock).mockImplementation(() =>
		Promise.resolve({
			ok: true,
			json: async () => ({ response: JSON.stringify(replies[call++] ?? {}) }),
		}),
	);
}
const calls = () => (global.fetch as jest.Mock).mock.calls;
const bodyOf = (i: number) => JSON.parse(calls()[i][1].body);

function viewAt(locationId: string, tweak?: (s: GameState) => void): WorldView {
	const state = validState(registry);
	applyEffects(state, arrivalEffects(registry, state, locationId), createGameBus());
	tweak?.(state);
	return buildWorldView(registry, state);
}

const resolve = (input: string, view: WorldView) =>
	new Resolver(TEST_CONFIG, registry).resolve(input, view);

describe("places", () => {
	const view = () => viewAt("hallway");

	it.each([
		["a name inside a sentence", "library in main building"],
		["the display name with an article", "the Library"],
		["the id", "library"],
		["different case", "LIBRARY"],
	])("grounds %s without another model call", async (_label, target) => {
		model({ intent: "MOVE" }, { target });
		const command = await resolve("go to the library", view());
		expect(command).toEqual({ type: "MOVE", destinationId: "library" });
		expect(calls()).toHaveLength(2);
	});

	it.each([
		["Hagrid's hut", "hagrid_hut"],
		["the hut", "hagrid_hut"],
		["the gamekeeper's hut", "hagrid_hut"],
		["outside", "grounds"],
		["the woods", "forest"],
		["the village", "startingVillage"],
	])("grounds the nickname %p to %p without another model call", async (target, id) => {
		model({ intent: "MOVE" }, { target });
		expect(await resolve("go there", viewAt("grounds"))).toEqual({
			type: "MOVE",
			destinationId: id,
		});
		expect(calls()).toHaveLength(2);
	});

	it("tells the classifier a place's nicknames so \"visit Hagrid's hut\" is a move", async () => {
		model({ intent: "MOVE" }, { target: "Hagrid's hut" });
		await resolve("visit Hagrid's hut", viewAt("grounds"));
		expect(bodyOf(0).prompt).toContain("Gamekeeper's Hut (also \"Hagrid's hut\"");
	});

	it("maps a display name to its id", async () => {
		model({ intent: "MOVE" }, { target: "Main Corridor" });
		expect(await resolve("go to the main corridor", viewAt("great_hall"))).toEqual({
			type: "MOVE",
			destinationId: "hallway",
		});
	});

	it("asks the model to choose when a typo is not a clear match, and accepts an offered id", async () => {
		model({ intent: "MOVE" }, { target: "libary" }, { id: "library" });
		expect(await resolve("go to the libary", view())).toEqual({
			type: "MOVE",
			destinationId: "library",
		});
		expect(calls()).toHaveLength(3);
		expect(bodyOf(2).prompt).toContain("library: Library");
	});

	it("still grounds a place that is not reachable from here, so the rules can refuse it properly", async () => {
		model({ intent: "MOVE" }, { target: "greenhouse" });
		expect(await resolve("go to the greenhouse", view())).toEqual({
			type: "MOVE",
			destinationId: "greenhouse",
		});
	});

	it("keeps the player's words when nothing fits and the model says none", async () => {
		model({ intent: "MOVE" }, { target: "Narnia" }, { id: "none" });
		expect(await resolve("go to Narnia", view())).toEqual({
			type: "MOVE",
			destinationId: "Narnia",
		});
	});

	it("does not trust an id the model invents", async () => {
		model({ intent: "MOVE" }, { target: "Narnia" }, { id: "wardrobe" });
		expect(await resolve("go to Narnia", view())).toMatchObject({
			destinationId: "Narnia",
		});
	});
});

describe("people, subjects, spells", () => {
	it("grounds a person by first name, preferring who is here", async () => {
		model({ intent: "TALK" }, { target: "Rubeus" });
		const view = viewAt("great_hall", (s) => moveToNpc(s, registry, "hagrid"));
		expect(await resolve("have a word with Rubeus", view)).toMatchObject({
			type: "TALK",
			npcId: "hagrid",
		});
	});

	it("grounds a subject with a different spelling through the model's choice", async () => {
		model({ intent: "ATTEND_CLASS" }, { target: "defence against the dark arts" }, {
			id: "defense-against-the-dark-arts",
		});
		expect(
			await resolve("sit in on the defence against the dark arts lesson", viewAt("classroom")),
		).toMatchObject({
			type: "ATTEND_CLASS",
			subjectId: "defense-against-the-dark-arts",
		});
	});

	it("grounds a study subject by name", async () => {
		model({ intent: "STUDY" }, { target: "potions", duration: 2 });
		expect(await resolve("study potions for two hours", viewAt("great_hall"))).toEqual({
			type: "STUDY",
			subjectId: "potions",
			duration: 2,
		});
	});

	it("grounds a spell by its name, learned or not", async () => {
		model({ intent: "PRACTICE" }, { target: "wingardium leviosa" });
		expect(await resolve("practise wingardium leviosa", viewAt("great_hall"))).toMatchObject({
			type: "PRACTICE",
			spellId: "levitate",
		});

		model({ intent: "PRACTICE" }, { target: "Wingardium Leviosa" });
		const learned = viewAt("great_hall", (s) =>
			s.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "t")),
		);
		expect(await resolve("practice it", learned)).toMatchObject({ spellId: "levitate" });
	});
});

describe("what the model is told", () => {
	it("gets a JSON schema, not free-form JSON, so it cannot invent keys", async () => {
		model({ intent: "MOVE" }, { target: "library" });
		await resolve("go to the library", viewAt("hallway"));
		expect(bodyOf(0).format).toMatchObject({ type: "object" });
		expect(bodyOf(0).format.properties.intent).toBeDefined();
		expect(bodyOf(1).format.properties.target).toBeDefined();
	});

	it("asks for a repeatable answer: temperature 0 on every call", async () => {
		model({ intent: "MOVE" }, { target: "library" });
		await resolve("go to the library", viewAt("hallway"));
		expect(bodyOf(0).options).toEqual({ temperature: 0 });
		expect(bodyOf(1).options).toEqual({ temperature: 0 });
	});

	it("names the player so third-person sentences are read as the player acting", async () => {
		model({ intent: "MOVE" }, { target: "library" });
		const view = { ...viewAt("hallway"), playerName: "Harry" };
		await resolve("Harry goes to the library in main building", view);
		for (const i of [0, 1]) {
			expect(bodyOf(i).prompt).toContain('"Harry goes to the library"');
		}
	});

	it("tells the classifier that going to a place is a move, whatever the place is called", async () => {
		model({ intent: "MOVE" }, { target: "classroom" });
		await resolve("enter the classroom", viewAt("hallway"));
		const prompt = bodyOf(0).prompt;
		expect(prompt).toContain("Classroom");
		expect(prompt).toContain("Hagrid's hut".replace("Hagrid's hut", "Gamekeeper's Hut"));
		expect(prompt).toContain("is MOVE");
		expect(prompt).toContain("ATTEND_CLASS is only for attending the lesson itself");
	});

	it("shows the places that can be reached from here, as ids with names", async () => {
		model({ intent: "MOVE" }, { target: "library" });
		await resolve("go to the library", viewAt("great_hall"));
		const prompt = bodyOf(1).prompt;
		expect(prompt).toContain("Great Hall");
		expect(prompt).toContain("hallway = Main Corridor");
		expect(prompt).toContain('shape: {"target"');
	});

	it("shows only the list that matters for the intent", async () => {
		model({ intent: "TALK" }, { target: "hagrid" });
		await resolve("talk to hagrid", viewAt("great_hall", (s) => moveToNpc(s, registry, "hagrid")));
		const prompt = bodyOf(1).prompt;
		expect(prompt).toContain("People here right now");
		expect(prompt).toContain("hagrid = Rubeus Hagrid");
		expect(prompt).not.toContain("Places they can reach");
	});
});

describe("hours", () => {
	it.each([[1e15], [0], [-3], [99]])("drops an absurd duration of %p", async (duration) => {
		model({ intent: "REST" }, { duration });
		expect(await resolve("rest", viewAt("great_hall"))).toEqual({
			type: "REST",
			duration: 1,
			locationId: undefined,
		});
	});

	it("keeps a sensible duration", async () => {
		model({ intent: "REST" }, { duration: 3 });
		expect(await resolve("rest three hours", viewAt("great_hall"))).toMatchObject({
			duration: 3,
		});
	});
});

describe("a target the player never gave is asked for, not guessed", () => {
	const hints: [string, string, string][] = [
		["MOVE", "go", "Where do you want to go?"],
		["TALK", "talk", "Who do you want to talk to?"],
		["STUDY", "study", "Which subject do you want to study?"],
		["ATTEND_CLASS", "attend a class", "Which class do you want to attend?"],
		["PRACTICE", "practise", "Which spell do you want to practise?"],
		["INTERACT", "use", "Which item do you mean?"],
	];

	it.each(hints)("%s with no target asks '%s'", async (intent, input, hint) => {
		for (const target of [undefined, "", "   ", "none", "Unknown", "N/A", "null"]) {
			model({ intent }, target === undefined ? {} : { target });
			expect(await resolve(input, viewAt("great_hall"))).toEqual({
				type: "UNKNOWN",
				input,
				hint,
			});
		}
	});

	it.each([
		["study", "STUDY", "charms"],
		["talk", "TALK", "hagrid"],
		["go to", "MOVE", "library"],
		["please study for two hours", "STUDY", "potions"],
		["I want to practise", "PRACTICE", "levitate"],
		["use", "INTERACT", "wand"],
	])("treats %p as naming nothing even if the model invents %p", async (input, intent, invented) => {
		model({ intent }, { target: invented });
		const command = await resolve(input, viewAt("hallway"));
		expect(command).toMatchObject({ type: "UNKNOWN", input });
		expect((command as any).hint).toBeTruthy();
	});

	it("keeps a real target when the sentence names something", async () => {
		model({ intent: "STUDY" }, { target: "potions" });
		expect(await resolve("please study potions for two hours", viewAt("hallway"))).toMatchObject({
			type: "STUDY",
			subjectId: "potions",
		});
	});

	it("does not spend a model call grounding a non-answer", async () => {
		model({ intent: "MOVE" }, { target: "none" });
		await resolve("go", viewAt("hallway"));
		expect(calls()).toHaveLength(2);
	});

	it("never turns a missing study subject into charms", async () => {
		model({ intent: "STUDY" }, { duration: 2 });
		const command = await resolve("study for two hours", viewAt("great_hall"));
		expect(command).toMatchObject({ type: "UNKNOWN" });
		expect(JSON.stringify(command)).not.toContain("charms");
	});

	it("still builds the command when the target is there", async () => {
		model({ intent: "STUDY" }, { target: "charms" });
		expect(await resolve("study charms", viewAt("great_hall"))).toMatchObject({
			type: "STUDY",
			subjectId: "charms",
		});
	});

	it("gives a nameless save or load the same slots as the fast path", async () => {
		model({ intent: "SAVE" }, {});
		expect(await resolve("save my progress", viewAt("great_hall"))).toEqual({
			type: "SAVE",
			filename: "quicksave",
		});
		model({ intent: "LOAD" }, { target: "" });
		expect(await resolve("load my progress", viewAt("great_hall"))).toEqual({
			type: "LOAD",
			filename: "quicksave",
			fallbackFilename: "autosave",
		});
	});

	it("keeps 'use' as the verb for an item when none is given", async () => {
		model({ intent: "INTERACT" }, { target: "wand" });
		const view = viewAt("great_hall", (s) =>
			s.inventory.items.push(new Item("wand", "Wand")),
		);
		expect(await resolve("wand", view)).toMatchObject({
			itemId: "wand",
			actionType: "use",
		});
	});
});
