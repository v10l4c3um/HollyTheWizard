import * as fs from "fs";
import * as path from "path";
import Registry from "../Registry";
import Location, { LocationData } from "../domain/world/Location";
import NPC, { NpcData } from "../domain/npc/Npc";
import { NpcConversationProfile } from "../domain/npc/NpcProfile";
import { Spell } from "../domain/magic/Spell";
import { SubjectType } from "../domain/quest/Curriculum";
import { SubjectCurriculum, SubjectDefinition, WeeklyTimetable } from "../domain/quest/CurriculumContent";
import { ContentError } from "./ContentError";
import { ContentOrigins } from "./ContentOrigins";
import {
	CONTENT_DOMAINS,
	CONTENT_TYPES,
	ContentDomain,
	ContentType,
	PackManifest,
	PackManifestSchema,
} from "./ContentSchemas";
import { Locate, readContentFileLocated } from "./readContentFile";
import { satisfies } from "./versions";

export interface ContentPackLoadProgress {
	processedPacks: number;
	totalPacks: number;
	currentPackName?: string;
}

interface LoadedPack {
	manifest: PackManifest;
	/** Relative to the content root, e.g. "npcs/npcs.json". */
	file: string;
	domain: ContentDomain;
	locate: Locate;
}

interface Staged {
	entry: unknown;
	file: string;
	line: number;
	col: number;
}

/** The id an entry of each type goes by; two entries with the same id are the same thing. */
const ID_OF: Record<ContentType, (entry: any) => string> = {
	locations: (e) => e.id,
	npcs: (e) => e.id,
	profiles: (e) => e.npcId,
	spells: (e) => e.definition.id,
	subjects: (e) => e.type,
	curriculums: (e: SubjectCurriculum) => `${e.subjectType} year ${e.year}`,
	timetables: (e: WeeklyTimetable) => `year ${e.year}`,
};

const KIND_NAME: Record<ContentType, string> = {
	locations: "location",
	npcs: "NPC",
	profiles: "NPC profile",
	spells: "spell",
	subjects: "subject",
	curriculums: "curriculum",
	timetables: "timetable",
};

/**
 * Loads the content packs under a content directory into the registry.
 *
 * Content lives in one folder per domain (`world/`, `npcs/`, `spells/`,
 * `curriculum/`); every `*.json` in them is a pack (manifest format 2: id,
 * version, `requires`, one array per kind of content, explicit `overrides`).
 * Packs load in dependency order. An id that is already defined is an error
 * unless the later pack lists it under `overrides`. Every file is validated;
 * all problems are gathered and thrown together as one `ContentError`, each
 * with the file, line and column where it is.
 */
class ContentLoader {
	constructor(private root: string = path.join(__dirname, "../../content")) {}

	private lessonOrigins: ContentOrigins = new ContentOrigins();

	/** Loads everything into `registry` and returns where each piece came from. */
	load(
		registry: Registry,
		onProgress?: (progress: ContentPackLoadProgress) => void,
	): ContentOrigins {
		this.lessonOrigins = new ContentOrigins();
		const problems: string[] = [];
		const packs = this.readPacks(problems);
		const ordered = this.order(packs, problems);
		if (problems.length > 0) throw new ContentError(problems);

		const staging = new Map<ContentType, Map<string, Staged>>(
			CONTENT_TYPES.map((type) => [type, new Map()]),
		);
		let processed = 0;
		for (const pack of ordered) {
			this.stage(pack, staging, problems);
			processed++;
			onProgress?.({
				processedPacks: processed,
				totalPacks: ordered.length,
				currentPackName: pack.manifest.id,
			});
		}
		this.requireSchoolData(staging, problems);
		if (problems.length > 0) throw new ContentError(problems);

		return this.register(registry, staging);
	}

	// -- reading -------------------------------------------------------------

