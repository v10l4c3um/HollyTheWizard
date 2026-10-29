import Registry from "../../Registry";
import { GameBus } from "../../domain/events/GameEvents";
import { applyEffects } from "../../domain/effects/EffectApplier";
import { arrivalEffects } from "../../domain/world/Exploration";
import { AdvanceYear } from "../../application/use-cases/AdvanceYear";
import { PersistenceRepository } from "../../application/ports/PersistenceRepository";
import { CommandHandlerMap } from "./types";

type MetaCommandType = "SAVE" | "LOAD" | "ADVANCE_YEAR" | "UNKNOWN";

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

			let loaded;
			try {
				loaded = await persistenceRepository.load(slot);
			} catch (cause) {
				return {
					kind: "fail",
					error: {
						kind: "persistence",
						message: `Couldn't load '${slot}'.`,
						cause,
					},
				};
			}
			session.state = loaded;
			// Saves from before exits were tracked: the place you stand in
			// always shows its exits.
			applyEffects(
				loaded,
				arrivalEffects(registry, loaded, loaded.currentLocationId),
				bus,
			);
			bus.emit("GameLoaded", { filename: slot });
			return {
				kind: "say",
				text: `Loaded game from '${slot}'.`,
			};
		},
	};
}
