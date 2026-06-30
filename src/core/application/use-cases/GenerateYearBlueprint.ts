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
 * Generates a YearBlueprint for the given year. Falls back to a
 * deterministic safe blueprint if the LLM fails structural or semantic
 * validation - see docs/partial-blueprint-yearly-plan.md section 5.2.
 */
export class GenerateYearBlueprint {
	constructor(
		private llmProvider: BlueprintLLMProvider,
		private registry: Registry,
		private bus: GameBus,
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
		);

		if (generated) {
			const candidate: YearBlueprint = {
				...generated,
				wasFallback: false,
			};
			const semantics = validateYearBlueprintSemantics(
				candidate,
				this.registry,
			);
			if (semantics.ok) {
				this.bus.emit("BlueprintGenerated", {
					scope: "year",
					year,
					wasFallback: false,
				});
				return candidate;
			}
			console.debug(
				`[GenerateYearBlueprint] Semantic validation failed: ${semantics.errors.join("; ")}`,
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
