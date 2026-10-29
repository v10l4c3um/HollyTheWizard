import { Logger } from "../../application/ports/Logger";
import { Command } from "../../domain/commands/CommandDefinitions";
import Resolver from "../Resolver";
import { Autosave } from "../Autosave";
import { GameSession } from "../GameSession";
import { TurnError, TurnOutcome } from "../TurnOutcome";
import { buildWorldView } from "../WorldView";
import Registry from "../../Registry";
import { TurnRun, TurnStage } from "./TurnRun";

export interface TurnPipelineDeps {
	session: GameSession;
	registry: Registry;
	resolver: Resolver;
	stages: TurnStage[];
	autosave: Autosave;
	logger: Logger;
}

/**
 * One player turn, start to finish:
 *
 *   parse → [ stages, in a transaction ] → commit → autosave
 *
 * The stages (see `stages.ts`) work on a copy of the state. If any of them
 * fails or throws the untouched state is put back; otherwise the copy is kept.
 */
export class TurnPipeline {
	constructor(private deps: TurnPipelineDeps) {}

	async run(input: string): Promise<TurnOutcome> {
		const { session, registry, resolver, stages, autosave, logger } = this.deps;

		// Parse: the words become a command. No game state is touched.
		let command: Command;
		try {
			command = await resolver.resolve(input, buildWorldView(registry, session.state));
		} catch (error) {
			return this.fail("internal", "Something went wrong.", error);
		}

		session.begin();
		let run: TurnRun;
		try {
			const working = session.state;
			run = {
				input,
				command,
				session,
				working,
				clockBefore: working.worldClock.getTotalMinutes(),
				fromLocationId: working.currentLocationId,
			};

			for (const stage of stages) {
				logger.debug(`[Turn] ${stage.name}`);
				await stage.run(run);
				if (run.error) {
					session.rollback();
					const { kind, message, cause } = run.error;
					return this.fail(kind, message, cause);
				}
			}
			session.commit();
		} catch (error) {
			session.rollback();
			return this.fail("internal", "Something went wrong.", error);
		}

		// The turn is final now, so this is what the player would come back to.
		if (run.report?.startedNewDay) await autosave.save(session.state);

		return { state: session.state, narration: session.state.output };
	}

	private fail(kind: TurnError["kind"], message: string, cause?: unknown): TurnOutcome {
		const { session, logger } = this.deps;
		if (kind !== "invalid-input") logger.error(`${kind}: ${message}`, cause);
		session.state.output = message;
		return {
			state: session.state,
			narration: message,
			error: { kind, message, cause },
		};
	}
}
