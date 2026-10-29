import { TickRule } from "./types";
import { activeClass } from "../../domain/quest/Timetable";
import { SubjectType } from "../../domain/quest/Curriculum";
import { CurriculumService } from "../../domain/quest/CurriculumService";
import { flagSet, sceneInvitationExpired } from "../../domain/effects/GameEffects";

/** Announces each boundary on the bus. */
export const boundaryEvents: TickRule = ({ bus, boundary }) => {
	if (boundary.kind === "day") {
		bus.emit("DayStarted", { day: boundary.day, weekday: boundary.weekday });
		return;
	}
	bus.emit("PeriodChanged", {
		day: boundary.day,
		weekday: boundary.weekday,
		period: boundary.period,
		atMinutes: boundary.atMinutes,
	});
};

const curriculum = new CurriculumService();

/**
 * A class period that ended without being attended is missed. No penalty yet:
 * the lesson is not skipped over and nothing is lost, but it is recorded once
 * (flag), announced on the bus (`LessonSkipped`) and told to the narrator.
 */
export const missedClasses: TickRule = ({ state, registry, bus, boundary }) => {
	if (boundary.kind !== "period" || !boundary.endedPeriod) return;

	const slot = activeClass(
		registry.getTimetable(state.currentYear),
		boundary.weekday,
		boundary.endedPeriod,
	);
	if (!slot?.subject) return;

	const attended = `attended.${slot.subject}.${boundary.day}.${slot.period}`;
	const missed = `missed.${slot.subject}.${boundary.day}.${slot.period}`;
	if (state.flags[attended] || state.flags[missed]) return;

	const schoolData = registry.getSchoolData();
	const subject = slot.subject as SubjectType;
	const lesson = schoolData
		? curriculum.getCurrentLesson(subject, state.academicState, schoolData)
		: undefined;
	if (lesson) {
		bus.emit("LessonSkipped", { subjectId: subject, lessonId: lesson.id });
	}

	const name = schoolData?.subjects[subject]?.name ?? slot.subject;
	return {
		effects: [flagSet(missed, true, `missed ${slot.subject} class`)],
		notices: [`You missed ${name} class.`],
	};
};

/** Invitations are only good until `validUntilMinutes`. */
export const sceneInvitationExpiry: TickRule = ({ state, boundary }) => {
	const expired = state.sceneInvitations.filter(
		(invitation) =>
			invitation.validUntilMinutes !== undefined &&
			invitation.validUntilMinutes <= boundary.atMinutes,
	);
	if (expired.length === 0) return;
	return {
		effects: expired.map((invitation) =>
			sceneInvitationExpired(invitation.invitationId),
		),
	};
};

export const defaultTickRules: TickRule[] = [
	boundaryEvents,
	missedClasses,
	sceneInvitationExpiry,
];
