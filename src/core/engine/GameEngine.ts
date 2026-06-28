import { IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import TurnResolver from "./TurnResolver";

class GameEngine implements IGameEngine {
	public state: GameState;
	private registry: Registry;
	private resolver: Resolver;
	private turnResolver: TurnResolver;

	constructor(registry: Registry) {
		this.state = new GameState();
		this.registry = registry;
		this.resolver = new Resolver();
		this.turnResolver = new TurnResolver();
		this.state.output = "Welcome to Holly the Wizard! Type a command to begin.";
	}

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);
			const result = this.turnResolver.apply(command, this.state, this.registry);

			this.state.output = result.output;
			this.state.recentEvents.push(...result.events);

			if (result.stateChanges.currentLocationId !== undefined) {
				this.state.currentLocationId = result.stateChanges.currentLocationId;
			}
			if (result.stateChanges.newDiscoveredLocationId !== undefined) {
				this.state.discoveredLocationIds.push(result.stateChanges.newDiscoveredLocationId);
			}
		} catch (error) {
			this.state.output = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
		}

		return this.state;
	}
}

export { GameEngine };