	private readPacks(problems: string[]): LoadedPack[] {
		if (!fs.existsSync(this.root)) {
			problems.push(`Content directory not found: ${this.root}`);
			return [];
		}

		const packs: LoadedPack[] = [];
		for (const domain of Object.keys(CONTENT_DOMAINS) as ContentDomain[]) {
			const dir = path.join(this.root, domain);
			if (!fs.existsSync(dir)) {
				problems.push(`Content folder not found: ${domain}/ (in ${this.root})`);
				continue;
			}
			const files = fs
				.readdirSync(dir)
				.filter((file) => file.endsWith(".json"))
				.sort();
			for (const name of files) {
				const loaded = readContentFileLocated(
					path.join(dir, name),
					PackManifestSchema,
					problems,
					this.root,
				);
				if (!loaded) continue;
				const pack: LoadedPack = {
					manifest: loaded.data,
					file: loaded.label,
					domain,
					locate: loaded.locate,
				};
				this.checkDomain(pack, problems);
				packs.push(pack);
			}
		}
		if (packs.length === 0 && problems.length === 0) {
			problems.push(`No content packs (*.json) found in ${this.root}`);
		}
		return packs;
	}

	private at(pack: LoadedPack, segments: (string | number)[]): string {
		const position = pack.locate(segments);
		return position ? `${pack.file}:${position.line}:${position.col}` : pack.file;
	}

	/** A pack may only hold the kinds of content its folder is for. */
	private checkDomain(pack: LoadedPack, problems: string[]): void {
		const allowed: readonly string[] = CONTENT_DOMAINS[pack.domain];
		for (const type of CONTENT_TYPES) {
			const holdsIt = pack.manifest[type] !== undefined;
			if (holdsIt && !allowed.includes(type)) {
				problems.push(
					`${this.at(pack, [type])}: ${type}: a pack in ${pack.domain}/ can only hold ${allowed.join(", ")}`,
				);
			}
		}
	}

	// -- ordering ------------------------------------------------------------

