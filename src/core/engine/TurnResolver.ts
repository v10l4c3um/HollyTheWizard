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
	timeAdvanced,
} from "../domain/effects/GameEffects";
import { TurnContext, TurnRule, turnRules } from "./rules";

/** What the rules use besides the bus and the logger; every one has a real default. */
export interface TurnResolverDeps {
	curriculumService?: CurriculumService;
	spellRevealService?: SpellRevealService;
	/** The source of chance for one turn. By default a seeded one resumed from the game state. */
	random?: (state: GameState) => Random;
}

/**
 * Runs one in-world turn: picks the rule for the command, then does the
 * bookkeeping every turn shares (fact log, clock, random state), then
 * announces what the rule asked to have announced. The rules themselves live
 * in `./rules`, one per command.
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

	apply(command: InWorldCommand, state: GameState, registry: Registry): TurnResult {
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

		// Bookkeeping common to every turn: the log, the clock, where chance stands
		// (so a save or an undo replays the same luck).
		const bookkeeping: GameEffect[] = [];
		const logged = result.facts.filter((fact) => fact.kind !== "refused");
		if (logged.length > 0) bookkeeping.push(factsRecorded(logged));
		if (result.timeCost.type === "minutes") {
			bookkeeping.push(timeAdvanced(result.timeCost.amount));
		}
		const beforeTimeOfDay = state.worldClock.timeOfDay;
		if (random.state !== undefined) bookkeeping.push(randomStateSet(random.state));
		ctx.apply(bookkeeping);
		if (result.timeCost.type === "minutes") {
			result.timePassed = {
				minutes: result.timeCost.amount,
				beforeTimeOfDay,
				afterTimeOfDay: state.worldClock.timeOfDay,
			};
		}
		result.effects = [...(result.effects ?? []), ...bookkeeping];

		// Only now, with the turn finished, tell the world what happened.
		for (const { name, payload } of result.emits ?? []) {
			this.bus.emit(name as never, payload as never);
		}

		// Generic "something happened" hook for cross-cutting systems (rumors,
		// suspicion, achievements, ...): the rule says how the action turned out.
		this.bus.emit("ActionResolved", {
			actionType: command.type,
			locationId: state.currentLocationId,
			outcome: result.outcome,
		});

		return result;
	}
}

export default TurnResolver;
