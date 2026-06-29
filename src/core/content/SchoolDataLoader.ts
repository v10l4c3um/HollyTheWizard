import * as fs from "fs";
import * as path from "path";
import {
	SchoolData,
	SubjectDefinition,
	SubjectCurriculum,
	WeeklyTimetable,
	SubjectType
} from "../domain/quest/Curriculum";

export class SchoolDataLoader {
	private basePath: string;

	constructor(basePath: string = path.join(__dirname, "../../content/curriculum")) {
		this.basePath = basePath;
	}

	loadSchoolData(): SchoolData {
		const subjects = this.loadSubjects();
		const curriculums = this.loadCurriculums();
		const timetables = this.loadTimetables();

		return {
			subjects,
			curriculums,
			timetables
		};
	}

	private loadSubjects(): Record<SubjectType, SubjectDefinition> {
		const filePath = path.join(this.basePath, "subjects.json");

		if (!fs.existsSync(filePath)) {
			return {} as Record<SubjectType, SubjectDefinition>;
		}

		const content = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(content);
	}

	private loadCurriculums(): SubjectCurriculum[] {
		const curriculums: SubjectCurriculum[] = [];

		if (!fs.existsSync(this.basePath)) {
			return curriculums;
		}

		const files = fs.readdirSync(this.basePath);
		const curriculumFiles = files.filter(f => f.startsWith("year") && f.endsWith(".json"));

		for (const file of curriculumFiles) {
			const filePath = path.join(this.basePath, file);
			const content = fs.readFileSync(filePath, "utf-8");
			const curriculum = JSON.parse(content) as SubjectCurriculum;
			curriculums.push(curriculum);
		}

		return curriculums;
	}

	private loadTimetables(): WeeklyTimetable[] {
		const filePath = path.join(this.basePath, "timetables.json");

		if (!fs.existsSync(filePath)) {
			return [];
		}

		const content = fs.readFileSync(filePath, "utf-8");
		const data = JSON.parse(content);

		return Object.values(data);
	}
}
