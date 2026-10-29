import * as path from "path";
import ContentLoader from "../core/content/ContentLoader";
import { ContentError } from "../core/content/ContentError";
import { SchoolDataLoader } from "../core/content/SchoolDataLoader";
import Registry from "../core/Registry";
import Location from "../core/domain/world/Location";
import {
	classSlot,
	curriculum,
	lesson,
	location,
	manifest,
	npc,
	profile,
	spell,
	subjects,
	tempDir,
	timetables,
} from "./helpers/contentFixtures";

/** Run a function that must throw a ContentError and return it. */
function contentError(run: () => unknown): ContentError {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(ContentError);
		return error as ContentError;
	}
	throw new Error("expected a ContentError, but nothing was thrown");
}

describe("ContentLoader", () => {
	let packs: ReturnType<typeof tempDir>;
	let registry: Registry;

	beforeEach(() => {
		packs = tempDir();
		registry = new Registry();
	});
	afterEach(() => packs.remove());

	const load = () => new ContentLoader(packs.dir).loadAllPacks(registry);

	it("loads every kind of content from several packs", () => {
		packs.write(
			"world.json",
			manifest({ locations: [location("hall", ["yard"]), location("yard", ["hall"])] }),
		);
		packs.write(
			"people.json",
			manifest({ npcs: [npc("anna")], profiles: [profile("anna")] }),
		);
		packs.write("magic.json", manifest({ spells: [spell("glow")] }));

		load();

		const hall = registry.getLocation("hall");
		expect(hall).toBeInstanceOf(Location);
		expect(hall?.connectedLocationsIds).toEqual(["yard"]);
		expect(registry.getNPC("anna")?.aliases).toEqual([]);
		expect(registry.getNpcProfile("anna")?.traits).toEqual(["kind"]);
		expect(registry.getSpell("glow")?.definition.name).toBe("Spell glow");
	});

	it("reports progress for every pack", () => {
		packs.write("a.json", manifest({ npcs: [npc("a")] }));
		packs.write("b.json", manifest({ npcs: [npc("b")] }));
		const seen: number[] = [];

		new ContentLoader(packs.dir).loadAllPacks(registry, (progress) => {
			seen.push(progress.processedPacks);
			expect(progress.totalPacks).toBe(2);
		});

		expect(seen).toEqual([1, 2]);
	});

	it("reports the problems of every bad file in a single error", () => {
		packs.write("good.json", manifest({ npcs: [npc("fine")] }));
		packs.write("typo.json", manifest({ npcs: [npc("anna", { aliasses: [] })] }));
		const badSpell = spell("glow");
		badSpell.definition.level = "legendary";
		packs.write("spells.json", manifest({ spells: [badSpell] }));

		const error = contentError(load);

		expect(error.problems).toHaveLength(2);
		expect(error.message).toContain("typo.json");
		expect(error.message).toContain("spells.json");
		expect(error.message).not.toContain("good.json");
	});

	it("names the file when the JSON is malformed", () => {
		packs.write("broken.json", "{ not json");

		const error = contentError(load);

		expect(error.problems[0]).toContain("broken.json");
		expect(error.problems[0]).toContain("not valid JSON");
	});

	it("rejects a file that is not a pack at all", () => {
		packs.write("list.json", "[1, 2, 3]");

		expect(contentError(load).problems[0]).toContain("list.json");
	});

	it("rejects ids defined twice across packs", () => {
		packs.write(
			"one.json",
			manifest({
				locations: [location("hall")],
				npcs: [npc("anna")],
				profiles: [profile("anna")],
				spells: [spell("glow")],
			}),
		);
		packs.write(
			"two.json",
			manifest({
				locations: [location("hall")],
				npcs: [npc("anna")],
				profiles: [profile("anna")],
				spells: [spell("glow")],
			}),
		);

		const { message } = contentError(load);

		expect(message).toContain('Duplicate location id "hall"');
		expect(message).toContain('Duplicate NPC id "anna"');
		expect(message).toContain('Duplicate NPC profile for "anna"');
		expect(message).toContain('Duplicate spell id "glow"');
		expect(message).toContain("two.json");
	});

	it("rejects a missing pack directory", () => {
		const loader = new ContentLoader(path.join(packs.dir, "nowhere"));

		expect(contentError(() => loader.loadAllPacks(registry)).message).toContain(
			"not found",
		);
	});

	it("rejects a directory with no packs in it", () => {
		expect(contentError(load).message).toContain("No content packs");
	});
});

describe("SchoolDataLoader", () => {
	let dir: ReturnType<typeof tempDir>;

	beforeEach(() => {
		dir = tempDir();
	});
	afterEach(() => dir.remove());

	const writeGood = () => {
		dir.write("subjects.json", subjects("charms"));
		dir.write("year1-charms.json", curriculum("charms"));
		dir.write("timetables.json", timetables(classSlot("charms")));
	};
	const load = () => new SchoolDataLoader(dir.dir).loadSchoolData();

	it("loads subjects, curriculums and timetables", () => {
		writeGood();

		const data = load();

		expect(data.subjects.charms.name).toBe("CHARMS");
		expect(data.curriculums).toHaveLength(1);
		expect(data.curriculums[0].lessons[0].id).toBe("charms-1-1");
		expect(data.timetables[0].slots[0].subject).toBe("charms");
	});

	it.each(["subjects.json", "timetables.json"])(
		"fails when %s is missing, instead of returning nothing",
		(missing) => {
			writeGood();
			dir.remove();
			dir = tempDir();
			if (missing !== "subjects.json") dir.write("subjects.json", subjects("charms"));
			if (missing !== "timetables.json")
				dir.write("timetables.json", timetables(classSlot("charms")));
			dir.write("year1-charms.json", curriculum("charms"));

			expect(contentError(load).message).toContain(missing);
		},
	);

	it("fails when there are no curriculum files", () => {
		dir.write("subjects.json", subjects("charms"));
		dir.write("timetables.json", timetables(classSlot("charms")));

		expect(contentError(load).message).toContain("No curriculum files");
	});

	it("reports the problems of every bad file in a single error", () => {
		dir.write("subjects.json", { charms: { type: "potions", name: "X", description: "Y" } });
		dir.write("year1-charms.json", curriculum("charms", [lesson("charms", 0)]));
		dir.write("timetables.json", timetables({ day: "funday", period: "morning", type: "free" }));

		const error = contentError(load);

		expect(error.message).toContain("subjects.json");
		expect(error.message).toContain("year1-charms.json");
		expect(error.message).toContain("timetables.json");
	});

	it("names the file when the JSON is malformed", () => {
		writeGood();
		dir.write("year1-charms.json", "{ nope");

		expect(contentError(load).message).toContain("year1-charms.json");
	});
});
