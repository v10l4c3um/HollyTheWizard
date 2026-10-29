import { lintContent } from "../core/content/ContentLinter";
import ContentLoader from "../core/content/ContentLoader";
import { ContentError } from "../core/content/ContentError";
import Registry from "../core/Registry";
import Location from "../core/domain/world/Location";
import { TOPICS } from "../core/domain/npc/TopicRegistry";
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
	contentDir,
	timetables,
} from "./helpers/contentFixtures";

interface World {
	locations: ReturnType<typeof location>[];
	npcs: ReturnType<typeof npc>[];
	profiles: ReturnType<typeof profile>[];
	spells: ReturnType<typeof spell>[];
	subjects: ReturnType<typeof subjects>;
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

/** Writes a world as packs, one per domain, the way a content directory is laid out. */
function writeWorld(dir: ReturnType<typeof contentDir>, world: World) {
	dir.write("world/world.json", manifest({ locations: world.locations }, { id: "t.world" }));
	dir.write("npcs/npcs.json", manifest({ npcs: world.npcs, profiles: world.profiles }, { id: "t.npcs" }));
	dir.write("spells/spells.json", manifest({ spells: world.spells }, { id: "t.spells" }));
	dir.write("curriculum/subjects.json", manifest({ subjects: world.subjects }, { id: "t.subjects" }));
	dir.write("curriculum/curriculums.json", manifest({ curriculums: world.curriculums }, { id: "t.curriculums" }));
	dir.write("curriculum/timetables.json", manifest({ timetables: world.timetables }, { id: "t.timetables" }));
}

function loaded(world: World) {
	const dir = contentDir();
	try {
		writeWorld(dir, world);
		const registry = new Registry();
		const origins = new ContentLoader(dir.dir).load(registry);
		return { registry, origins };
	} finally {
		dir.remove();
	}
}

function registryOf(world: World): Registry {
	return loaded(world).registry;
}

/** The game's topics, minus the places they are "natural" in (the test worlds have few places). */
const TOPICS_WITHOUT_PLACES: typeof TOPICS = Object.fromEntries(
	Object.entries(TOPICS).map(([id, topic]) => [id, { ...topic, locationRelevance: undefined }]),
);

const lint = (world: World, topics = TOPICS_WITHOUT_PLACES) =>
	lintContent(registryOf(world), { topics });

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

	describe("places named by other content", () => {
		it("rejects a profile modifier for a place that does not exist", () => {
			const world = goodWorld();
			world.profiles[0] = profile("anna", { locationModifiers: { mars: 1, forest: 1 } });
			expect(lint(world)).toEqual(['Profile "anna" has a modifier for unknown location "mars"']);
		});

		it("rejects a topic that is natural in a place that does not exist", () => {
			const topics = {
				...TOPICS_WITHOUT_PLACES,
				daily_chat: { ...TOPICS.daily_chat, locationRelevance: ["forest", "mars"] },
			};
			expect(lint(goodWorld(), topics)).toEqual([
				'Topic "daily_chat" is relevant at unknown location "mars"',
			]);
		});

		it("rejects a spell condition at a place that does not exist", () => {
			const world = goodWorld();
			world.spells = [
				spell("glow", {
					definition: {
						...spell("glow").definition,
						revealCondition: { type: "location", value: "mars" },
					},
				}),
			];
			expect(lint(world)).toEqual(['Spell "glow" has a reveal condition at unknown location "mars"']);
		});
	});

	describe("where the problem is", () => {
		it("prefixes a problem with the file, line and column of the content it is about", () => {
			const world = goodWorld();
			world.locations[1] = location("forest", [START_LOCATION_ID, "mars"]);
			const { registry, origins } = loaded(world);

			const [problem] = lintContent(registry, { origins, topics: TOPICS_WITHOUT_PLACES });

			expect(problem).toMatch(/^world\/world\.json:\d+:\d+: Location "forest" connects to unknown location "mars"$/);
		});

		it("points at the lesson, not just the file", () => {
			const world = goodWorld();
			((world.curriculums[0].lessons[1] as any).revealOpportunities[0]).spellId = "nope";
			const { registry, origins } = loaded(world);

			const [problem] = lintContent(registry, { origins, topics: TOPICS_WITHOUT_PLACES });

			expect(problem).toMatch(/^curriculum\/curriculums\.json:\d+:\d+: Lesson "charms-1-2" reveals unknown spell "nope"$/);
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
		const dir = contentDir();
		try {
			const world = goodWorld();
			world.locations[1] = location("forest", [START_LOCATION_ID, "mars"]);
			world.profiles.push(profile("ghost"));
			writeWorld(dir, world);

			let thrown: unknown;
			try {
				buildRegistry(undefined, { contentDirectory: dir.dir });
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(ContentError);
			const { message } = thrown as ContentError;
			expect(message).toContain('connects to unknown location "mars"');
			expect(message).toContain('Profile for unknown NPC "ghost"');
		} finally {
			dir.remove();
		}
	});
});
