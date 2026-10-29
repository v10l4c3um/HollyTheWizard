import {
	CurriculumFileSchema,
	formatIssues,
	PackManifestSchema,
	SubjectsFileSchema,
	TimetablesFileSchema,
} from "../core/content/ContentSchemas";
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
	timetables,
} from "./helpers/contentFixtures";

/** Every message names the file and where in it the problem is. */
function problems(
	schema: { safeParse(data: unknown): { success: boolean; error?: any } },
	data: unknown,
	file = "test.json",
): string[] {
	const result = schema.safeParse(data);
	expect(result.success).toBe(false);
	return formatIssues(file, result.error);
}

describe("pack manifest schema", () => {
	it("accepts a pack with every kind of content", () => {
		const result = PackManifestSchema.safeParse(
			manifest({
				locations: [location("hall", ["yard"]), location("yard", ["hall"])],
				npcs: [npc("anna")],
				profiles: [profile("anna")],
				spells: [spell("glow")],
			}),
		);
		expect(result.success).toBe(true);
	});

	it("fills in defaults: no aliases, no tag description", () => {
		const result = PackManifestSchema.parse(
			manifest({ npcs: [{ id: "bob", name: "Bob", dialogue: [] }] }),
		);
		expect(result.npcs?.[0].aliases).toEqual([]);
		expect(result.npcs?.[0].tag_description).toBe("");
	});

	it("gives a place no aliases unless it lists some", () => {
		const result = PackManifestSchema.parse(
			manifest({
				locations: [location("hall", [], ["the big room"]), location("yard")],
			}),
		);
		expect(result.locations?.[0].aliases).toEqual(["the big room"]);
		expect(result.locations?.[1].aliases).toEqual([]);
	});

	it("keeps accepting the unused fields the shipped content carries", () => {
		const withLegacy = manifest({
			npcs: [npc("anna", { affinity: 85 })],
			spells: [
				spell("glow", {
					definition: {
						...spell("glow").definition,
						requiredConditions: [],
					},
				}),
			],
		});
		expect(PackManifestSchema.safeParse(withLegacy).success).toBe(true);
	});

	describe("NPC schedules", () => {
		const schedule = {
			home: "hut",
			attendsClasses: true,
			teaches: ["potions"],
			slots: [
				{ days: ["monday", "friday"], periods: ["morning", "night"], location: "yard" },
				{ location: "hall" },
			],
		};

		it("accepts a full schedule and a bare one", () => {
			expect(
				PackManifestSchema.safeParse(manifest({ npcs: [npc("anna", { schedule })] })).success,
			).toBe(true);
			expect(
				PackManifestSchema.safeParse(
					manifest({ npcs: [npc("anna", { schedule: { home: "hut" } })] }),
				).success,
			).toBe(true);
		});

		it("is optional on the NPC", () => {
			const { schedule: _omitted, ...bare } = npc("anna");
			expect(PackManifestSchema.safeParse(manifest({ npcs: [bare] })).success).toBe(true);
		});

		it("needs a home", () => {
			const found = problems(
				PackManifestSchema,
				manifest({ npcs: [npc("anna", { schedule: { slots: [] } })] }),
			);
			expect(found.join("\n")).toContain("npcs.0.schedule.home");
		});

		it("rejects an unknown day, period or subject, and a misspelled key", () => {
			const bad = {
				home: "hut",
				teaches: ["cooking"],
				slots: [{ days: ["funday"], periods: ["noon"], location: "yard", where: "x" }],
			};
			const text = problems(PackManifestSchema, manifest({ npcs: [npc("anna", { schedule: bad })] })).join("\n");
			expect(text).toContain("teaches");
			expect(text).toContain("days");
			expect(text).toContain("periods");
			expect(text).toContain("where");
		});
	});

	it("rejects a misspelled key, naming the file and the place", () => {
		const found = problems(
			PackManifestSchema,
			manifest({ npcs: [npc("anna", { aliasses: ["x"] })] }),
			"npcs.json",
		);
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("npcs.json");
		expect(found[0]).toContain("npcs.0");
		expect(found[0]).toContain("aliasses");
	});

	it("rejects a wrong type", () => {
		const found = problems(
			PackManifestSchema,
			manifest({ npcs: [npc("anna", { aliases: "the one" })] }),
		);
		expect(found.join("\n")).toContain("npcs.0.aliases");
	});

	it("rejects a value outside the allowed list", () => {
		const bad = spell("glow");
		bad.definition.level = "legendary";
		const found = problems(PackManifestSchema, manifest({ spells: [bad] }));
		expect(found.join("\n")).toContain("spells.0.definition.level");
	});

	it("rejects a missing id", () => {
		const { id: _id, ...noId } = npc("anna");
		const found = problems(PackManifestSchema, manifest({ npcs: [noId] }));
		expect(found.join("\n")).toContain("npcs.0.id");
	});

	it("reports every problem, not just the first", () => {
		const found = problems(
			PackManifestSchema,
			manifest({
				npcs: [npc("anna", { aliases: 5 }), { name: "No id" }],
				locations: [{ id: "hall" }],
			}),
		);
		expect(found.length).toBeGreaterThanOrEqual(3);
	});

	it("rejects an unknown top-level key", () => {
		const found = problems(PackManifestSchema, manifest({ monsters: [] }));
		expect(found.join("\n")).toContain("monsters");
	});
});

