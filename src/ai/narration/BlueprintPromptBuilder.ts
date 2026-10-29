import { questFlagAllowlist } from "../../core/domain/campaign/QuestFlags";
import Registry from "../../core/Registry";
import { CampaignBlueprintBase } from "../../core/domain/campaign/CampaignBlueprint";
import { YearRecap } from "../../core/domain/campaign/CampaignBlueprintService";
import { getAllArcModuleIds } from "../../core/domain/campaign/ArcModuleRegistry";

/**
 * Prompt templates for blueprint generation. Kept separate from
 * Resolver.ts/Renderer.ts's inline prompt strings since these prompts
 * are structurally different (JSON-only, allowlist-constrained) and
 * reused by two different use-cases.
 */

export function buildCampaignBasePrompt(
	seed: string,
	registry: Registry,
): string {
	const npcIds = registry.getAllNpcIds();
	return `You are designing the long-term narrative premise for a multi-year wizard-school RPG playthrough (seed: ${seed}).

Respond with ONLY a JSON object matching this shape:
{
  "blueprintVersion": string,
  "seed": string,
  "runThemes": array of 1-3 strings from ["mystery","rivalry","rebellion","discovery","corruption","ambition"],
  "toneProfile": one of ["lighthearted","tense","bittersweet","dark","whimsical"],
  "runTruths": { "hasHiddenMentor": boolean, "worldIsInDecline": boolean, "playerIsSuspectedOfSomething": boolean, "ancientThreatIsStirring": boolean },
  "longLivedRoles": object mapping role names (e.g. "mentor", "rival") to NPC ids; every id MUST be one of ${JSON.stringify(npcIds)}, or use {}
}

Do not invent NPC ids. Output JSON only, no commentary, no markdown code fences.`;
}

export function buildYearBlueprintPrompt(
	campaignBase: CampaignBlueprintBase,
	recap: YearRecap,
	registry: Registry,
): string {
	const moduleIds = getAllArcModuleIds();
	const npcIds = registry.getAllNpcIds();
	const locationIds = registry.getAllLocationIds();
	const flags = questFlagAllowlist(registry);

	return `You are designing the story arc for Year ${recap.year} of a multi-year wizard-school RPG.

Campaign premise:
- Themes: ${campaignBase.runThemes.join(", ")}
- Tone: ${campaignBase.toneProfile}
- Run truths: ${JSON.stringify(campaignBase.runTruths)}

Recap of player progress so far:
${JSON.stringify(recap)}

You MUST only use these allowed ids - do not invent new ones:
- Arc module ids: ${JSON.stringify(moduleIds)}
- NPC ids: ${JSON.stringify(npcIds)}
- Location ids: ${JSON.stringify(locationIds)}
- Quest flags (the only flags the game ever sets; every milestone flag, gate flag and climax precondition MUST be one of these): ${JSON.stringify(flags)}

Respond with ONLY a JSON object matching this shape:
{
  "year": ${recap.year},
  "arcModules": array of 1-2 module ids from the allowed list,
  "moduleRoles": object mapping role names (e.g. "instigator", "ally") to NPC ids from the allowed list,
  "clueSeeds": array of { "clueId": string, "locationId": one of the allowed location ids, "moduleId": one of the chosen arcModules },
  "gates": array of { "flag": one of the allowed quest flags, "description": string },
  "milestones": array of 1-8 { "id": string, "description": string, "trigger": { "type": "yearStart" } or { "type": "questFlag", "flag": one of the allowed quest flags } },
  "climaxOptions": array of 1-3 { "id": string, "description": string, "preconditions": array of allowed quest flags (can be empty) },
  "compatibilityNotes": array of short strings noting how this year avoids repeating last year's main module
}

Output JSON only, no commentary, no markdown code fences.`;
}
