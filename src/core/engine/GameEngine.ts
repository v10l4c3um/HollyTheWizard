import { IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import TurnResolver from "./TurnResolver";
import Renderer from "./Renderer";
import {
	OllamaConfig,
	DEFAULT_BLUEPRINT_OLLAMA_CONFIG,
	DEFAULT_RENDERER_OLLAMA_CONFIG,
	DEFAULT_RESOLVER_OLLAMA_CONFIG,
} from "./OllamaConfig";
import { probeOllamaConnection } from "./OllamaClient";
import { RenderContext } from "./RenderContext";
import { createGameBus, GameBus } from "../domain/events/GameEvents";
import { BlueprintLLMProvider } from "../../ai/providers/BlueprintLLMProvider";
import { GenerateCampaignBlueprint } from "../application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../application/use-cases/GenerateYearBlueprint";
import { AdvanceYear } from "../application/use-cases/AdvanceYear";
import { BlueprintProgressService } from "../domain/campaign/BlueprintProgressService";
import { PersistenceRepository } from "../application/ports/PersistenceRepository";
import { JsonPersistenceRepository } from "../../infastructure/persistance/json/JsonPersistenceRepository";

export interface GameEngineConfig {
	resolverConfig?: OllamaConfig;
	rendererConfig?: OllamaConfig;
	blueprintConfig?: OllamaConfig;
	persistenceRepository?: PersistenceRepository;
}

class GameEngine implements IGameEngine {
	public state: GameState;
	private registry: Registry;
	private resolver: Resolver;
	private turnResolver: TurnResolver;
	private renderer: Renderer;
	private bus: GameBus;
	private generateCampaignBlueprint: GenerateCampaignBlueprint;
	private generateYearBlueprint: GenerateYearBlueprint;
	private advanceYear: AdvanceYear;
	private blueprintProgressService: BlueprintProgressService;
	private persistenceRepository: PersistenceRepository;
	private startupConfigs: OllamaConfig[];

	constructor(
		registry: Registry,
		config: GameEngineConfig = {},
		bus?: GameBus,
	) {
		const resolverConfig =
			config.resolverConfig ?? DEFAULT_RESOLVER_OLLAMA_CONFIG;
		const rendererConfig =
			config.rendererConfig ?? DEFAULT_RENDERER_OLLAMA_CONFIG;
		const blueprintConfig =
			config.blueprintConfig ?? DEFAULT_BLUEPRINT_OLLAMA_CONFIG;

		this.state = new GameState();
		this.registry = registry;
		this.bus = bus ?? createGameBus();
		this.resolver = new Resolver(resolverConfig);
		this.turnResolver = new TurnResolver(this.bus);
		this.renderer = new Renderer(rendererConfig);
		this.state.output =
			"Welcome to Holly the Wizard! Type a command to begin.";

		this.startupConfigs = [
			resolverConfig,
			rendererConfig,
			blueprintConfig,
		];

		const blueprintLLMProvider = new BlueprintLLMProvider(blueprintConfig);
		this.generateCampaignBlueprint = new GenerateCampaignBlueprint(
			blueprintLLMProvider,
			this.registry,
			this.bus,
		);
		this.generateYearBlueprint = new GenerateYearBlueprint(
			blueprintLLMProvider,
			this.registry,
			this.bus,
		);
		this.advanceYear = new AdvanceYear(
			this.generateYearBlueprint,
			this.bus,
		);
		this.blueprintProgressService = new BlueprintProgressService();
		this.persistenceRepository =
			config.persistenceRepository ?? new JsonPersistenceRepository();
	}

	/**
	 * Generates the campaign-level blueprint once, at game start. Must be
	 * called (and awaited) before the CLI app starts accepting input.
	 */
	async initializeCampaignBlueprint(
		seed: string = `seed-${Date.now()}`,
	): Promise<void> {
		await this._verifyOllamaConnections();
		this.state.campaignBlueprint =
			await this.generateCampaignBlueprint.execute(seed);
		this.state.yearBlueprints[this.state.currentYear] =
			await this.generateYearBlueprint.execute(
				this.state.currentYear,
				this.state.campaignBlueprint,
				this.state,
			);
	}

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);

			if (command.type === "ADVANCE_YEAR") {
				const result = await this.advanceYear.execute(this.state);
				this.state.recentEvents.push(...result.events);
				this.state.output = await this.renderer.render(
					this._buildRenderContext(result.briefOutput),
				);
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this.state;
			}

			if (command.type === "SAVE") {
				await this.persistenceRepository.save(
					command.filename,
					this.state,
				);
				this.bus.emit("GameSaved", { filename: command.filename });
				this.state.output = `Game saved as '${command.filename}'.`;
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this.state;
			}

			if (command.type === "LOAD") {
				this.state = await this.persistenceRepository.load(
					command.filename,
				);
				this.bus.emit("GameLoaded", { filename: command.filename });
				this.state.output = `Loaded game from '${command.filename}'.`;
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this.state;
			}

			const result = this.turnResolver.apply(
				command,
				this.state,
				this.registry,
			);

			this.state.recentEvents.push(...result.events);
			if (result.stateChanges.currentLocationId !== undefined) {
				this.state.currentLocationId =
					result.stateChanges.currentLocationId;
			}
			if (result.stateChanges.newDiscoveredLocationId !== undefined) {
				this.state.discoveredLocationIds.push(
					result.stateChanges.newDiscoveredLocationId,
				);
			}

			let timePassed:
				| {
						minutes: number;
						beforeTimeOfDay: string;
						afterTimeOfDay: string;
				  }
				| undefined;
			if (result.timeCost.type === "minutes") {
				const beforeTimeOfDay = this.state.worldClock.timeOfDay;
				this.state.worldClock.advanceTime(result.timeCost.amount);
				const afterTimeOfDay = this.state.worldClock.timeOfDay;
				timePassed = {
					minutes: result.timeCost.amount,
					beforeTimeOfDay,
					afterTimeOfDay,
				};
				this.bus.emit("TimeAdvanced", {
					minutesDelta: result.timeCost.amount,
					newMinutesOfDay: this.state.worldClock.getMinutesOfDay(),
				});
				console.log(
					`[TIME DEBUG] ${result.timeCost.amount} minutes passed | ${beforeTimeOfDay} → ${afterTimeOfDay} | Current time: ${this.state.worldClock.getCurrentTime()}`,
				);
			}

			this.state.output = await this.renderer.render(
				this._buildRenderContext(result.briefOutput, timePassed),
			);

			this.blueprintProgressService.checkMilestones(this.state, this.bus);
		} catch (error) {
			this.state.output = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
		}

		return this.state;
	}

	private _buildRenderContext(
		briefOutput: string,
		timePassed?: {
			minutes: number;
			beforeTimeOfDay: string;
			afterTimeOfDay: string;
		},
	): RenderContext {
		const location = this.registry.getLocation(
			this.state.currentLocationId,
		);
		const nearbyNPCNames = this.state.knownNPCIds.map(
			(id) => this.registry.getNPC(id)?.name ?? id,
		);

		return {
			briefOutput,
			playerName: this.state.player.name,
			locationName: location?.displayName ?? this.state.currentLocationId,
			locationDescription: location?.description ?? "",
			timeOfDay: this.state.worldClock.timeOfDay,
			nearbyNPCNames,
			recentEvents: this.state.recentEvents.slice(-5),
			narrationMode: this.state.settings.narrationMode,
			timePassed,
		};
	}

	private async _verifyOllamaConnections(): Promise<void> {
		const seen = new Set<string>();

		for (const config of this.startupConfigs) {
			const key = `${config.endpoint}::${config.model}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);

			try {
				await probeOllamaConnection(config);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Ollama availability check failed";
				throw new Error(
					`Startup failed: ${message} at ${config.endpoint}`,
				);
			}
		}
	}
}

export { GameEngine };