describe("curriculum schema", () => {
	it("accepts lessons with rewards and spell opportunities", () => {
		const withSpell = lesson("charms", 2, {
			revealOpportunities: [
				{
					spellId: "glow",
					chance: 0.8,
					grants: "learned",
					requirements: [
						{ type: "subjectKnowledge", subjectId: "charms", min: 5 },
						{ type: "attribute", id: "INT", min: 3 },
						{ type: "year", min: 1 },
						{ type: "spellKnown", spellId: "other" },
					],
					source: "lesson",
				},
			],
		});
		expect(
			CurriculumFileSchema.safeParse(
				curriculum("charms", [lesson("charms", 1), withSpell]),
			).success,
		).toBe(true);
	});

	it("rejects a subject the game does not know", () => {
		const found = problems(
			CurriculumFileSchema,
			curriculum("cooking", [lesson("cooking", 1)]),
		);
		expect(found.join("\n")).toContain("subjectType");
	});

	it("rejects a reveal chance outside 0 to 1", () => {
		const tooHigh = lesson("charms", 1, {
			revealOpportunities: [
				{ spellId: "glow", chance: 1.5, requirements: [], source: "lesson" },
			],
		});
		const found = problems(
			CurriculumFileSchema,
			curriculum("charms", [tooHigh]),
		);
		expect(found.join("\n")).toContain("chance");
	});

	it("rejects an unknown grants value and an unknown requirement type", () => {
		const bad = lesson("charms", 1, {
			revealOpportunities: [
				{
					spellId: "glow",
					chance: 1,
					grants: "mastered",
					requirements: [{ type: "weather", min: 1 }],
					source: "lesson",
				},
			],
		});
		const found = problems(CurriculumFileSchema, curriculum("charms", [bad]));
		expect(found.join("\n")).toContain("grants");
		expect(found.join("\n")).toContain("requirements");
	});

	it("rejects a reward for a subject that does not exist", () => {
		const bad = lesson("charms", 1, {
			rewards: { subjectKnowledge: { cooking: 5 } },
		});
		expect(
			CurriculumFileSchema.safeParse(curriculum("charms", [bad])).success,
		).toBe(false);
	});

	it("rejects a lesson number below 1", () => {
		const found = problems(
			CurriculumFileSchema,
			curriculum("charms", [lesson("charms", 0)]),
		);
		expect(found.join("\n")).toContain("order");
	});
});

describe("subjects schema", () => {
	it("accepts definitions keyed by their own type", () => {
		expect(
			SubjectsFileSchema.safeParse(subjects("charms", "potions")).success,
		).toBe(true);
	});

	it("rejects a definition filed under the wrong key", () => {
		const data = { charms: { type: "potions", name: "X", description: "Y" } };
		const found = problems(SubjectsFileSchema, data);
		expect(found.join("\n")).toContain("charms");
	});
});

describe("timetable schema", () => {
	it("accepts class, free and curfew slots", () => {
		const data = timetables(
			classSlot("charms"),
			{ day: "monday", period: "evening", type: "free" },
			{ day: "monday", period: "evening", type: "curfew" },
		);
		expect(TimetablesFileSchema.safeParse(data).success).toBe(true);
	});

	it("rejects a class slot without a subject", () => {
		const found = problems(
			TimetablesFileSchema,
			timetables({ day: "monday", period: "morning", type: "class" }),
		);
		expect(found.join("\n")).toContain("subject");
	});

	it("rejects a class slot without a location", () => {
		const { location: _omitted, ...noLocation } = classSlot("charms");
		const found = problems(TimetablesFileSchema, timetables(noLocation));
		expect(found.join("\n")).toContain("location");
	});

	it("rejects a day or period that does not exist", () => {
		const found = problems(
			TimetablesFileSchema,
			timetables({ day: "funday", period: "noon", type: "free" }),
		);
		expect(found.join("\n")).toContain("day");
		expect(found.join("\n")).toContain("period");
	});
});
