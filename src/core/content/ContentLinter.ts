import Registry from "../Registry";
import { START_LOCATION_ID } from "../domain/world/GameState";
import { TOPICS } from "../domain/npc/TopicRegistry";
import { SubjectCurriculum } from "../domain/quest/Curriculum";

/**
 * Checks that loaded content agrees with itself: every id that one piece of
 * content points at exists. Returns one line per problem (empty = consistent).
 * Individual files are checked separately, by their schemas.
 */
export function lintContent(registry: Registry): string[] {
	return [
		...lintMap(registry),
		...lintProfiles(registry),
		...lintSchedules(registry),
		...lintSchool(registry),
	];
}

function lintMap(registry: Registry): string[] {
	const problems: string[] = [];
	const ids = registry.getAllLocationIds();

	for (const id of ids) {
		for (const target of registry.getLocation(id)?.connectedLocationsIds ?? []) {
			if (!registry.getLocation(target)) {
				problems.push(`Location "${id}" connects to unknown location "${target}"`);
			}
		}
	}

	if (!registry.getLocation(START_LOCATION_ID)) {
		problems.push(`Start location "${START_LOCATION_ID}" does not exist`);
		return problems;
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
			problems.push(`Location "${id}" cannot be reached from the start location`);
		}
	}
	return problems;
}

function lintProfiles(registry: Registry): string[] {
	const problems: string[] = [];
	for (const npcId of registry.getAllNpcProfileIds()) {
		if (!registry.getNPC(npcId)) {
			problems.push(`Profile for unknown NPC "${npcId}"`);
		}
		const profile = registry.getNpcProfile(npcId);
		const topics = [
			...Object.keys(profile?.topicAffinities ?? {}),
			...(profile?.hardBoundaries ?? []),
		];
		for (const topic of topics) {
			if (!(topic in TOPICS)) {
				problems.push(`Profile "${npcId}" uses unknown topic "${topic}"`);
			}
		}
	}
	return problems;
}

function lintSchedules(registry: Registry): string[] {
	const problems: string[] = [];
	const school = registry.getSchoolData();
	for (const id of registry.getAllNpcIds()) {
		const schedule = registry.getNPC(id)?.schedule;
		if (!schedule) {
			problems.push(`NPC "${id}" has no schedule`);
			continue;
		}
		const places = [schedule.home, ...(schedule.slots ?? []).map((slot) => slot.location)];
		for (const place of places) {
			if (!registry.getLocation(place)) {
				problems.push(`NPC "${id}" is scheduled at unknown location "${place}"`);
			}
		}
		for (const subject of schedule.teaches ?? []) {
			if (school && !(subject in school.subjects)) {
				problems.push(`NPC "${id}" teaches subject "${subject}" that has no definition`);
			}
		}
	}
	return problems;
}

function lintSchool(registry: Registry): string[] {
	const school = registry.getSchoolData();
	if (!school) return [];

	const problems: string[] = [];
	const isDefined = (subject: string) => subject in school.subjects;
	const seenLessonIds = new Set<string>();

	for (const curriculum of school.curriculums) {
		const { subjectType, year } = curriculum;
		if (!isDefined(subjectType)) {
			problems.push(
				`Curriculum "${subjectType}" year ${year}: subject "${subjectType}" has no definition`,
			);
		}

		for (const lesson of curriculum.lessons) {
			if (lesson.subjectType !== subjectType || lesson.year !== year) {
				problems.push(
					`Lesson "${lesson.id}" does not match its curriculum (${subjectType} year ${year})`,
				);
			}
			if (seenLessonIds.has(lesson.id)) {
				problems.push(`Duplicate lesson id "${lesson.id}"`);
			}
			seenLessonIds.add(lesson.id);

			for (const subject of Object.keys(lesson.rewards.subjectKnowledge ?? {})) {
				if (!isDefined(subject)) {
					problems.push(
						`Lesson "${lesson.id}" rewards subject "${subject}" that has no definition`,
					);
				}
			}

			for (const opportunity of lesson.revealOpportunities ?? []) {
				if (!registry.getSpell(opportunity.spellId)) {
					problems.push(
						`Lesson "${lesson.id}" reveals unknown spell "${opportunity.spellId}"`,
					);
				}
				for (const requirement of opportunity.requirements) {
					if (requirement.type === "subjectKnowledge" && !isDefined(requirement.subjectId)) {
						problems.push(
							`Lesson "${lesson.id}" requires subject "${requirement.subjectId}" that has no definition`,
						);
					}
					if (requirement.type === "spellKnown" && !registry.getSpell(requirement.spellId)) {
						problems.push(
							`Lesson "${lesson.id}" requires unknown spell "${requirement.spellId}"`,
						);
					}
				}
			}
		}

		problems.push(...lintNumbering(curriculum));
	}

	for (const timetable of school.timetables) {
		for (const slot of timetable.slots) {
			const when = `Timetable year ${timetable.year} (${slot.day} ${slot.period})`;
			if (slot.subject && !isDefined(slot.subject)) {
				problems.push(`${when}: subject "${slot.subject}" has no definition`);
			}
			if (slot.location && !registry.getLocation(slot.location)) {
				problems.push(`${when}: location "${slot.location}" does not exist`);
			}
		}
	}
	return problems;
}

function lintNumbering(curriculum: SubjectCurriculum): string[] {
	const orders = curriculum.lessons.map((lesson) => lesson.order).sort((a, b) => a - b);
	const expected = orders.map((_, index) => index + 1);
	if (orders.every((order, index) => order === expected[index])) return [];
	return [
		`Lessons of "${curriculum.subjectType}" year ${curriculum.year} are not numbered 1 to n (found ${orders.join(", ")})`,
	];
}
