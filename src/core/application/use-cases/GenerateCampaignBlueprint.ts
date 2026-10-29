import Registry from "../../Registry";
import { BlueprintLLMProvider } from "../../../ai/providers/BlueprintLLMProvider";
import { buildCampaignBasePrompt } from "../../../ai/narration/BlueprintPromptBuilder";
import { CampaignBlueprintBaseSchema } from "../../domain/campaign/BlueprintSchemas";
import { validateCampaignBaseSemantics } from "../../domain/campaign/CampaignBlueprintService";
import { buildSafeCampaignBase } from "../../domain/campaign/DeterministicFallback";
import { CampaignBlueprintBase } from "../../domain/campaign/CampaignBlueprint";
import { GameBus } from "../../domain/events/GameEvents";

/**
 * Generates the once-per-run CampaignBlueprintBase. Throws if the LLM fails
 * structural or semantic validation, unless `allowFallback` (dev/test only)
 * substitutes a deterministic safe blueprint - see docs/partial-blueprint-yearly-plan.md section 5.1.
 */
export class GenerateCampaignBlueprint {
	constructor(
		private llmProvider: BlueprintLLMProvider,
		private registry: Registry,
		private bus: GameBus,
		/** Dev/test only: substitute the safe blueprint instead of failing. */
		private allowFallback: boolean = false,
	) {}

	async execute(seed: string): Promise<CampaignBlueprintBase> {
		const prompt = buildCampaignBasePrompt(seed, this.registry);
		const generated = await this.llmProvider.generateJson(
			prompt,
			CampaignBlueprintBaseSchema,
			(value) =>
				validateCampaignBaseSemantics(value, this.registry).errors,
		);

		if (generated) {
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

		if (!this.allowFallback) {
			throw new Error(
				"Startup failed: the LLM did not produce a valid campaign blueprint.",
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
