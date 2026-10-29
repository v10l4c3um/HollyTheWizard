import GameState from "../../domain/world/GameState";
import Registry from "../../Registry";
import { GameEffect } from "../../domain/effects/GameEffects";
import { Random } from "../../domain/random/Random";
import { CurriculumService } from "../../domain/quest/CurriculumService";
import { SpellRevealService } from "../../domain/magic/SpellRevealService";

/**
 * What a rule gets to work with. There is deliberately no bus: a rule changes
 * the game through effects and says which events it wants announced in its
 * result; `TurnResolver` emits them once the turn is finished.
 */
export interface TurnContext {
	state: GameState;
	registry: Registry;
	/** The turn's source of chance. */
	random: Random;
	curriculum: CurriculumService;
	spellReveal: SpellRevealService;
	/** Applies effects to the state now, for rules whose next step depends on them. */
	apply(effects: GameEffect[]): void;
}
