import { z } from "zod";

/**
 * Zod schemas for structural validation of LLM-generated blueprint JSON.
 * These intentionally validate only the fields requested from the LLM -
 * engine-managed fields (`yearPlans`, `wasFallback`) are added afterwards
 * by the use-cases, not requested from the model.
 */

export const RunThemeSchema = z.enum([
	"mystery",
	"rivalry",
	"rebellion",
	"discovery",
	"corruption",
	"ambition",
]);

export const ToneProfileSchema = z.enum([
	"lighthearted",
	"tense",
	"bittersweet",
	"dark",
	"whimsical",
]);

export const RunTruthsSchema = z.object({
	hasHiddenMentor: z.boolean(),
	worldIsInDecline: z.boolean(),
	playerIsSuspectedOfSomething: z.boolean(),
	ancientThreatIsStirring: z.boolean(),
});

export const CampaignBlueprintBaseSchema = z.object({
	blueprintVersion: z.string(),
	seed: z.string(),
	runThemes: z.array(RunThemeSchema).min(1).max(3),
	toneProfile: ToneProfileSchema,
	runTruths: RunTruthsSchema,
	longLivedRoles: z.record(z.string(), z.string()),
});

export type GeneratedCampaignBlueprintBase = z.infer<
	typeof CampaignBlueprintBaseSchema
>;

export const SchoolYearSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
	z.literal(7),
]);

export const ClueSeedSchema = z.object({
	clueId: z.string(),
	locationId: z.string(),
	moduleId: z.string(),
});

export const BlueprintGateSchema = z.object({
	flag: z.string(),
	description: z.string(),
});

export const MilestoneTriggerSchema = z.union([
	z.object({ type: z.literal("questFlag"), flag: z.string() }),
	z.object({ type: z.literal("yearStart") }),
]);

export const BlueprintMilestoneSchema = z.object({
	id: z.string(),
	description: z.string(),
	trigger: MilestoneTriggerSchema,
});

export const ClimaxOptionSchema = z.object({
	id: z.string(),
	description: z.string(),
	preconditions: z.array(z.string()),
});

export const YearBlueprintSchema = z.object({
	year: SchoolYearSchema,
	arcModules: z.array(z.string()).min(1).max(2),
	moduleRoles: z.record(z.string(), z.string()),
	clueSeeds: z.array(ClueSeedSchema).max(10),
	gates: z.array(BlueprintGateSchema).max(10),
	milestones: z.array(BlueprintMilestoneSchema).min(1).max(8),
	climaxOptions: z.array(ClimaxOptionSchema).min(1).max(3),
	compatibilityNotes: z.array(z.string()).max(5),
});

export type GeneratedYearBlueprint = z.infer<typeof YearBlueprintSchema>;
