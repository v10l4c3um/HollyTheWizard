import { lintContent } from "../core/content/ContentLinter";
import { ContentError } from "../core/content/ContentError";
import {
	CurriculumFileSchema,
	PackManifestSchema,
	SubjectsFileSchema,
	TimetablesFileSchema,
} from "../core/content/ContentSchemas";
import Registry from "../core/Registry";
import Location from "../core/domain/world/Location";
import { START_LOCATION_ID } from "../core/domain/world/GameState";
import { buildRegistry } from "../bootstrap/engineFactory";
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

interface World {
	locations: ReturnType<typeof location>[];
	npcs: ReturnType<typeof npc>[];
	profiles: ReturnType<typeof profile>[];
	spells: ReturnType<typeof spell>[];
	subjects: Record<string, unknown>;
	curriculums: ReturnType<typeof curriculum>[];
	timetables: ReturnType<typeof timetables>;
}

/** A small world that lints clean; each test breaks one thing. */
function goodWorld(): World {
	return {
		locations: [
			location(START_LOCATION_ID, ["forest"]),
			location("forest", [START_LOCATION_ID]),
		],
		npcs: [npc("anna")],
		profiles: [profile("anna")],
		spells: [spell("glow")],
		subjects: subjects("charms"),
		curriculums: [
			curriculum("charms", [
				lesson("charms", 1),
				lesson("charms", 2, {
					revealOpportunities: [
						{ spellId: "glow", chance: 1, grants: "learned", requirements: [], source: "lesson" },
					],
				}),
			]),
		],
		timetables: timetables(classSlot("charms")),
	};
}

function registryOf(world: World): Registry {
	const registry = new Registry();
	const pack = PackManifestSchema.parse(
		manifest({
			locations: world.locations,
			npcs: world.npcs,
			profiles: world.profiles,
			spells: world.spells,
		}),
	);
	for (const l of pack.locations ?? []) {
		registry.registerLocation(
			new Location(l.id, l.displayName, l.description, l.connectedLocationsIds, l.aliases),
		);
	}
	pack.npcs?.forEach((n) => registry.registerNPC(n));
	pack.profiles?.forEach((p) => registry.registerNpcProfile(p));
	pack.spells?.forEach((s) => registry.registerSpell(s));
	registry.registerSchoolData({
		subjects: SubjectsFileSchema.parse(world.subjects) as never,
		curriculums: world.curriculums.map((c) => CurriculumFileSchema.parse(c)),
		timetables: Object.values(TimetablesFileSchema.parse(world.timetables)),
	});
	return registry;
}

const lint = (world: World) => lintContent(registryOf(world));

