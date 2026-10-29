import { InWorldCommand } from "../domain/commands/CommandDefinitions";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { TurnResult } from "./TurnResult";
import { CurriculumService } from "../domain/quest/CurriculumService";
import { SpellRevealService } from "../domain/magic/SpellRevealService";
import { Logger, silentLogger } from "../application/ports/Logger";
import { GameBus } from "../domain/events/GameEvents";
import { Random, createRandom } from "../domain/random/Random";
import { applyEffects } from "../domain/effects/EffectApplier";
import {
	GameEffect,
	factsRecorded,
	randomStateSet,
} from "../domain/effects/GameEffects";
import { TurnContext, TurnRule, turnRules } from "./rules";
import { advanceTime, announce } from "./turnSteps";

/** What the rules use besides the bus and the logger; every one has a real default. */
export interface TurnResolverDeps {
	curriculumService?: CurriculumService;
	spellRevealService?: SpellRevealService;
	/** The source of chance for one turn. By default a seeded one resumed from the game state. */
	random?: (state: GameState) => Random;
}

/**
 * Decides one in-world turn: picks the rule for the command and does the
 * bookkeeping that belongs to the decision (the fact log, where chance stands).
 * The clock and the announcements are the next stages of the turn pipeline
 * (`turnSteps.ts`). The rules themselves live in `./rules`, one per command.
 */
class TurnResolver {
	private curriculumService: CurriculumService;
	private spellRevealService: SpellRevealService;
	private makeRandom: (state: GameState) => Random;

	constructor(
		private bus: GameBus,
		private logger: Logger = silentLogger,
		deps: TurnResolverDeps = {},
	) {
		this.curriculumService = deps.curriculumService ?? new CurriculumService();
		this.spellRevealService = deps.spellRevealService ?? new SpellRevealService();
		this.makeRandom = deps.random ?? ((state) => createRandom(state.randomState));
	}

	decide(command: InWorldCommand, state: GameState, registry: Registry): TurnResult {
		const random = this.makeRandom(state);
		const ctx: TurnContext = {
			state,
			registry,
			random,
			curriculum: this.curriculumService,
			spellReveal: this.spellRevealService,
			apply: (effects) => applyEffects(state, effects, this.bus, this.logger),
		};
		// The mapped type of `turnRules` guarantees the rule accepts this command.
		const rule = turnRules[command.type] as TurnRule<InWorldCommand>;
		const result = rule(command, ctx);

		// Bookkeeping that is part of the decision: the log, and where chance
		// stands (so a save or an undo replays the same luck).
		const bookkeeping: GameEffect[] = [];
		const logged = result.facts.filter((fact) => fact.kind !== "refused");
		if (logged.length > 0) bookkeeping.push(factsRecorded(logged));
		if (random.state !== undefined) bookkeeping.push(randomStateSet(random.state));
		ctx.apply(bookkeeping);
		result.effects = [...(result.effects ?? []), ...bookkeeping];
		return result;
	}

	/** The whole turn in one call: decide, move the clock, announce. The engine runs these as separate stages. */
	apply(command: InWorldCommand, state: GameState, registry: Registry): TurnResult {
		const result = this.decide(command, state, registry);
		advanceTime(result, state, this.bus, this.logger);
		announce(command, result, state, this.bus);
		return result;
	}
}

export default TurnResolver;
