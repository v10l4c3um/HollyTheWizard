import {
	PlayerAcademicState,
	SubjectType,
	LessonDefinition,
	SchoolData,
	SpellRevealOpportunity
} from "./Curriculum";

export class CurriculumService {
	getCurrentLesson(
		subjectType: SubjectType,
		academicState: PlayerAcademicState,
		schoolData: SchoolData
	): LessonDefinition | undefined {
		const subjectProgress = academicState.subjects[subjectType];
		if (!subjectProgress) {
			return undefined;
		}

		const curriculum = schoolData.curriculums.find(
			(c) => c.subjectType === subjectType && c.year === subjectProgress.year
		);

		if (!curriculum) {
			return undefined;
		}

		return curriculum.lessons.find(
			(lesson) => lesson.order === subjectProgress.currentLessonOrder
		);
	}

	applyLessonRewards(
		lesson: LessonDefinition,
		academicState: PlayerAcademicState
	): void {
		if (lesson.rewards.attributes) {
			for (const attrId of lesson.rewards.attributes) {
				academicState.attributes[attrId] = (academicState.attributes[attrId] || 10) + 1;
			}
		}

		if (lesson.rewards.subjectKnowledge) {
			for (const [subject, amount] of Object.entries(lesson.rewards.subjectKnowledge)) {
				const subjectProgress = academicState.subjects[subject as SubjectType];
				if (subjectProgress) {
					subjectProgress.knowledge += amount;
				}
			}
		}
	}

	addSubjectKnowledge(
		subjectType: SubjectType,
		amount: number,
		academicState: PlayerAcademicState
	): void {
		const subject = academicState.subjects[subjectType];
		if (subject) {
			subject.knowledge += amount;
		}
	}

	advanceLesson(
		subjectType: SubjectType,
		academicState: PlayerAcademicState,
		lessonId: string,
		attended: boolean
	): void {
		const subject = academicState.subjects[subjectType];
		if (subject) {
			if (attended) {
				subject.attendedLessons.push(lessonId);
			} else {
				subject.skippedLessons.push(lessonId);
			}
			subject.currentLessonOrder += 1;
		}
	}

	getLessonSpellOpportunities(
		lesson: LessonDefinition
	): SpellRevealOpportunity[] {
		return lesson.revealOpportunities || [];
	}
}
