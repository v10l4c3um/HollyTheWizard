import { IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import TurnResolver from "./TurnResolver";
import Renderer from "./Renderer";
import { OllamaConfig, DEFAULT_OLLAMA_CONFIG } from "./OllamaConfig";
import { RenderContext } from "./RenderContext";

export interface GameEngineConfig {
	resolverConfig?: OllamaConfig;
	rendererConfig?: OllamaConfig;
}

class GameEngine implements IGameEngine {
	public state: GameState;
	private registry: Registry;
	private resolver: Resolver;
	private turnResolver: TurnResolver;
	private renderer: Renderer;

	constructor(registry: Registry, config: GameEngineConfig = {}) {
		this.state = new GameState();
		this.registry = registry;
		this.resolver = new Resolver(config.resolverConfig ?? DEFAULT_OLLAMA_CONFIG);
		this.turnResolver = new TurnResolver();
		this.renderer = new Renderer(config.rendererConfig ?? DEFAULT_OLLAMA_CONFIG);
		this.state.output = "Welcome to Holly the Wizard! Type a command to begin.";
	}

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);
			const result = this.turnResolver.apply(command, this.state, this.registry);

			this.state.recentEvents.push(...result.events);
			if (result.stateChanges.currentLocationId !== undefined) {
				this.state.currentLocationId = result.stateChanges.currentLocationId;
			}
			if (result.stateChanges.newDiscoveredLocationId !== undefined) {
				this.state.discoveredLocationIds.push(result.stateChanges.newDiscoveredLocationId);
			}

			this.state.output = await this.renderer.render(
				this._buildRenderContext(result.briefOutput),
			);
		} catch (error) {
			this.state.output = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
		}

		return this.state;
	}

	private _buildRenderContext(briefOutput: string): RenderContext {
		const location = this.registry.getLocation(this.state.currentLocationId);
		const nearbyNPCNames = this.state.knownNPCIds
			.map((id) => this.registry.getNPC(id)?.name ?? id);

		return {
			briefOutput,
			playerName: this.state.player.name,
			locationName: location?.displayName ?? this.state.currentLocationId,
			locationDescription: location?.description ?? "",
			timeOfDay: this.state.worldClock.timeOfDay,
			nearbyNPCNames,
			recentEvents: this.state.recentEvents.slice(-5),
			narrationMode: this.state.settings.narrationMode,
		};
	}
}

export { GameEngine };
