import Registry from "../Registry";
import { ContentOrigins } from "./ContentOrigins";
import { START_LOCATION_ID } from "../domain/world/GameState";
import { TOPICS, TopicDefinition } from "../domain/npc/TopicRegistry";
import { normalizeName } from "../engine/EntityMatcher";
import { SubjectCurriculum } from "../domain/quest/Curriculum";

/**
 * Collects problems. A problem can say which piece of content it is about
 * (`kind` and `id`, as the loader recorded them); when origins are known the
 * line is prefixed with `file:line:col` of that piece.
 */
class Report {
	readonly problems: string[] = [];

	constructor(private origins?: ContentOrigins) {}

	add(about: [kind: string, id: string] | undefined, message: string): void {
		const where = about ? this.origins?.where(about[0], about[1]) : undefined;
		this.problems.push(where ? `${where}: ${message}` : message);
	}
}

/**
 * Checks that loaded content agrees with itself: every id that one piece of
 * content points at exists, and what the blueprint may refer to is real.
 * Returns one line per problem (empty = consistent); with the `origins` the
 * loader recorded, each says where in which file. Individual files are
 * checked separately, by their schemas.
 */
export interface LintOptions {
	/** Where each piece of content was written, to prefix problems with `file:line:col`. */
	origins?: ContentOrigins;
	/** The conversation topics to check against; the game's own by default. */
	topics?: Record<string, TopicDefinition>;
}

export function lintContent(registry: Registry, options: LintOptions = {}): string[] {
	const report = new Report(options.origins);
	const topics = options.topics ?? TOPICS;
	lintMap(registry, report);
	lintProfiles(registry, report, topics);
	lintTopics(registry, report, topics);
	lintSpells(registry, report);
	lintSchedules(registry, report);
	lintSchool(registry, report);
	return report.problems;
}

function lintMap(registry: Registry, report: Report): void {
	const ids = registry.getAllLocationIds();

	for (const id of ids) {
		for (const target of registry.getLocation(id)?.connectedLocationsIds ?? []) {
			if (!registry.getLocation(target)) {
				report.add(["locations", id], `Location "${id}" connects to unknown location "${target}"`);
			}
		}
	}

	lintPlaceNames(registry, report);

	if (!registry.getLocation(START_LOCATION_ID)) {
		report.add(undefined, `Start location "${START_LOCATION_ID}" does not exist`);
		return;
	}

	// Movement follows connections one way, so reachability does too.
	const reached = new Set([START_LOCATION_ID]);
	const queue = [START_LOCATION_ID];
	while (queue.length > 0) {
		const current = queue.shift() as string;
		for (const next of registry.getLocation(current)?.connectedLocationsIds ?? []) {
			if (registry.getLocation(next) && !reached.has(next)) {
				reached.add(next);
				queue.push(next);
			}
		}
	}
	for (const id of ids) {
		if (!reached.has(id)) {
			report.add(["locations", id], `Location "${id}" cannot be reached from the start location`);
		}
	}
}

/** Two places must never answer to the same name, or "go to the hut" is ambiguous. */
function lintPlaceNames(registry: Registry, report: Report): void {
	const owner = new Map<string, string>();

	const claim = (placeId: string, name: string, kind: string) => {
		const key = normalizeName(name);
		if (key === "") return;
		const existing = owner.get(key);
		if (existing !== undefined && existing !== placeId) {
			report.add(
				["locations", placeId],
				`Location "${placeId}" ${kind} "${name}" is also a name of location "${existing}"`,
			);
		} else {
			owner.set(key, placeId);
		}
	};

	for (const id of registry.getAllLocationIds()) {
		const place = registry.getLocation(id);
		if (!place) continue;
		claim(id, id, "id");
		claim(id, place.displayName, "name");
		for (const alias of place.aliases) claim(id, alias, "alias");
	}
}

function lintProfiles(registry: Registry, report: Report, topics: Record<string, TopicDefinition>): void {
	for (const npcId of registry.getAllNpcProfileIds()) {
		if (!registry.getNPC(npcId)) {
			report.add(["profiles", npcId], `Profile for unknown NPC "${npcId}"`);
		}
		const profile = registry.getNpcProfile(npcId);
		const used = [
			...Object.keys(profile?.topicAffinities ?? {}),
			...(profile?.hardBoundaries ?? []),
		];
		for (const topic of used) {
			if (!(topic in topics)) {
				report.add(["profiles", npcId], `Profile "${npcId}" uses unknown topic "${topic}"`);
			}
		}
		for (const place of Object.keys(profile?.locationModifiers ?? {})) {
			if (!registry.getLocation(place)) {
				report.add(["profiles", npcId], `Profile "${npcId}" has a modifier for unknown location "${place}"`);
			}
		}
	}
}

