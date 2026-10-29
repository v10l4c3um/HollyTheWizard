import * as fs from "fs/promises";
import * as path from "path";
import {
	FAKE_NARRATION,
	lastRendererPrompt,
	resetFakeOllama,
	scriptPlayer,
	unscriptedInputs,
} from "./helpers/fakeOllama";
import { fixedRandom } from "../core/domain/random/Random";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";
import GameState from "../core/domain/world/GameState";
import { TurnOutcome } from "../core/engine/TurnOutcome";
import { activeClass } from "../core/domain/quest/Timetable";

// Only the model is faked. Resolver, TurnResolver, Renderer, effects,
// persistence and the real content packs all run for real.
jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

/**
 * The minimal playthrough the rework is aiming at, driven only by free-text
 * player input through `GameEngine.handleCommand`. Each `it` is one step and
 * the steps share one game, in order.
 *
 * The world runs on a schedule: the game starts in the great hall on Monday
 * morning, Hagrid is on the grounds, and Charms is taught in the classroom on
 * Monday and Thursday mornings, so the route and the waiting below are part
 * of the playthrough. (No step is a known failure any more; if one ever has
 * to be, mark it `it.failing` and say why.)
 */
describe("golden path: first day at school", () => {
	let game: TestGame;
	const logSpies: jest.SpyInstance[] = [];

	const state = (): GameState => game.engine.state;

	/** Scripts what the fake model will understand for this line, then plays it. */
	async function say(
		input: string,
		intent: string,
		args?: Record<string, unknown>,
	): Promise<TurnOutcome> {
		scriptPlayer(input, { intent, args });
		return game.engine.handleCommand(input);
	}

	/** Rests an hour at a time until `subject` is being taught and has not been attended yet. */
	async function waitForClass(subject: string): Promise<void> {
		for (let hour = 0; hour < 24 * 14; hour++) {
			const slot = activeClass(
				game.registry.getTimetable(state().currentYear),
				state().worldClock.getWeekday(),
				state().worldClock.timeOfDay,
			);
			const attended =
				slot &&
				state().flags[`attended.${subject}.${state().worldClock.getDay()}.${slot.period}`];
			if (slot?.subject === subject && !attended) return;
			await say("wait a while", "REST", { duration: 1 });
		}
		throw new Error(`no ${subject} class within two weeks`);
	}

	beforeAll(async () => {
		resetFakeOllama();
		// The content loader is noisy.
		for (const method of ["log", "debug"] as const) {
			logSpies.push(jest.spyOn(console, method).mockImplementation());
		}
		// Chance always comes out in the player's favour, so the route is the same every run.
		game = await buildTestGame({ random: () => fixedRandom(0) });
	});

	afterAll(async () => {
		logSpies.forEach((spy) => spy.mockRestore());
		await game.dispose();
	});

	afterEach(() => {
		// The Resolver turns any failure into a silent REST, so an input the
		// script did not cover would otherwise hide as a no-op turn.
		expect(unscriptedInputs).toEqual([]);
	});

	it("starts in the great hall on a Monday morning and narrates the first turn", async () => {
		expect(state().currentLocationId).toBe("great_hall");
		expect(state().worldClock.getWeekday()).toBe("monday");
		const result = await say("look around", "REST", { duration: 0 });
		expect(result.narration).toBe(FAKE_NARRATION);
		expect(lastRendererPrompt()).toContain("Monday (day 1), morning");
		expect(lastRendererPrompt()).toContain("No one else is nearby");
	});

	it("walks out to the grounds and around the countryside, discovering places", async () => {
		const clockBefore = state().worldClock.getTotalMinutes();

		await say("go to the corridor", "MOVE", { target: "hallway" });
		await say("go outside to the grounds", "MOVE", { target: "grounds" });
		expect(state().currentLocationId).toBe("grounds");
		expect(state().discoveredLocationIds).toContain("grounds");
		expect(state().questFlags.active).toContain("discovered:grounds");

		await say("walk down to the village", "MOVE", { target: "startingVillage" });
		await say("go to the market", "MOVE", { target: "market" });
		expect(state().questFlags.active).toContain("discovered:market");
		await say("head back to the village", "MOVE", { target: "startingVillage" });
		await say("walk into the forest", "MOVE", { target: "forest" });
		await say("return to the school grounds", "MOVE", { target: "grounds" });

		expect(state().currentLocationId).toBe("grounds");
		expect(state().worldClock.getTotalMinutes()).toBe(clockBefore + 7 * 5);
	});

	describe("talking to an NPC", () => {
		const chat = () =>
			say("chat with hagrid about everyday things", "TALK", {
				target: "hagrid",
				conversationTopic: "daily_chat",
			});

		it("finds Hagrid on the grounds, and records the conversation", async () => {
			await chat();
			await chat();
			await chat();
			expect(state().conversationHistory["hagrid"]).toHaveLength(3);
		});

		it("tells the narrator who is here", async () => {
			expect(lastRendererPrompt()).toContain("Nearby: Rubeus Hagrid");
		});

		it("finds the NPC by name, not only by id", async () => {
			await say("talk to Rubeus about everyday things", "TALK", {
				target: "Rubeus",
				conversationTopic: "daily_chat",
			});
			expect(state().conversationHistory["hagrid"]).toHaveLength(4);
		});

		it("finds the NPC by an epithet", async () => {
			await say("talk to the gamekeeper about everyday things", "TALK", {
				target: "the gamekeeper",
				conversationTopic: "daily_chat",
			});
			expect(state().conversationHistory["hagrid"]).toHaveLength(5);
		});

		it("cannot talk to someone who is elsewhere, and loses no time", async () => {
			// Hermione is in the classroom this morning.
			const minutesBefore = state().worldClock.getTotalMinutes();
			const eventsBefore = state().recentEvents.length;

			await say("talk to Hermione", "TALK", { target: "Hermione" });

			expect(state().worldClock.getTotalMinutes()).toBe(minutesBefore);
			expect(state().recentEvents).toHaveLength(eventsBefore);
			expect(state().conversationHistory["hermione_granger"]).toBeUndefined();
		});

		it("rejects someone who does not exist, without spending time", async () => {
			const minutesBefore = state().worldClock.getMinutesOfDay();
			const eventsBefore = state().recentEvents.length;

			await say("talk to Gandalf", "TALK", { target: "Gandalf" });

			expect(state().worldClock.getMinutesOfDay()).toBe(minutesBefore);
			expect(state().recentEvents).toHaveLength(eventsBefore);
			expect(Object.keys(state().conversationHistory)).toEqual(["hagrid"]);
		});

		it("builds a relationship (trust rises)", async () => {
			expect(state().relationships["hagrid"].trust).toBeGreaterThan(0);
		});
	});

	describe("attending Charms", () => {
		it("lesson 1 is Monday morning in the classroom", async () => {
			await say("go back inside", "MOVE", { target: "hallway" });
			await say("go to the classroom", "MOVE", { target: "classroom" });
			expect(state().worldClock.timeOfDay).toBe("morning");

			await say("attend charms class", "ATTEND_CLASS", {
				target: "charms",
				duration: 1,
			});

			expect(state().academicState.subjects["charms"].knowledge).toBe(5);
			expect(state().questFlags.active).toContain("lesson_completed:charms:charms-1-1");
			expect(state().flags["attended.charms.1.morning"]).toBe(true);
		});

		it("the same class cannot be attended twice", async () => {
			const minutesBefore = state().worldClock.getTotalMinutes();

			await say("attend charms class again", "ATTEND_CLASS", {
				target: "charms",
				duration: 1,
			});

			expect(state().academicState.subjects["charms"].currentLessonOrder).toBe(2);
			expect(state().worldClock.getTotalMinutes()).toBe(minutesBefore);
		});

		it("lesson 2 teaches the levitation charm, on Thursday", async () => {
			await waitForClass("charms");
			expect(state().worldClock.getWeekday()).toBe("thursday");

			await say("attend charms class", "ATTEND_CLASS", {
				target: "charms",
				duration: 1,
			});

			expect(state().academicState.subjects["charms"].knowledge).toBe(13);
			expect(state().spellbook.getSpellState("levitate")?.knowledgeState).toBe("learned");
			expect(state().questFlags.active).toContain("spell_revealed:levitate");
		});
	});

	describe("learning and mastering a spell", () => {
		it("a taught spell can be practised straight away", async () => {
			await say("practice the levitation charm", "PRACTICE", {
				target: "levitate",
				duration: 1,
			});
			const spell = state().spellbook.getSpellState("levitate")!;
			expect(spell.practicePoints + spell.proficiency).toBeGreaterThan(0);
		});

		it("practice leads to mastery", async () => {
			for (let session = 0; session < 30; session++) {
				await say("practice levitate for ten hours", "PRACTICE", {
					target: "levitate",
					duration: 10,
				});
				if (
					state().spellbook.getSpellState("levitate")?.knowledgeState ===
					"mastered"
				)
					break;
			}

			expect(
				state().spellbook.getSpellState("levitate")?.knowledgeState,
			).toBe("mastered");
			expect(state().questFlags.completed).toContain("mastered:levitate");
		});
	});

	describe("story milestones", () => {
		beforeAll(async () => {
			// The fallback blueprint only has a `yearStart` milestone, so hand
			// the year two that hang on things this playthrough did.
			const blueprint = state().yearBlueprints[1]!;
			state().yearBlueprints[1] = {
				...blueprint,
				milestones: [
					{
						id: "m_revealed",
						description: "Saw the levitation charm",
						trigger: {
							type: "questFlag",
							flag: "spell_revealed:levitate",
						},
					},
					{
						id: "m_mastered",
						description: "Mastered the levitation charm",
						trigger: { type: "questFlag", flag: "mastered:levitate" },
					},
				],
			};
			await say("take a short rest", "REST", { duration: 1 });
		});

		it("fires for a flag the game sets as active", () => {
			expect(state().yearProgress.completedMilestoneIds).toContain(
				"m_revealed",
			);
		});

		// `mastered:*` flags are written to questFlags.completed, so milestones
		// must read both lists.
		it("fires for a mastery flag", () => {
			expect(state().yearProgress.completedMilestoneIds).toContain(
				"m_mastered",
			);
		});
	});

	describe("input the model cannot make sense of", () => {
		it("is reported, and costs no time and leaves no trace", async () => {
			const minutesBefore = state().worldClock.getMinutesOfDay();
			const eventsBefore = [...state().recentEvents];
			const locationBefore = state().currentLocationId;

			// Not scripted, so the fake model fails exactly like a real one
			// that is down or answers nonsense.
			const result = await game.engine.handleCommand("asdf qwer zxcv");
			expect(unscriptedInputs).toEqual(["asdf qwer zxcv"]);
			unscriptedInputs.length = 0;

			expect(result.narration).toContain("didn't understand");
			expect(result.narration).toContain("asdf qwer zxcv");
			expect(result.narration).not.toBe(FAKE_NARRATION);
			expect(state().worldClock.getMinutesOfDay()).toBe(minutesBefore);
			expect(state().recentEvents).toEqual(eventsBefore);
			expect(state().currentLocationId).toBe(locationBefore);
		});
	});

	describe("the calendar", () => {
		it("resting a full day moves on to the next day and weekday", async () => {
			const dayBefore = state().worldClock.getDay();
			const weekdayBefore = state().worldClock.getWeekday();

			await say("sleep through a whole day", "REST", { duration: 24 });

			expect(state().worldClock.getDay()).toBe(dayBefore + 1);
			expect(state().worldClock.getWeekday()).not.toBe(weekdayBefore);
		});
	});

	describe("saving and loading", () => {
		it("saves to disk", async () => {
			const result = await say("save the game as day one", "SAVE", {
				target: "dayone",
			});
			expect(result.narration).toContain("saved");
			await expect(
				fs.stat(path.join(game.savesDir, "dayone.json")),
			).resolves.toBeDefined();
		});

		it("loads the same progress back", async () => {
			const before = state();
			const attributesBefore = before.player.attributes.getAll();
			const totalMinutesBefore = before.worldClock.getTotalMinutes();
			expect(before.worldClock.getDay()).toBeGreaterThan(1);
			expect(
				Object.values(attributesBefore).some((value) => value > 0),
			).toBe(true);
			const result = await say("load day one", "LOAD", {
				target: "dayone",
			});
			expect(result.narration).toContain("Loaded");
			expect(state()).not.toBe(before);
			expect(state().player.attributes.getAll()).toEqual(attributesBefore);
			expect(state().worldClock.getTotalMinutes()).toBe(totalMinutesBefore);
			expect(state().worldClock.getDay()).toBe(before.worldClock.getDay());
			expect(state().currentLocationId).toBe("classroom");
			expect(
				state().spellbook.getSpellState("levitate")?.knowledgeState,
			).toBe("mastered");
			expect(state().academicState.subjects["charms"].knowledge).toBe(13);
		});

		it("the loaded game can keep playing (the next lesson)", async () => {
			const attributesBefore = state().player.attributes.getAll();
			await waitForClass("charms");

			const result = await say("attend charms class", "ATTEND_CLASS", {
				target: "charms",
				duration: 1,
			});

			expect(result.narration).toBe(FAKE_NARRATION);
			expect(state().academicState.subjects["charms"].currentLessonOrder).toBe(4);
			expect(state().player.attributes.getAll()).not.toEqual(attributesBefore);
		});

		it("remembers which classes were already attended before the save", async () => {
			const day = state().worldClock.getDay();
			expect(state().flags[`attended.charms.${day}.morning`]).toBe(true);
			expect(state().flags["attended.charms.1.morning"]).toBe(true);
		});
	});
});
