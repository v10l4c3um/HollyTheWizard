import GameState from "../../domain/world/GameState";

export interface PersistenceRepository {
	save(filename: string, state: GameState): Promise<void>;
	load(filename: string): Promise<GameState>;
	/** Whether a save with this name exists. */
	exists(filename: string): Promise<boolean>;
}
