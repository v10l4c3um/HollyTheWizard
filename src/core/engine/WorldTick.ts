import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { GameBus } from "../domain/events/GameEvents";
import { applyEffects } from "../domain/effects/EffectApplier";
import { boundariesBetween } from "../domain/world/Boundaries";
import { TickRule } from "./tick/types";
import { defaultTickRules } from "./tick/rules";

export interface TickReport {
	/** Things that happened while time passed, for the narrator. */
	notices: string[];
	/** A calendar day began during the span. */
	startedNewDay: boolean;
}

/**
 * What happens in the world because time passed. Walks every boundary the
 * clock crossed (a long rest crosses several) and runs the rules at each one.
 * Rule effects go through `applyEffects`, so this adds no second mutation path.
 */
export class WorldTick {
	constructor(private rules: TickRule[] = defaultTickRules) {}

	run(
		state: GameState,
		registry: Registry,
		bus: GameBus,
		fromTotal: number,
		toTotal: number,
	): TickReport {
		const report: TickReport = { notices: [], startedNewDay: false };

		for (const boundary of boundariesBetween(fromTotal, toTotal)) {
			if (boundary.kind === "day") report.startedNewDay = true;

			for (const rule of this.rules) {
				const result = rule({ state, registry, bus, boundary });
				if (!result) continue;
				if (result.effects?.length) applyEffects(state, result.effects, bus);
				report.notices.push(...(result.notices ?? []));
			}
		}

		return report;
	}
}