describe("lintContent", () => {
	it("finds nothing wrong with a consistent world", () => {
		expect(lint(goodWorld())).toEqual([]);
	});

	describe("the map", () => {
		it("needs the start location", () => {
			const world = goodWorld();
			world.locations = [location("forest")];
			expect(lint(world)).toContain(
				`Start location "${START_LOCATION_ID}" does not exist`,
			);
		});

		it("rejects two places answering to the same name", () => {
			const world = goodWorld();
			world.locations[0] = location(START_LOCATION_ID, ["forest"], ["the woods"]);
			world.locations[1] = location("forest", [START_LOCATION_ID], ["The  Woods!"]);
			expect(lint(world)).toEqual([
				`Location "forest" alias "The  Woods!" is also a name of location "${START_LOCATION_ID}"`,
			]);
		});

		it("rejects an alias that is another place's name", () => {
			const world = goodWorld();
			world.locations[0] = location(START_LOCATION_ID, ["forest"], ["forest"]);
			expect(lint(world)).toEqual([
				`Location "forest" id "forest" is also a name of location "${START_LOCATION_ID}"`,
				`Location "forest" name "FOREST" is also a name of location "${START_LOCATION_ID}"`,
			]);
		});

		it("allows a place to repeat its own name as an alias", () => {
			const world = goodWorld();
			world.locations[1] = location("forest", [START_LOCATION_ID], ["FOREST"]);
			expect(lint(world)).toEqual([]);
		});

		it("rejects a connection to a place that does not exist", () => {
			const world = goodWorld();
			world.locations[1] = location("forest", [START_LOCATION_ID, "mars"]);
			expect(lint(world)).toEqual([
				'Location "forest" connects to unknown location "mars"',
			]);
		});

		it("rejects a place the player can never reach", () => {
			const world = goodWorld();
			world.locations.push(location("cellar", [START_LOCATION_ID]));
			expect(lint(world)).toEqual([
				'Location "cellar" cannot be reached from the start location',
			]);
		});

		it("follows connections in one direction only, like movement does", () => {
			const world = goodWorld();
			world.locations.push(location("cave", []));
			world.locations[1] = location("forest", [START_LOCATION_ID, "cave"]);
			expect(lint(world)).toEqual([]);
		});
	});

	describe("people", () => {
		it("rejects a profile for an NPC that does not exist", () => {
			const world = goodWorld();
			world.profiles.push(profile("ghost"));
			expect(lint(world)).toEqual(['Profile for unknown NPC "ghost"']);
		});

		it("rejects an unknown topic in the affinities or the boundaries", () => {
			const world = goodWorld();
			world.profiles[0] = profile("anna", {
				topicAffinities: { gardening: 2 },
				hardBoundaries: ["knitting"],
			});
			expect(lint(world)).toEqual([
				'Profile "anna" uses unknown topic "gardening"',
				'Profile "anna" uses unknown topic "knitting"',
			]);
		});
	});

	describe("schedules", () => {
		it("wants every NPC to have one", () => {
			const world = goodWorld();
			const { schedule: _omitted, ...bare } = npc("anna");
			world.npcs = [bare as never];
			expect(lint(world)).toEqual(['NPC "anna" has no schedule']);
		});

		it("rejects an unknown home or slot location", () => {
			const world = goodWorld();
			world.npcs = [
				npc("anna", {
					schedule: { home: "attic", slots: [{ periods: ["evening"], location: "cellar" }] },
				}),
			];
			expect(lint(world)).toEqual([
				'NPC "anna" is scheduled at unknown location "attic"',
				'NPC "anna" is scheduled at unknown location "cellar"',
			]);
		});

		it("rejects a taught subject that has no definition", () => {
			const world = goodWorld();
			world.npcs = [npc("anna", { schedule: { home: "forest", teaches: ["potions"] } })];
			expect(lint(world)).toEqual(['NPC "anna" teaches subject "potions" that has no definition']);
		});

		it("rejects a class held in a place that does not exist", () => {
			const world = goodWorld();
			world.timetables = timetables(classSlot("charms", "attic"));
			expect(lint(world)).toEqual([
				'Timetable year 1 (monday morning): location "attic" does not exist',
			]);
		});
	});

	describe("lessons", () => {
		it("rejects a subject without a definition (curriculum, rewards, requirements, timetable)", () => {
			const world = goodWorld();
			world.curriculums.push(
				curriculum("potions", [
					lesson("potions", 1, {
						rewards: { subjectKnowledge: { herbology: 3 } },
						revealOpportunities: [
							{
								spellId: "glow",
								chance: 1,
								requirements: [{ type: "subjectKnowledge", subjectId: "alchemy", min: 1 }],
								source: "lesson",
							},
						],
					}),
				]),
			);
			world.timetables = timetables(classSlot("charms"), classSlot("divination"));

			expect(lint(world)).toEqual([
				'Curriculum "potions" year 1: subject "potions" has no definition',
				'Lesson "potions-1-1" rewards subject "herbology" that has no definition',
				'Lesson "potions-1-1" requires subject "alchemy" that has no definition',
				'Timetable year 1 (monday morning): subject "divination" has no definition',
			]);
		});

		it("rejects a reveal of a spell that does not exist", () => {
			const world = goodWorld();
			world.spells = [];
			expect(lint(world)).toEqual(['Lesson "charms-1-2" reveals unknown spell "glow"']);
		});

		it("rejects a requirement on a spell that does not exist", () => {
			const world = goodWorld();
			world.curriculums[0].lessons[1] = lesson("charms", 2, {
				revealOpportunities: [
					{
						spellId: "glow",
						chance: 1,
						grants: "learned",
						requirements: [{ type: "spellKnown", spellId: "nope" }],
						source: "lesson",
					},
				],
			});
			expect(lint(world)).toEqual(['Lesson "charms-1-2" requires unknown spell "nope"']);
		});

		it("rejects a repeated lesson id", () => {
			const world = goodWorld();
			world.curriculums[0].lessons[1] = lesson("charms", 2, { id: "charms-1-1" });
			expect(lint(world)).toContain('Duplicate lesson id "charms-1-1"');
		});

		it("rejects lesson numbers with gaps or repeats", () => {
			const world = goodWorld();
			world.curriculums[0].lessons = [lesson("charms", 1), lesson("charms", 3)];
			expect(lint(world)).toEqual([
				'Lessons of "charms" year 1 are not numbered 1 to n (found 1, 3)',
			]);
		});

		it("rejects a lesson filed in the wrong curriculum", () => {
			const world = goodWorld();
			world.curriculums[0].lessons[0] = lesson("charms", 1, { year: 2 });
			expect(lint(world)).toEqual([
				'Lesson "charms-1-1" does not match its curriculum (charms year 1)',
			]);
		});
	});
});

describe("starting the game with content", () => {
	it("the shipped content lints clean", () => {
		expect(lintContent(buildRegistry())).toEqual([]);
	});

	it("refuses to start on content that fails the checks, listing every problem", () => {
		const packs = tempDir();
		const school = tempDir();
		try {
			const world = goodWorld();
			world.locations[1] = location("forest", [START_LOCATION_ID, "mars"]);
			world.profiles.push(profile("ghost"));
			packs.write(
				"all.json",
				manifest({
					locations: world.locations,
					npcs: world.npcs,
					profiles: world.profiles,
					spells: world.spells,
				}),
			);
			school.write("subjects.json", world.subjects);
			school.write("year1-charms.json", world.curriculums[0]);
			school.write("timetables.json", world.timetables);

			let thrown: unknown;
			try {
				buildRegistry(undefined, {
					packDirectory: packs.dir,
					curriculumDirectory: school.dir,
				});
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(ContentError);
			const { message } = thrown as ContentError;
			expect(message).toContain('connects to unknown location "mars"');
			expect(message).toContain('Profile for unknown NPC "ghost"');
		} finally {
			packs.remove();
			school.remove();
		}
	});
});
