import * as fs from "fs";
import * as path from "path";
import { ContentError } from "./ContentError";
import {
	CurriculumFileSchema,
	SubjectsFile,
	SubjectsFileSchema,
	TimetablesFileSchema,
} from "./ContentSchemas";
import { readContentFile } from "./readContentFile";
import { SchoolData, SubjectCurriculum } from "../domain/quest/Curriculum";

/**
 * Loads subjects, curriculum (`year*.json`) and timetables. All three are
 * required; every problem found is thrown together as a `ContentError`.
 */
export class SchoolDataLoader {
	private basePath: string;

	constructor(basePath: string = path.join(__dirname, "../../content/curriculum")) {
		this.basePath = basePath;
	}

	loadSchoolData(): SchoolData {
		const problems: string[] = [];

		const subjects = readContentFile(
			path.join(this.basePath, "subjects.json"),
			SubjectsFileSchema,
			problems,
		);
		const timetables = readContentFile(
			path.join(this.basePath, "timetables.json"),
			TimetablesFileSchema,
			problems,
		);
		const curriculums = this.loadCurriculums(problems);

		if (problems.length > 0 || !subjects || !timetables) {
			throw new ContentError(problems);
		}

		return {
			subjects: subjects as SubjectsFile,
			curriculums,
			timetables: Object.values(timetables),
		};
	}

	private loadCurriculums(problems: string[]): SubjectCurriculum[] {
		if (!fs.existsSync(this.basePath)) {
			problems.push(`Curriculum directory not found: ${this.basePath}`);
			return [];
		}

		const files = fs
			.readdirSync(this.basePath)
			.filter((file) => file.startsWith("year") && file.endsWith(".json"))
			.sort();
		if (files.length === 0) {
			problems.push(`No curriculum files (year*.json) found in ${this.basePath}`);
		}

		const curriculums: SubjectCurriculum[] = [];
		for (const file of files) {
			const curriculum = readContentFile(
				path.join(this.basePath, file),
				CurriculumFileSchema,
				problems,
			);
			if (curriculum) curriculums.push(curriculum);
		}
		return curriculums;
	}
}
