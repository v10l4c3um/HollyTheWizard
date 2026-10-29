import { IGameEngine } from "../../types";
import { TurnError, TurnOutcome } from "./TurnOutcome";
import { Logger } from "../application/ports/Logger";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import Renderer from "./Renderer";
import { buildRenderContext } from "./RenderContext";
import { CommandHandlerMap, GameSession, runCommand } from "./handlers";
import { GameBus } from "../domain/events/GameEvents";
import { GenerateCampaignBlueprint } from "../application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../application/use-cases/GenerateYearBlueprint";
import { BlueprintProgressService } from "../domain/campaign/BlueprintProgressService";

export interface GameEngineDeps {
	registry: Registry;
	bus: GameBus;
	resolver: Resolver;
	renderer: Renderer;
	handlers: CommandHandlerMap;
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
	private resolver: Resolver;
	private renderer: Renderer;
	private handlers: CommandHandlerMap;
	private bus: GameBus;
	private generateCampaignBlueprint: GenerateCampaignBlueprint;
	private generateYearBlueprint: GenerateYearBlueprint;
	private blueprintProgressService: BlueprintProgressService;
	private logger: Logger;

	constructor(deps: GameEngineDeps) {
		this.session = { state: new GameState() };
		this.registry = deps.registry;
		this.bus = deps.bus;
		this.resolver = deps.resolver;
		this.renderer = deps.renderer;
		this.handlers = deps.handlers;
		this.generateCampaignBlueprint = deps.generateCampaignBlueprint;
		this.generateYearBlueprint = deps.generateYearBlueprint;
		this.blueprintProgressService = deps.blueprintProgressService;
		this.logger = deps.logger;
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
		try {
			const command = await this.resolver.resolve(input);
			const result = await runCommand(this.handlers, command, this.session);

			if (result.kind === "fail") {
				const { kind, message, cause } = result.error;
				return this._fail(kind, message, cause);
			}

			this.state.output =
				result.kind === "say"
					? result.text
					: await this.renderer.render(
							buildRenderContext(
								this.registry,
								this.state,
								result.briefOutput,
								result.timePassed,
							),
						);

			this.blueprintProgressService.checkMilestones(this.state, this.bus);
		} catch (error) {
			return this._fail("internal", "Something went wrong.", error);
		}

		return this._ok();
	}

	private _ok(): TurnOutcome {
		return { state: this.state, narration: this.state.output };
	}

	private _fail(
		kind: TurnError["kind"],
		message: string,
		cause?: unknown,
	): TurnOutcome {
		if (kind !== "invalid-input") {
			this.logger.error(`${kind}: ${message}`, cause);
		}
		this.state.output = message;
		return {
			state: this.state,
			narration: message,
			error: { kind, message, cause },
		};
	}
}

export { GameEngine };
