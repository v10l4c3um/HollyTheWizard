import { z } from "zod";
import Registry from "../../Registry";
import { getAllArcModuleIds } from "./ArcModuleRegistry";
import { questFlagAllowlist } from "./QuestFlags";

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

// ---------------------------------------------------------------------------
// Schemas that carry the ids the game really has
// ---------------------------------------------------------------------------
// The model's reply is constrained to the JSON schema built from these, so it
// cannot name an NPC, place or arc module that does not exist.

const idEnum = (ids: string[]) =>
	ids.length > 0 ? z.enum(ids as [string, ...string[]]) : z.string();

export function campaignBaseSchemaFor(registry: Registry) {
	return CampaignBlueprintBaseSchema.extend({
		longLivedRoles: z.record(z.string(), idEnum(registry.getAllNpcIds())),
	});
}

export function yearBlueprintSchemaFor(registry: Registry) {
	const npcs = idEnum(registry.getAllNpcIds());
	const places = idEnum(registry.getAllLocationIds());
	const modules = idEnum(getAllArcModuleIds());
	// Only flags the game can really set: a milestone on any other flag could never complete.
	const flags = idEnum(questFlagAllowlist(registry));

	return YearBlueprintSchema.extend({
		arcModules: z.array(modules).min(1).max(2),
		moduleRoles: z.record(z.string(), npcs),
		clueSeeds: z
			.array(ClueSeedSchema.extend({ locationId: places, moduleId: modules }))
			.max(10),
		gates: z.array(BlueprintGateSchema.extend({ flag: flags })).max(10),
		milestones: z
			.array(
				BlueprintMilestoneSchema.extend({
					trigger: z.union([
						z.object({ type: z.literal("questFlag"), flag: flags }),
						z.object({ type: z.literal("yearStart") }),
					]),
				}),
			)
			.min(1)
			.max(8),
		climaxOptions: z
			.array(ClimaxOptionSchema.extend({ preconditions: z.array(flags) }))
			.min(1)
			.max(3),
	});
}
