import { IGameEngine } from "../../types";
import { TurnOutcome } from "./TurnOutcome";
import { Logger } from "../application/ports/Logger";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import Renderer from "./Renderer";
import { WorldTick } from "./WorldTick";
import { Autosave } from "./Autosave";
import { GameSession } from "./GameSession";
import { CommandHandlerMap } from "./handlers";
import { GameBus } from "../domain/events/GameEvents";
import { GenerateCampaignBlueprint } from "../application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../application/use-cases/GenerateYearBlueprint";
import { BlueprintProgressService } from "../domain/campaign/BlueprintProgressService";
import { TurnPipeline } from "./pipeline/TurnPipeline";
import { createStages } from "./pipeline/stages";
import { ProgressionTracker } from "./ProgressionTracker";

export interface GameEngineDeps {
	registry: Registry;
	bus: GameBus;
	resolver: Resolver;
	renderer: Renderer;
	handlers: CommandHandlerMap;
	worldTick: WorldTick;
	autosave: Autosave;
	generateCampaignBlueprint: GenerateCampaignBlueprint;
	generateYearBlueprint: GenerateYearBlueprint;
	blueprintProgressService: BlueprintProgressService;
	logger: Logger;
}

type StartupMilestoneId = "campaign-blueprint" | "year-blueprint";
type StartupMilestoneStatus = "in_progress" | "done";

class GameEngine implements IGameEngine {
	private session: GameSession;
	private registry: Registry;
	private pipeline: TurnPipeline;
	private generateCampaignBlueprint: GenerateCampaignBlueprint;
	private generateYearBlueprint: GenerateYearBlueprint;
	private blueprintProgressService: BlueprintProgressService;

	constructor(deps: GameEngineDeps) {
		this.session = new GameSession(new GameState());
		this.registry = deps.registry;
		new ProgressionTracker(deps.bus, () => this.state, deps.logger);
		this.pipeline = new TurnPipeline({
			session: this.session,
			registry: deps.registry,
			resolver: deps.resolver,
			autosave: deps.autosave,
			logger: deps.logger,
			stages: createStages(deps),
		});
		this.generateCampaignBlueprint = deps.generateCampaignBlueprint;
		this.generateYearBlueprint = deps.generateYearBlueprint;
		this.blueprintProgressService = deps.blueprintProgressService;
		this.state.output =
			"Welcome to Holly the Wizard! Type a command to begin.";
	}

	/** The live game state. `LOAD` replaces it, so do not hold on to it. */
	get state(): GameState {
		return this.session.state;
	}

	/**
	 * Generates the campaign-level blueprint once, at game start. Must be
	 * called (and awaited) before the CLI app starts accepting input.
	 */
	async initializeCampaignBlueprint(
		seed: string = `seed-${Date.now()}`,
		onProgress?: (
			milestoneId: StartupMilestoneId,
			status: StartupMilestoneStatus,
		) => void,
	): Promise<void> {
		onProgress?.("campaign-blueprint", "in_progress");
		this.state.campaignBlueprint =
			await this.generateCampaignBlueprint.execute(seed);
		onProgress?.("campaign-blueprint", "done");
		onProgress?.("year-blueprint", "in_progress");
		this.state.yearBlueprints[this.state.currentYear] =
			await this.generateYearBlueprint.execute(
				this.state.currentYear,
				this.state.campaignBlueprint,
				this.state,
			);
		onProgress?.("year-blueprint", "done");
	}

	async handleCommand(input: string): Promise<TurnOutcome> {
		return this.pipeline.run(input);
	}
}

export { GameEngine };
