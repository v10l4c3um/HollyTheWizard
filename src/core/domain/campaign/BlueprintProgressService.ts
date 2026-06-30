import GameState from "../world/GameState";
import { GameBus } from "../events/GameEvents";

/**
 * Checks the current year's blueprint milestones against live game state
 * (active quest flags) and marks any newly-satisfied milestones as
 * completed, emitting BlueprintMilestoneReached. Called once per turn
 * from GameEngine.handleCommand - see
 * docs/partial-blueprint-yearly-plan.md section 7.
 */
export class BlueprintProgressService {
	checkMilestones(state: GameState, bus: GameBus): void {
		const blueprint = state.yearBlueprints[state.currentYear];
		if (!blueprint) {
			return;
		}

		for (const milestone of blueprint.milestones) {
			if (
				state.yearProgress.completedMilestoneIds.includes(milestone.id)
			) {
				continue;
			}

			const satisfied =
				milestone.trigger.type === "yearStart" ||
				(milestone.trigger.type === "questFlag" &&
					state.questFlags.active.includes(milestone.trigger.flag));

			if (satisfied) {
				state.yearProgress.completedMilestoneIds.push(milestone.id);
				bus.emit("BlueprintMilestoneReached", {
					year: state.currentYear,
					milestoneId: milestone.id,
					description: milestone.description,
				});
			}
		}
	}
}
