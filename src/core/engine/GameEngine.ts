import { IGameEngine } from "../../types";
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

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);

			if (command.type === "UNKNOWN") {
				// Nothing happened, so there is nothing to narrate (and the
				// model may be the reason we are here): say so plainly.
				this.state.output = `I didn't understand "${command.input}". Try saying it another way.`;
				return this.state;
			}

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
					totalMinutes: this.state.worldClock.getTotalMinutes(),
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