/** The places a topic is "natural" in must exist, or its bonus can never apply. */
function lintTopics(registry: Registry, report: Report, topics: Record<string, TopicDefinition>): void {
	for (const [id, topic] of Object.entries(topics)) {
		for (const place of topic.locationRelevance ?? []) {
			if (!registry.getLocation(place)) {
				report.add(undefined, `Topic "${id}" is relevant at unknown location "${place}"`);
			}
		}
	}
}

/** A spell's conditions may name a place; it must exist. */
function lintSpells(registry: Registry, report: Report): void {
	for (const id of registry.getAllSpellIds()) {
		const definition = registry.getSpell(id)?.definition;
		for (const [which, condition] of [
			["reveal", definition?.revealCondition],
			["cast", definition?.castCondition],
		] as const) {
			if (condition?.type === "location" && !registry.getLocation(String(condition.value))) {
				report.add(
					["spells", id],
					`Spell "${id}" has a ${which} condition at unknown location "${condition.value}"`,
				);
			}
		}
	}
}

function lintSchedules(registry: Registry, report: Report): void {
	const school = registry.getSchoolData();
	for (const id of registry.getAllNpcIds()) {
		const schedule = registry.getNPC(id)?.schedule;
		if (!schedule) {
			report.add(["npcs", id], `NPC "${id}" has no schedule`);
			continue;
		}
		const places = [schedule.home, ...(schedule.slots ?? []).map((slot) => slot.location)];
		for (const place of places) {
			if (!registry.getLocation(place)) {
				report.add(["npcs", id], `NPC "${id}" is scheduled at unknown location "${place}"`);
			}
		}
		for (const subject of schedule.teaches ?? []) {
			if (school && !(subject in school.subjects)) {
				report.add(["npcs", id], `NPC "${id}" teaches subject "${subject}" that has no definition`);
			}
		}
	}
}

function lintSchool(registry: Registry, report: Report): void {
	const school = registry.getSchoolData();
	if (!school) return;

	const isDefined = (subject: string) => subject in school.subjects;
	const seenLessonIds = new Set<string>();

	for (const curriculum of school.curriculums) {
		const { subjectType, year } = curriculum;
		const curriculumId = `${subjectType} year ${year}`;
		if (!isDefined(subjectType)) {
			report.add(
				["curriculums", curriculumId],
				`Curriculum "${subjectType}" year ${year}: subject "${subjectType}" has no definition`,
			);
		}

		for (const lesson of curriculum.lessons) {
			const about: [string, string] = ["lessons", lesson.id];
			if (lesson.subjectType !== subjectType || lesson.year !== year) {
				report.add(about, `Lesson "${lesson.id}" does not match its curriculum (${subjectType} year ${year})`);
			}
			if (seenLessonIds.has(lesson.id)) {
				report.add(about, `Duplicate lesson id "${lesson.id}"`);
			}
			seenLessonIds.add(lesson.id);

			for (const subject of Object.keys(lesson.rewards.subjectKnowledge ?? {})) {
				if (!isDefined(subject)) {
					report.add(about, `Lesson "${lesson.id}" rewards subject "${subject}" that has no definition`);
				}
			}

			for (const opportunity of lesson.revealOpportunities ?? []) {
				if (!registry.getSpell(opportunity.spellId)) {
					report.add(about, `Lesson "${lesson.id}" reveals unknown spell "${opportunity.spellId}"`);
				}
				for (const requirement of opportunity.requirements) {
					if (requirement.type === "subjectKnowledge" && !isDefined(requirement.subjectId)) {
						report.add(
							about,
							`Lesson "${lesson.id}" requires subject "${requirement.subjectId}" that has no definition`,
						);
					}
					if (requirement.type === "spellKnown" && !registry.getSpell(requirement.spellId)) {
						report.add(about, `Lesson "${lesson.id}" requires unknown spell "${requirement.spellId}"`);
					}
				}
			}
		}

		lintNumbering(curriculum, report);
	}

	for (const timetable of school.timetables) {
		timetable.slots.forEach((slot) => {
			const when = `Timetable year ${timetable.year} (${slot.day} ${slot.period})`;
			const about: [string, string] = ["timetables", `year ${timetable.year}`];
			if (slot.subject && !isDefined(slot.subject)) {
				report.add(about, `${when}: subject "${slot.subject}" has no definition`);
			}
			if (slot.location && !registry.getLocation(slot.location)) {
				report.add(about, `${when}: location "${slot.location}" does not exist`);
			}
		});
	}
}

function lintNumbering(curriculum: SubjectCurriculum, report: Report): void {
	const orders = curriculum.lessons.map((lesson) => lesson.order).sort((a, b) => a - b);
	const expected = orders.map((_, index) => index + 1);
	if (orders.every((order, index) => order === expected[index])) return;
	report.add(
		["curriculums", `${curriculum.subjectType} year ${curriculum.year}`],
		`Lessons of "${curriculum.subjectType}" year ${curriculum.year} are not numbered 1 to n (found ${orders.join(", ")})`,
	);
}
