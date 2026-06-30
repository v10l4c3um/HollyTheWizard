import { SchoolYear } from "../quest/Curriculum";

export interface ClueSeed {
	clueId: string;
	locationId: string;
	moduleId: string;
}

export interface BlueprintGate {
	flag: string;
	description: string;
}

export type MilestoneTrigger =
	| { type: "questFlag"; flag: string }
	| { type: "yearStart" };

export interface BlueprintMilestone {
	id: string;
	description: string;
	trigger: MilestoneTrigger;
}

export interface ClimaxOption {
	id: string;
	description: string;
	/** Quest flags that must be active for this climax to be eligible. */
	preconditions: string[];
}

/**
 * Generated at the start of each in-game year. Declarative "season arc"
 * structure - see docs/partial-blueprint-yearly-plan.md section 3.2.
 */
export interface YearBlueprint {
	year: SchoolYear;
	/** ArcModuleDefinition ids - 1-2 for Phase 1. */
	arcModules: string[];
	/** roleName -> npcId */
	moduleRoles: Record<string, string>;
	clueSeeds: ClueSeed[];
	gates: BlueprintGate[];
	milestones: BlueprintMilestone[];
	climaxOptions: ClimaxOption[];
	compatibilityNotes: string[];
	wasFallback: boolean;
}

/**
 * Runtime progress against the current YearBlueprint. Mirrors the
 * declarative-content/runtime-progress split used by SubjectCurriculum /
 * SubjectProgress in src/core/domain/quest/Curriculum.ts.
 */
export interface YearProgress {
	year: SchoolYear;
	completedMilestoneIds: string[];
	moduleStage: Record<string, number>;
	clueFoundIds: string[];
}

export function createEmptyYearProgress(year: SchoolYear): YearProgress {
	return {
		year,
		completedMilestoneIds: [],
		moduleStage: {},
		clueFoundIds: [],
	};
}
