import Registry from "../../Registry";
import { BlueprintLLMProvider } from "../../../ai/providers/BlueprintLLMProvider";
import { buildCampaignBasePrompt } from "../../../ai/narration/BlueprintPromptBuilder";
import { CampaignBlueprintBaseSchema } from "../../domain/campaign/BlueprintSchemas";
import { validateCampaignBaseSemantics } from "../../domain/campaign/CampaignBlueprintService";
import { buildSafeCampaignBase } from "../../domain/campaign/DeterministicFallback";
import { CampaignBlueprintBase } from "../../domain/campaign/CampaignBlueprint";
import { GameBus } from "../../domain/events/GameEvents";

/**
 * Generates the once-per-run CampaignBlueprintBase. Falls back to a
 * deterministic safe blueprint if the LLM fails structural or semantic
 * validation - see docs/partial-blueprint-yearly-plan.md section 5.1.
 */
export class GenerateCampaignBlueprint {
	constructor(
		private llmProvider: BlueprintLLMProvider,
		private registry: Registry,
		private bus: GameBus,
	) {}

	async execute(seed: string): Promise<CampaignBlueprintBase> {
		const prompt = buildCampaignBasePrompt(seed);
		const generated = await this.llmProvider.generateJson(
			prompt,
			CampaignBlueprintBaseSchema,
		);

		if (generated) {
			const semantics = validateCampaignBaseSemantics(
				generated,
				this.registry,
			);
			if (semantics.ok) {
				const blueprint: CampaignBlueprintBase = {
					...generated,
					yearPlans: {},
					wasFallback: false,
				};
				this.bus.emit("BlueprintGenerated", {
					scope: "campaign",
					wasFallback: false,
				});
				return blueprint;
			}
			console.debug(
				`[GenerateCampaignBlueprint] Semantic validation failed: ${semantics.errors.join("; ")}`,
			);
		}

		const fallback = buildSafeCampaignBase(seed);
		this.bus.emit("BlueprintGenerated", {
			scope: "campaign",
			wasFallback: true,
		});
		return fallback;
	}
}
