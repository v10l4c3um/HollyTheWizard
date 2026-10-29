import GameState from "../domain/world/GameState";
import { Logger } from "../application/ports/Logger";
import { PersistenceRepository } from "../application/ports/PersistenceRepository";

export const AUTOSAVE_SLOT = "autosave";

/**
 * Writes the `autosave` slot. A failure is logged and never shown: the player
 * did not ask for this save, and the turn they just played did succeed.
 */
export class Autosave {
	constructor(
		private persistence: PersistenceRepository,
		private logger: Logger,
	) {}

	async save(state: GameState): Promise<void> {
		try {
			await this.persistence.save(AUTOSAVE_SLOT, state);
		} catch (cause) {
			this.logger.error("autosave failed", cause);
		}
	}
}
