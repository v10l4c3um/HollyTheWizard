import GameState from "../../domain/world/GameState";
import Registry from "../../Registry";
import { GameBus } from "../../domain/events/GameEvents";
import { GameEffect } from "../../domain/effects/GameEffects";
import { Boundary } from "../../domain/world/Boundaries";

export interface TickRuleContext {
	state: GameState;
	registry: Registry;
	bus: GameBus;
	/** The boundary being processed. Decide from this, not from the (already advanced) clock. */
	boundary: Boundary;
}

export interface TickRuleResult {
	/** Applied by `WorldTick` through `applyEffects`. */
	effects?: GameEffect[];
	/** Things worth telling the player about; passed to the narrator. */
	notices?: string[];
}

export type TickRule = (ctx: TickRuleContext) => TickRuleResult | void;
