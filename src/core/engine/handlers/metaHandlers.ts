import Registry from "../../Registry";
import { GameBus } from "../../domain/events/GameEvents";
import GameState from "../../domain/world/GameState";
import { validateLoadedState } from "../../domain/world/SaveValidation";
import { InvalidSaveError } from "../../application/ports/InvalidSaveError";
import { AdvanceYear } from "../../application/use-cases/AdvanceYear";
import { PersistenceRepository } from "../../application/ports/PersistenceRepository";
import { CommandHandlerMap } from "./types";

type MetaCommandType = "SAVE" | "LOAD" | "ADVANCE_YEAR" | "UNKNOWN" | "UNDO";

export interface MetaHandlerDeps {
	registry: Registry;
	bus: GameBus;
	advanceYear: AdvanceYear;
	persistenceRepository: PersistenceRepository;
}

/** Commands about the game itself rather than the world in it. */
export function createMetaHandlers({
	registry,
	bus,
	advanceYear,
	persistenceRepository,
}: MetaHandlerDeps): Pick<CommandHandlerMap, MetaCommandType> {
	return {
		UNKNOWN: async (command) => ({
			kind: "fail",
			error: {
				kind: "invalid-input",
				// Nothing happened, so there is nothing to narrate (and the
				// model may be the reason we are here): say so plainly.
				message: `I didn't understand "${command.input}". Try saying it another way.`,
			},
		}),

		UNDO: async (_command, session) =>
			session.undo()
				? { kind: "say", text: "Undid your last action." }
				: {
						kind: "fail",
						error: {
							kind: "invalid-input",
							message: "There is nothing to undo.",
						},
					},

		ADVANCE_YEAR: async (_command, session) => {
			const result = await advanceYear.execute(session.state);
			return { kind: "narrate", briefOutput: result.briefOutput };
		},

		SAVE: async (command, session) => {
			try {
				await persistenceRepository.save(command.filename, session.state);
			} catch (cause) {
				return {
					kind: "fail",
					error: {
						kind: "persistence",
						message: `Couldn't save '${command.filename}'.`,
						cause,
					},
				};
			}
			bus.emit("GameSaved", { filename: command.filename });
			return { kind: "say", text: `Game saved as '${command.filename}'.` };
		},

		LOAD: async (command, session) => {
			// A bare "load" asks for the quick save, else the autosave. If
			// neither exists the failure names what was asked for.
			let slot = command.filename;
			if (
				command.fallbackFilename &&
				!(await persistenceRepository.exists(slot)) &&
				(await persistenceRepository.exists(command.fallbackFilename))
			) {
				slot = command.fallbackFilename;
			}

			// Everything is checked on the side. The live game is only
			// replaced once the save is known to be complete and to fit the
			// current content, so a refused load changes nothing.
			let loaded: GameState;
			try {
				loaded = await persistenceRepository.load(slot);
				const problems = validateLoadedState(loaded, registry);
				if (problems.length > 0) throw new InvalidSaveError(slot, problems);
			} catch (cause) {
				return {
					kind: "fail",
					error: {
						kind: "persistence",
						message:
							cause instanceof InvalidSaveError
								? cause.message
								: `Couldn't load '${slot}'.`,
						cause,
					},
				};
			}

			session.replace(loaded);
			bus.emit("GameLoaded", { filename: slot });
			return { kind: "say", text: `Loaded game from '${slot}'.` };
		},
	};
}