	/** Dependencies first (ties by pack id); reports missing packs, old versions and cycles. */
	private order(packs: LoadedPack[], problems: string[]): LoadedPack[] {
		const byId = new Map<string, LoadedPack>();
		for (const pack of packs) {
			const existing = byId.get(pack.manifest.id);
			if (existing) {
				problems.push(
					`${this.at(pack, ["id"])}: id: pack id "${pack.manifest.id}" is already used by ${existing.file}`,
				);
			} else {
				byId.set(pack.manifest.id, pack);
			}
		}

		for (const pack of packs) {
			pack.manifest.requires.forEach((need, index) => {
				const found = byId.get(need.id);
				if (!found) {
					problems.push(
						`${this.at(pack, ["requires", index])}: requires.${index}: pack "${need.id}" is not present`,
					);
				} else if (need.version && !satisfies(found.manifest.version, need.version)) {
					problems.push(
						`${this.at(pack, ["requires", index])}: requires.${index}: pack "${need.id}" is version ${found.manifest.version}, but ${need.version} (same major) is needed`,
					);
				}
			});
		}

		const sorted: LoadedPack[] = [];
		const state = new Map<string, "visiting" | "done">();
		const visit = (pack: LoadedPack, trail: string[]): void => {
			const mark = state.get(pack.manifest.id);
			if (mark === "done") return;
			if (mark === "visiting") {
				problems.push(
					`${this.at(pack, ["requires"])}: requires: dependency cycle ${[...trail.slice(trail.indexOf(pack.manifest.id)), pack.manifest.id].join(" -> ")}`,
				);
				return;
			}
			state.set(pack.manifest.id, "visiting");
			const needs = pack.manifest.requires
				.map((need) => byId.get(need.id))
				.filter((found): found is LoadedPack => found !== undefined)
				.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
			for (const need of needs) visit(need, [...trail, pack.manifest.id]);
			state.set(pack.manifest.id, "done");
			sorted.push(pack);
		};
		for (const pack of [...byId.values()].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))) {
			visit(pack, []);
		}
		return sorted;
	}

	// -- merging -------------------------------------------------------------

	private stage(
		pack: LoadedPack,
		staging: Map<ContentType, Map<string, Staged>>,
		problems: string[],
	): void {
		for (const type of CONTENT_TYPES) {
			const entries = (pack.manifest[type] ?? []) as unknown[];
			const overrides = pack.manifest.overrides[type] ?? [];
			const replaced = new Set<string>();
			const bucket = staging.get(type) as Map<string, Staged>;

			entries.forEach((entry, index) => {
				const id = ID_OF[type](entry);
				if (type === "curriculums") this.recordLessons(pack, entry as SubjectCurriculum, index);
				const position = pack.locate([type, index]) ?? { line: 1, col: 1 };
				const existing = bucket.get(id);
				if (existing && !overrides.includes(id)) {
					problems.push(
						`${this.at(pack, [type, index])}: ${type}.${index}: ${KIND_NAME[type]} "${id}" is already defined in ${existing.file}:${existing.line}:${existing.col}; list it under overrides.${type} to replace it`,
					);
					return;
				}
				if (existing) replaced.add(id);
				bucket.set(id, { entry, file: pack.file, ...position });
			});

			overrides.forEach((id, index) => {
				if (!replaced.has(id)) {
					problems.push(
						`${this.at(pack, ["overrides", type, index])}: overrides.${type}.${index}: ${KIND_NAME[type]} "${id}" overrides nothing`,
					);
				}
			});
		}
	}

	/** Lessons are not registry entries, but problems about them should point at them. */
	private recordLessons(pack: LoadedPack, curriculum: SubjectCurriculum, index: number): void {
		curriculum.lessons.forEach((lesson, j) => {
			const position = pack.locate(["curriculums", index, "lessons", j]);
			if (position) {
				this.lessonOrigins.set("lessons", lesson.id, { file: pack.file, ...position });
			}
		});
	}

	private requireSchoolData(
		staging: Map<ContentType, Map<string, Staged>>,
		problems: string[],
	): void {
		for (const type of ["subjects", "curriculums", "timetables"] as const) {
			if ((staging.get(type) as Map<string, Staged>).size === 0) {
				problems.push(`No ${type} found in ${this.root}${path.sep}curriculum`);
			}
		}
	}

	// -- registering ---------------------------------------------------------

	private register(
		registry: Registry,
		staging: Map<ContentType, Map<string, Staged>>,
	): ContentOrigins {
		const origins = this.lessonOrigins;
		const take = <T>(type: ContentType): T[] => {
			const result: T[] = [];
			for (const [id, staged] of staging.get(type) as Map<string, Staged>) {
				origins.set(type, id, { file: staged.file, line: staged.line, col: staged.col });
				result.push(staged.entry as T);
			}
			return result;
		};

		for (const l of take<LocationData>("locations")) {
			registry.registerLocation(
				new Location(l.id, l.displayName, l.description, l.connectedLocationsIds, l.aliases, l.private),
			);
		}
		for (const data of take<NpcData>("npcs")) {
			const npc = new NPC(data.id, data.name, data.dialogue, data.tag_description, data.aliases);
			npc.schedule = data.schedule;
			registry.registerNPC(npc);
		}
		for (const profile of take<NpcConversationProfile>("profiles")) registry.registerNpcProfile(profile);
		for (const spell of take<Spell>("spells")) registry.registerSpell(spell);

		const subjects = Object.fromEntries(
			take<SubjectDefinition>("subjects").map((subject) => [subject.type, subject]),
		) as Record<SubjectType, SubjectDefinition>;
		registry.registerSchoolData({
			subjects,
			curriculums: take<SubjectCurriculum>("curriculums"),
			timetables: take<WeeklyTimetable>("timetables"),
		});
		return origins;
	}
}

export default ContentLoader;
