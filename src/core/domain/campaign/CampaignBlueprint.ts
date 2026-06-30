import { SchoolYear } from "../quest/Curriculum";

export type RunTheme =
	| "mystery"
	| "rivalry"
	| "rebellion"
	| "discovery"
	| "corruption"
	| "ambition";

export type ToneProfile =
	| "lighthearted"
	| "tense"
	| "bittersweet"
	| "dark"
	| "whimsical";

export const RUN_THEME_ALLOWLIST: RunTheme[] = [
	"mystery",
	"rivalry",
	"rebellion",
	"discovery",
	"corruption",
	"ambition",
];

export const TONE_PROFILE_ALLOWLIST: ToneProfile[] = [
	"lighthearted",
	"tense",
	"bittersweet",
	"dark",
	"whimsical",
];

export interface RunTruths {
	hasHiddenMentor: boolean;
	worldIsInDecline: boolean;
	playerIsSuspectedOfSomething: boolean;
	ancientThreatIsStirring: boolean;
}

/**
 * Lightweight, engine-stored summary of a year's plan, kept on the
 * CampaignBlueprintBase so the LLM can be given a compact recap of
 * prior years without needing the full YearBlueprint payload.
 */
export interface YearBlueprintSummary {
	year: SchoolYear;
	arcModuleIds: string[];
	headline: string;
	wasFallback: boolean;
}

/**
 * Created once at New Game. Defines long-lived "truths" and guardrails
 * for the run. Intentionally small and mostly immutable - see
 * docs/partial-blueprint-yearly-plan.md section 3.1.
 */
export interface CampaignBlueprintBase {
	blueprintVersion: string;
	seed: string;
	runThemes: RunTheme[];
	toneProfile: ToneProfile;
	runTruths: RunTruths;
	/** roleName -> npcId, e.g. "mentor" -> "professor_elias" */
	longLivedRoles: Record<string, string>;
	yearPlans: Partial<Record<SchoolYear, YearBlueprintSummary>>;
	wasFallback: boolean;
}
