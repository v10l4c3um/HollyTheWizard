import Registry from "../../Registry";
import GameState from "../../domain/world/GameState";
import { BlueprintLLMProvider } from "../../../ai/providers/BlueprintLLMProvider";
import { buildYearBlueprintPrompt } from "../../../ai/narration/BlueprintPromptBuilder";
import { YearBlueprintSchema } from "../../domain/campaign/BlueprintSchemas";
import {
	buildYearRecap,
	validateYearBlueprintSemantics,
} from "../../domain/campaign/CampaignBlueprintService";
import { buildSafeYearBlueprint } from "../../domain/campaign/DeterministicFallback";
import { YearBlueprint } from "../../domain/campaign/YearBlueprint";
import { CampaignBlueprintBase } from "../../domain/campaign/CampaignBlueprint";
import { SchoolYear } from "../../domain/quest/Curriculum";
import { GameBus } from "../../domain/events/GameEvents";

/**
 * Generates a YearBlueprint for the given year. Throws if the LLM fails
 * structural or semantic validation, unless `allowFallback` (dev/test only)
 * substitutes a deterministic safe blueprint - see docs/partial-blueprint-yearly-plan.md section 5.2.
 */
export class GenerateYearBlueprint {
	constructor(
		private llmProvider: BlueprintLLMProvider,
		private registry: Registry,
		private bus: GameBus,
		/** Dev/test only: substitute the safe blueprint instead of failing. */
		private allowFallback: boolean = false,
	) {}

	async execute(
		year: SchoolYear,
		campaignBase: CampaignBlueprintBase,
		state: GameState,
	): Promise<YearBlueprint> {
		const recap = buildYearRecap(state);
		const prompt = buildYearBlueprintPrompt(
			campaignBase,
			recap,
			this.registry,
		);
		const generated = await this.llmProvider.generateJson(
			prompt,
			YearBlueprintSchema,
			(value) =>
				validateYearBlueprintSemantics(
					{ ...value, wasFallback: false },
					this.registry,
				).errors,
		);

		if (generated) {
			this.bus.emit("BlueprintGenerated", {
				scope: "year",
				year,
				wasFallback: false,
			});
			return { ...generated, wasFallback: false };
		}

		if (!this.allowFallback) {
			throw new Error(
				`The LLM did not produce a valid blueprint for year ${year}.`,
			);
		}
		const fallback = buildSafeYearBlueprint(year, campaignBase);
		this.bus.emit("BlueprintGenerated", {
			scope: "year",
			year,
			wasFallback: true,
		});
		return fallback;
	}
}
