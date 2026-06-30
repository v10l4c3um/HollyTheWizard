import GameState from "../../domain/world/GameState";
import { GenerateYearBlueprint } from "./GenerateYearBlueprint";
import { createEmptyYearProgress } from "../../domain/campaign/YearBlueprint";
import { buildSafeCampaignBase } from "../../domain/campaign/DeterministicFallback";
import { SchoolYear } from "../../domain/quest/Curriculum";
import { GameBus } from "../../domain/events/GameEvents";
import { TurnResult } from "../../engine/TurnResult";

const FINAL_YEAR: SchoolYear = 7;

/**
 * Advances the campaign to the next school year: records a summary of
 * the completed year onto the CampaignBlueprintBase, generates the new
 * YearBlueprint, and resets YearProgress. Bypasses TurnResolver because
 * it requires an async LLM call - see
 * docs/partial-blueprint-yearly-plan.md section 6.
 */
export class AdvanceYear {
	constructor(
		private generateYearBlueprint: GenerateYearBlueprint,
		private bus: GameBus,
	) {}

	async execute(state: GameState): Promise<TurnResult> {
		const fromYear = state.currentYear;

		if (fromYear >= FINAL_YEAR) {
			return {
				briefOutput:
					"You have already completed your final year at school.",
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		const toYear = (fromYear + 1) as SchoolYear;

		if (!state.campaignBlueprint) {
			state.campaignBlueprint = buildSafeCampaignBase(
				`auto-${Date.now()}`,
			);
		}

		const completedBlueprint = state.yearBlueprints[fromYear];
		state.campaignBlueprint.yearPlans[fromYear] = {
			year: fromYear,
			arcModuleIds: completedBlueprint?.arcModules ?? [],
			headline:
				completedBlueprint?.compatibilityNotes[0] ??
				`Year ${fromYear} concluded.`,
			wasFallback: completedBlueprint?.wasFallback ?? true,
		};

		const newBlueprint = await this.generateYearBlueprint.execute(
			toYear,
			state.campaignBlueprint,
			state,
		);

		state.currentYear = toYear;
		state.yearBlueprints[toYear] = newBlueprint;
		state.yearProgress = createEmptyYearProgress(toYear);

		this.bus.emit("YearAdvanced", { fromYear, toYear });

		return {
			briefOutput: `You have advanced to Year ${toYear}. A new chapter begins.`,
			events: [`Advanced from Year ${fromYear} to Year ${toYear}`],
			timeCost: { type: "none" },
			stateChanges: {},
		};
	}
}
