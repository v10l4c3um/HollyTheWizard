import { IGameEngine } from "../../types";
import { TurnError, TurnOutcome } from "./TurnOutcome";
import { Logger } from "../application/ports/Logger";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import TurnResolver from "./TurnResolver";
import Renderer from "./Renderer";
import { RenderContext } from "./RenderContext";
import { npcsAt } from "../domain/npc/Presence";
import { GameBus } from "../domain/events/GameEvents";
import { GenerateCampaignBlueprint } from "../application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../application/use-cases/GenerateYearBlueprint";
import { AdvanceYear } from "../application/use-cases/AdvanceYear";
import { BlueprintProgressService } from "../domain/campaign/BlueprintProgressService";
import { PersistenceRepository } from "../application/ports/PersistenceRepository";

export interface GameEngineDeps {
	registry: Registry;
	bus: GameBus;
	resolver: Resolver;
	turnResolver: TurnResolver;
	renderer: Renderer;
	generateCampaignBlueprint: GenerateCampaignBlueprint;
	generateYearBlueprint: GenerateYearBlueprint;
	advanceYear: AdvanceYear;
	blueprintProgressService: BlueprintProgressService;
	persistenceRepository: PersistenceRepository;
	logger: Logger;
}

type StartupMilestoneId = "campaign-blueprint" | "year-blueprint";
type StartupMilestoneStatus = "in_progress" | "done";

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
	private logger: Logger;

	constructor(deps: GameEngineDeps) {
		this.state = new GameState();
		this.registry = deps.registry;
		this.bus = deps.bus;
		this.resolver = deps.resolver;
		this.turnResolver = deps.turnResolver;
		this.renderer = deps.renderer;
		this.generateCampaignBlueprint = deps.generateCampaignBlueprint;
		this.generateYearBlueprint = deps.generateYearBlueprint;
		this.advanceYear = deps.advanceYear;
		this.blueprintProgressService = deps.blueprintProgressService;
		this.persistenceRepository = deps.persistenceRepository;
		this.logger = deps.logger;
		this.state.output =
			"Welcome to Holly the Wizard! Type a command to begin.";
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

			if (command.type === "UNKNOWN") {
				// Nothing happened, so there is nothing to narrate (and the
				// model may be the reason we are here): say so plainly.
				return this._fail(
					"invalid-input",
					`I didn't understand "${command.input}". Try saying it another way.`,
				);
			}

			if (command.type === "ADVANCE_YEAR") {
				const result = await this.advanceYear.execute(this.state);
				this.state.output = await this.renderer.render(
					this._buildRenderContext(result.briefOutput),
				);
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this._ok();
			}

			if (command.type === "SAVE") {
				try {
					await this.persistenceRepository.save(
						command.filename,
						this.state,
					);
				} catch (error) {
					return this._fail(
						"persistence",
						`Couldn't save '${command.filename}'.`,
						error,
					);
				}
				this.bus.emit("GameSaved", { filename: command.filename });
				this.state.output = `Game saved as '${command.filename}'.`;
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this._ok();
			}

			if (command.type === "LOAD") {
				try {
					this.state = await this.persistenceRepository.load(
						command.filename,
					);
				} catch (error) {
					return this._fail(
						"persistence",
						`Couldn't load '${command.filename}'.`,
						error,
					);
				}
				this.bus.emit("GameLoaded", { filename: command.filename });
				this.state.output = `Loaded game from '${command.filename}'.`;
				this.blueprintProgressService.checkMilestones(
					this.state,
					this.bus,
				);
				return this._ok();
			}

			const result = this.turnResolver.apply(
				command,
				this.state,
				this.registry,
			);

			this.state.output = await this.renderer.render(
				this._buildRenderContext(result.briefOutput, result.timePassed),
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
		const nearbyNPCNames = npcsAt(this.registry, this.state).map(
			(npc) => npc.name,
		);

		return {
			briefOutput,
			playerName: this.state.player.name,
			locationName: location?.displayName ?? this.state.currentLocationId,
			locationDescription: location?.description ?? "",
			timeOfDay: this.state.worldClock.timeOfDay,
			day: this.state.worldClock.getDay(),
			weekday: this.state.worldClock.getWeekday(),
			nearbyNPCNames,
			recentEvents: this.state.recentEvents.slice(-5),
			narrationMode: this.state.settings.narrationMode,
			timePassed,
		};
	}
}

export { GameEngine };
