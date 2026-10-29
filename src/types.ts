import GameState from "./core/domain/world/GameState";
import { TurnOutcome } from "./core/engine/TurnOutcome";

export interface IGameEngine {
	state: GameState;
	handleCommand(input: string): Promise<TurnOutcome>;
}
