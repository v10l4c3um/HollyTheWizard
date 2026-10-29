import Registry from "../../Registry";
import { Logger } from "../../application/ports/Logger";
import { BlueprintProgressService } from "../../domain/campaign/BlueprintProgressService";
import { IN_WORLD_TYPES, InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { applyEffects } from "../../domain/effects/EffectApplier";
import { turnRecorded } from "../../domain/effects/GameEffects";
import { GameBus } from "../../domain/events/GameEvents";
import { CommandHandlerMap, runCommand } from "../handlers";
import { buildRenderContext } from "../RenderContext";
import Renderer from "../Renderer";
import { advanceTime, announce } from "../turnSteps";
import { WorldTick } from "../WorldTick";
import { TurnRun, TurnStage, stateReplaced } from "./TurnRun";

export interface StageDeps {
	registry: Registry;
	bus: GameBus;
	logger: Logger;
	handlers: CommandHandlerMap;
	worldTick: WorldTick;
	renderer: Renderer;
	blueprintProgressService: BlueprintProgressService;
}

/**
 * The turn after the command is understood, in order. Each stage is one thing;
 * new behaviour is a new stage, or, if it is about the world changing as time
 * passes, a `TickRule` (see `../tick`).
 *
 *   decide → advance time → announce → world tick → narrate → post-checks
 *
 * Parsing the player's words comes before these (it needs no transaction) and
 * the autosave comes after the turn is committed; both are in `TurnPipeline`.
 */
export function createStages(deps: StageDeps): TurnStage[] {
	const { registry, bus, logger, handlers, worldTick, renderer, blueprintProgressService } = deps;

	/** The rule (or meta handler) for the command decides what happens. */
	const decide: TurnStage = {
		name: "decide",
		async run(run) {
			const decision = await runCommand(handlers, run.command, run.session);
			run.decision = decision;
			if (decision.kind === "fail") run.error = decision.error;
			else if (decision.kind === "narrate") run.turn = decision.turn;
		},
	};

	/** Time passes by the turn's cost. */
	const time: TurnStage = {
		name: "advance time",
		run(run) {
			if (run.turn && !stateReplaced(run)) {
				advanceTime(run.turn, run.session.state, bus, logger);
			}
		},
	};

	/** The world is told what happened, now that the clock has moved. */
	const tell: TurnStage = {
		name: "announce",
		run(run) {
			if (run.turn && !stateReplaced(run)) {
				announce(run.command as InWorldCommand, run.turn, run.session.state, bus);
			}
		},
	};

	/** The world reacts to the time that passed. */
	const tick: TurnStage = {
		name: "world tick",
		run(run) {
			if (stateReplaced(run)) return;
			const state = run.session.state;
			run.report = worldTick.run(
				state,
				registry,
				bus,
				run.clockBefore,
				state.worldClock.getTotalMinutes(),
			);
		},
	};

	/** What the player reads. */
	const narrate: TurnStage = {
		name: "narrate",
		async run(run) {
			const { decision, session } = run;
			const state = session.state;
			const notices = run.report?.notices ?? [];
			if (decision?.kind === "say") {
				state.output = [decision.text, ...notices].join(" ");
			} else if (decision?.kind === "narrate") {
				state.output = await renderer.render(
					buildRenderContext(registry, state, decision.briefOutput, run.turn?.timePassed, notices),
				);
			}
		},
	};

	/** Milestones, and the memory of what the player did. */
	const postChecks: TurnStage = {
		name: "post-checks",
		run(run) {
			const state = run.session.state;
			blueprintProgressService.checkMilestones(state, bus);

			// Remember what the player did, so the next sentence can say "again",
			// "go back" or "ask her". Only in-world turns, and only on the working
			// copy, so a rollback forgets it too.
			if (IN_WORLD_TYPES.has(run.command.type) && !stateReplaced(run)) {
				applyEffects(
					state,
					[
						turnRecorded({
							input: run.input,
							command: run.command,
							fromLocationId: run.fromLocationId,
						}),
					],
					bus,
				);
			}
		},
	};

	return [decide, time, tell, tick, narrate, postChecks];
}
