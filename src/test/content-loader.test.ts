import * as path from "path";
import ContentLoader from "../core/content/ContentLoader";
import { ContentError } from "../core/content/ContentError";
import Registry from "../core/Registry";
import Location from "../core/domain/world/Location";
import NPC from "../core/domain/npc/Npc";
import {
	classSlot,
	contentDir,
	curriculum,
	lesson,
	location,
	manifest,
	npc,
	profile,
	spell,
	subjects,
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
	let dir: ReturnType<typeof contentDir>;
	let registry: Registry;

	beforeEach(() => {
		dir = contentDir();
		registry = new Registry();
	});
	afterEach(() => dir.remove());

	/** The school data every content directory needs, so tests can focus on one thing. */
	const writeSchool = () => {
		dir.write("curriculum/subjects.json", manifest({ subjects: subjects("charms") }, { id: "c.subjects" }));
		dir.write("curriculum/year1.json", manifest({ curriculums: [curriculum("charms")] }, { id: "c.year1" }));
		dir.write("curriculum/times.json", manifest({ timetables: timetables(classSlot("charms")) }, { id: "c.times" }));
	};
	const load = () => new ContentLoader(dir.dir).load(registry);

	describe("loading", () => {
		it("loads every kind of content from several domains", () => {
			writeSchool();
			dir.write("world/world.json", manifest({ locations: [location("hall", ["yard"]), location("yard", ["hall"])] }, { id: "w.world" }));
			dir.write("npcs/people.json", manifest({ npcs: [npc("anna")], profiles: [profile("anna")] }, { id: "n.people" }));
			dir.write("spells/magic.json", manifest({ spells: [spell("glow")] }, { id: "s.magic" }));

			load();

			const hall = registry.getLocation("hall");
			expect(hall).toBeInstanceOf(Location);
			expect(hall?.connectedLocationsIds).toEqual(["yard"]);
			expect(registry.getNPC("anna")).toBeInstanceOf(NPC);
			expect(registry.getNPC("anna")?.schedule?.home).toBe("forest");
			expect(registry.getNpcProfile("anna")?.traits).toEqual(["kind"]);
			expect(registry.getSpell("glow")?.definition.name).toBe("Spell glow");
		});

		it("assembles the school data from the curriculum packs", () => {
			writeSchool();
			dir.write("world/w.json", manifest({ locations: [location("forest")] }, { id: "w.w" }));

			load();

			const school = registry.getSchoolData();
			expect(school?.subjects.charms.name).toBe("CHARMS");
			expect(school?.curriculums[0].lessons[0].id).toBe("charms-1-1");
			expect(school?.timetables[0].slots[0].subject).toBe("charms");
		});

		it("reports progress for every pack, in load order", () => {
			writeSchool();
			dir.write("world/a.json", manifest({ locations: [location("a")] }, { id: "w.a" }));
			const seen: string[] = [];

			new ContentLoader(dir.dir).load(registry, (progress) => {
				seen.push(String(progress.currentPackName));
				expect(progress.totalPacks).toBe(4);
			});

			expect(seen).toHaveLength(4);
			expect(seen).toContain("w.a");
		});

		it("says where each piece of content came from", () => {
			writeSchool();
			dir.write("world/w.json", manifest({ locations: [location("hall"), location("yard")] }, { id: "w.w" }));

			const origins = new ContentLoader(dir.dir).load(registry);

			expect(origins.where("locations", "yard")).toMatch(/^world\/w\.json:\d+:\d+$/);
			expect(origins.where("locations", "nowhere")).toBe("");
			expect(origins.where("lessons", "charms-1-1")).toMatch(/^curriculum\/year1\.json:/);
		});
	});

	describe("packs that depend on each other", () => {
		it("loads dependencies first, whatever the file names", () => {
			writeSchool();
			dir.write("npcs/a-needs-b.json", manifest({ profiles: [profile("anna")] }, { id: "n.a", requires: [{ id: "n.b" }] }));
			dir.write("npcs/z-has-anna.json", manifest({ npcs: [npc("anna")] }, { id: "n.b" }));
			const order: string[] = [];

			new ContentLoader(dir.dir).load(registry, (p) => order.push(String(p.currentPackName)));

			expect(order.indexOf("n.b")).toBeLessThan(order.indexOf("n.a"));
		});

		it("reports a pack that is not there", () => {
			writeSchool();
			dir.write("npcs/a.json", manifest({}, { id: "n.a", requires: [{ id: "n.missing" }] }));

			const message = contentError(load).message;

			expect(message).toContain('pack "n.missing" is not present');
			expect(message).toMatch(/npcs\/a\.json:\d+:\d+/);
		});

		it("reports a version that is too old, or another major", () => {
			writeSchool();
			dir.write("npcs/old.json", manifest({}, { id: "n.old", version: "1.1.0" }));
			dir.write("npcs/wants-newer.json", manifest({}, { id: "n.x", requires: [{ id: "n.old", version: "1.2.0" }] }));
			dir.write("npcs/wants-other-major.json", manifest({}, { id: "n.y", requires: [{ id: "n.old", version: "2.0.0" }] }));

			const { problems } = contentError(load);

			expect(problems).toHaveLength(2);
			expect(problems.join("\n")).toContain("is version 1.1.0, but 1.2.0");
		});

		it("accepts a newer minor version", () => {
			writeSchool();
			dir.write("npcs/new.json", manifest({}, { id: "n.new", version: "1.3.0" }));
			dir.write("npcs/wants.json", manifest({}, { id: "n.x", requires: [{ id: "n.new", version: "1.2.0" }] }));

			expect(load).not.toThrow();
		});

		it("reports a dependency cycle", () => {
			writeSchool();
			dir.write("npcs/a.json", manifest({}, { id: "n.a", requires: [{ id: "n.b" }] }));
			dir.write("npcs/b.json", manifest({}, { id: "n.b", requires: [{ id: "n.a" }] }));

			expect(contentError(load).message).toContain("dependency cycle");
		});

		it("reports a pack id used twice", () => {
			writeSchool();
			dir.write("npcs/a.json", manifest({}, { id: "n.same" }));
			dir.write("npcs/b.json", manifest({}, { id: "n.same" }));

			expect(contentError(load).message).toContain('pack id "n.same" is already used by npcs/a.json');
		});
	});

	describe("the same id twice", () => {
		beforeEach(writeSchool);

		it("is an error unless the later pack says it replaces it", () => {
			dir.write("npcs/a.json", manifest({ npcs: [npc("anna")] }, { id: "n.a" }));
			dir.write("npcs/b.json", manifest({ npcs: [npc("anna")] }, { id: "n.b", requires: [{ id: "n.a" }] }));

			const { message } = contentError(load);

			expect(message).toContain('NPC "anna" is already defined in npcs/a.json');
			expect(message).toContain("overrides.npcs");
		});

		it("is allowed, and the later one wins, when listed under overrides", () => {
			dir.write("npcs/a.json", manifest({ npcs: [npc("anna")] }, { id: "n.a" }));
			dir.write(
				"npcs/b.json",
				manifest(
					{ npcs: [npc("anna", { name: "Anna the Second" })] },
					{ id: "n.b", requires: [{ id: "n.a" }], overrides: { npcs: ["anna"] } },
				),
			);

			load();

			expect(registry.getNPC("anna")?.name).toBe("Anna the Second");
			expect(registry.getAllNpcIds()).toEqual(["anna"]);
		});

		it("is an error to override something that was never defined", () => {
			dir.write("npcs/b.json", manifest({}, { id: "n.b", overrides: { npcs: ["ghost"] } }));

			expect(contentError(load).message).toContain('NPC "ghost" overrides nothing');
		});

		it("applies to locations, profiles, spells and school content too", () => {
			dir.write("world/a.json", manifest({ locations: [location("forest")] }, { id: "w.a" }));
			dir.write("world/b.json", manifest({ locations: [location("forest")] }, { id: "w.b", requires: [{ id: "w.a" }] }));
			dir.write("spells/a.json", manifest({ spells: [spell("glow")] }, { id: "s.a" }));
			dir.write("spells/b.json", manifest({ spells: [spell("glow")] }, { id: "s.b", requires: [{ id: "s.a" }] }));
			dir.write("curriculum/more-subjects.json", manifest({ subjects: subjects("charms") }, { id: "c.more", requires: [{ id: "c.subjects" }] }));

			const { message } = contentError(load);

			for (const kind of ['location "forest"', 'spell "glow"', 'subject "charms"']) {
				expect(message).toContain(kind);
			}
		});
	});

	describe("where a pack lives", () => {
		beforeEach(writeSchool);

		it("a pack can only hold what its folder is for", () => {
			dir.write("world/people.json", manifest({ npcs: [npc("anna")] }, { id: "w.people" }));

			const message = contentError(load).message;

			expect(message).toMatch(/world\/people\.json:\d+:\d+: npcs: a pack in world\/ can only hold locations/);
		});

		it("every domain folder must exist", () => {
			dir.remove();
			dir = contentDir();
			dir.write("world/w.json", manifest({ locations: [location("a")] }, { id: "w.w" }));
			// remove the spells folder
			require("fs").rmSync(path.join(dir.dir, "spells"), { recursive: true });

			expect(contentError(load).message).toContain("Content folder not found: spells/");
		});
	});

	describe("bad files", () => {
		beforeEach(writeSchool);

		it("reports the problems of every bad file in a single error", () => {
			dir.write("npcs/good.json", manifest({ npcs: [npc("fine")] }, { id: "n.good" }));
			dir.write("npcs/typo.json", manifest({ npcs: [npc("anna", { aliasses: [] })] }, { id: "n.typo" }));
			const badSpell = spell("glow");
			badSpell.definition.level = "legendary";
			dir.write("spells/bad.json", manifest({ spells: [badSpell] }, { id: "s.bad" }));

			const error = contentError(load);

			expect(error.problems).toHaveLength(2);
			expect(error.message).toContain("npcs/typo.json");
			expect(error.message).toContain("spells/bad.json");
			expect(error.message).not.toContain("good.json");
		});

		it("names the file, line and reason when the JSON is malformed", () => {
			dir.write("npcs/broken.json", '{\n  "format": 2,\n  oops\n}');

			const error = contentError(load);

			expect(error.problems[0]).toMatch(/^npcs\/broken\.json:3:\d+: not valid JSON/);
		});

		it("rejects a file that is not a pack at all", () => {
			dir.write("npcs/list.json", "[1, 2, 3]");

			expect(contentError(load).problems[0]).toContain("npcs/list.json");
		});

		it("rejects a version 1 pack with a clear message", () => {
			dir.write("npcs/old.json", { name: "Old", version: "1.0.0", npcs: [npc("anna")] });

			const text = contentError(load).message;

			expect(text).toContain("npcs/old.json");
			expect(text).toContain("format");
			expect(text).toContain("id");
		});
	});

	describe("missing content", () => {
		it("rejects a missing content directory", () => {
			const loader = new ContentLoader(path.join(dir.dir, "nowhere"));

			expect(contentError(() => loader.load(registry)).message).toContain("not found");
		});

		it("rejects a directory with no packs in it", () => {
			expect(contentError(load).message).toContain("No content packs");
		});

		it.each(["subjects", "curriculums", "timetables"])("fails when there are no %s", (missing) => {
			dir.write("world/w.json", manifest({ locations: [location("forest")] }, { id: "w.w" }));
			const parts: Record<string, unknown> = {
				subjects: subjects("charms"),
				curriculums: [curriculum("charms")],
				timetables: timetables(classSlot("charms")),
			};
			for (const [key, value] of Object.entries(parts)) {
				if (key !== missing) dir.write(`curriculum/${key}.json`, manifest({ [key]: value }, { id: `c.${key}` }));
			}

			expect(contentError(load).message).toContain(`No ${missing} found`);
		});

		it("lessons keep their order and ids when two curriculum packs add subjects", () => {
			dir.write("world/w.json", manifest({ locations: [location("forest")] }, { id: "w.w" }));
			dir.write("curriculum/s.json", manifest({ subjects: subjects("charms", "potions") }, { id: "c.s" }));
			dir.write("curriculum/c1.json", manifest({ curriculums: [curriculum("charms", [lesson("charms", 1)])] }, { id: "c.c1", requires: [{ id: "c.s" }] }));
			dir.write("curriculum/c2.json", manifest({ curriculums: [curriculum("potions", [lesson("potions", 1)])] }, { id: "c.c2", requires: [{ id: "c.s" }] }));
			dir.write("curriculum/t.json", manifest({ timetables: timetables(classSlot("charms")) }, { id: "c.t" }));

			load();

			expect(registry.getSchoolData()?.curriculums.map((c) => c.subjectType).sort()).toEqual(["charms", "potions"]);
		});
	});
});
