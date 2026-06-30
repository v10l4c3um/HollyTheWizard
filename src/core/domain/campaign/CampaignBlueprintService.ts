import Registry from "../../Registry";
import GameState from "../world/GameState";
import { YearBlueprint } from "./YearBlueprint";
import { GeneratedCampaignBlueprintBase } from "./BlueprintSchemas";
import { getArcModule } from "./ArcModuleRegistry";

export interface SemanticValidationResult {
	ok: boolean;
	errors: string[];
}

const MAX_MODULES_PER_YEAR = 2;

/**
 * Semantic (cross-reference) validation that Zod structural schemas
 * cannot express: do referenced module/NPC/location ids actually exist?
 * See docs/partial-blueprint-yearly-plan.md section 4.4 (layer B).
 */
export function validateYearBlueprintSemantics(
	blueprint: YearBlueprint,
	registry: Registry,
): SemanticValidationResult {
	const errors: string[] = [];

	if (blueprint.arcModules.length > MAX_MODULES_PER_YEAR) {
		errors.push(
			`Too many arc modules for year ${blueprint.year} (max ${MAX_MODULES_PER_YEAR}).`,
		);
	}

	for (const moduleId of blueprint.arcModules) {
		if (!getArcModule(moduleId)) {
			errors.push(`Unknown arc module id "${moduleId}".`);
		}
	}

	for (const npcId of Object.values(blueprint.moduleRoles)) {
		if (!registry.getNPC(npcId)) {
			errors.push(`Unknown NPC id "${npcId}" referenced in moduleRoles.`);
		}
	}

	for (const clue of blueprint.clueSeeds) {
		if (!registry.getLocation(clue.locationId)) {
			errors.push(
				`Unknown location id "${clue.locationId}" referenced in clueSeeds.`,
			);
		}
		if (!blueprint.arcModules.includes(clue.moduleId)) {
			errors.push(
				`Clue "${clue.clueId}" references module "${clue.moduleId}" which is not present in arcModules.`,
			);
		}
	}

	for (const milestone of blueprint.milestones) {
		if (
			milestone.trigger.type === "questFlag" &&
			milestone.trigger.flag.trim() === ""
		) {
			errors.push(
				`Milestone "${milestone.id}" has an empty questFlag trigger.`,
			);
		}
	}

	return { ok: errors.length === 0, errors };
}

/**
 * Semantic validation for the campaign base - only longLivedRoles
 * reference NPC ids that need to exist; themes/tone are already
 * constrained by the Zod enum schemas.
 */
export function validateCampaignBaseSemantics(
	base: GeneratedCampaignBlueprintBase,
	registry: Registry,
): SemanticValidationResult {
	const errors: string[] = [];

	for (const npcId of Object.values(base.longLivedRoles)) {
		if (!registry.getNPC(npcId)) {
			errors.push(
				`Unknown NPC id "${npcId}" referenced in longLivedRoles.`,
			);
		}
	}

	return { ok: errors.length === 0, errors };
}

export interface YearRecap {
	year: number;
	completedFlags: string[];
	knownNpcIds: string[];
	discoveredLocationIds: string[];
	topSubjects: { subject: string; knowledge: number }[];
}

/**
 * Builds a compact, engine-produced summary of player progress to feed
 * into the YearBlueprint generation prompt - see
 * docs/partial-blueprint-yearly-plan.md section 4.2.
 */
export function buildYearRecap(state: GameState): YearRecap {
	const topSubjects = Object.values(state.academicState.subjects)
		.sort((a, b) => b.knowledge - a.knowledge)
		.slice(0, 5)
		.map((s) => ({ subject: s.subject, knowledge: s.knowledge }));

	return {
		year: state.currentYear,
		completedFlags: state.questFlags.completed.slice(-20),
		knownNpcIds: state.knownNPCIds,
		discoveredLocationIds: state.discoveredLocationIds,
		topSubjects,
	};
}
