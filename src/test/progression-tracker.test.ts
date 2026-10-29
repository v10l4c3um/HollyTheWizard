import * as fs from "fs";
import * as path from "path";
import { QUEST_FLAG_EVENTS } from "../core/domain/campaign/QuestFlags";
import { resetFakeOllama, scriptPlayer } from "./helpers/fakeOllama";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

describe("quest flags come from effects", () => {
	it("maps each progress event to the flag the blueprints look for", () => {
		const flag = (e: { list: string; flag: string }[]) => e.map((x) => `${x.list}:${x.flag}`);
		expect(flag(QUEST_FLAG_EVENTS.LessonAttended({ subjectId: "charms", lessonId: "l1", lessonTitle: "T" }) as never)).toEqual(["active:lesson_completed:charms:l1"]);
		expect(flag(QUEST_FLAG_EVENTS.LocationDiscovered({ locationId: "library" }) as never)).toEqual(["active:discovered:library"]);
		expect(flag(QUEST_FLAG_EVENTS.SpellRevealed({ spellId: "lumos", source: "study" }) as never)).toEqual(["active:spell_revealed:lumos"]);
		expect(flag(QUEST_FLAG_EVENTS.SpellMastered({ spellId: "lumos" }) as never)).toEqual(["completed:mastered:lumos"]);
	});

	describe("in a running game", () => {
		let game: TestGame;
		beforeEach(async () => {
			resetFakeOllama();
			game = await buildTestGame();
		});
		afterEach(() => game.dispose());

		it("an event on the bus sets the flag on the live state, once", () => {
			game.bus.emit("SpellMastered", { spellId: "lumos" });
			game.bus.emit("SpellMastered", { spellId: "lumos" });
			game.bus.emit("LocationDiscovered", { locationId: "library" });

			const flags = game.engine.state.questFlags;
			expect(flags.completed.filter((f) => f === "mastered:lumos")).toHaveLength(1);
			expect(flags.active).toContain("discovered:library");
		});

		it("a failed turn leaves no flag behind", async () => {
			const before = game.engine.state;
			jest.spyOn(game.turnResolver, "decide").mockImplementation(() => {
				game.bus.emit("LocationDiscovered", { locationId: "grounds" });
				throw new Error("boom");
			});
			scriptPlayer("rest", { intent: "REST", args: { duration: 1 } });
			const outcome = await game.engine.handleCommand("rest");

			expect(outcome.error?.kind).toBe("internal");
			expect(game.engine.state).toBe(before);
			expect(before.questFlags.active).not.toContain("discovered:grounds");
			jest.restoreAllMocks();
		});
	});
});

describe("nothing bypasses the effect path for quest flags", () => {
	const allowed = ["EffectApplier.ts", "GameState.ts"];

	function sources(dir: string): string[] {
		return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) return sources(full);
			return entry.name.endsWith(".ts") ? [full] : [];
		});
	}

	it("only the applier (and the state itself) writes questFlags", () => {
		const root = path.join(__dirname, "..");
		const writes = sources(root)
			.filter((f) => !f.includes(`${path.sep}test${path.sep}`))
			.filter((f) => !allowed.includes(path.basename(f)))
			.filter((f) => /questFlags(\.(active|completed))?\s*(=[^=]|\.push|\.splice)|questFlags\.(active|completed)\.(push|splice)/.test(fs.readFileSync(f, "utf8")));
		expect(writes).toEqual([]);
	});
});
