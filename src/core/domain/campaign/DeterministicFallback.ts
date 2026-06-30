import { CampaignBlueprintBase } from "./CampaignBlueprint";
import { YearBlueprint } from "./YearBlueprint";
import { SchoolYear } from "../quest/Curriculum";
import { ARC_MODULES } from "./ArcModuleRegistry";

/**
 * Deterministic, no-LLM-call builders used when LLM generation and the
 * single repair pass both fail validation. Mirrors the
 * FallbackNarrationProvider pattern in src/bootstrap.ts - the game must
 * never brick because of a bad LLM response.
 */

export function buildSafeCampaignBase(seed: string): CampaignBlueprintBase {
	return {
		blueprintVersion: "1.0.0",
		seed,
		runThemes: ["discovery"],
		toneProfile: "lighthearted",
		runTruths: {
			hasHiddenMentor: false,
			worldIsInDecline: false,
			playerIsSuspectedOfSomething: false,
			ancientThreatIsStirring: false,
		},
		longLivedRoles: {},
		yearPlans: {},
		wasFallback: true,
	};
}

export function buildSafeYearBlueprint(
	year: SchoolYear,
	campaignBase: CampaignBlueprintBase,
): YearBlueprint {
	const module = ARC_MODULES[0];

	return {
		year,
		arcModules: [module.id],
		moduleRoles: {},
		clueSeeds: [],
		gates: [],
		milestones: [
			{
				id: `${module.id}_y${year}_intro`,
				description:
					module.revealLadder[0]?.description ?? "The arc begins.",
				trigger: { type: "yearStart" },
			},
		],
		climaxOptions: module.climaxShapes.map((c) => ({
			id: c.id,
			description: c.description,
			preconditions: [],
		})),
		compatibilityNotes: [],
		wasFallback: true,
	};
}
