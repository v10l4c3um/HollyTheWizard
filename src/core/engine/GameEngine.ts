import { IGameEngine } from "../../types";
import { TurnError, TurnOutcome } from "./TurnOutcome";
import { Logger } from "../application/ports/Logger";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import Renderer from "./Renderer";
import { WorldTick, TickReport } from "./WorldTick";
import { Autosave } from "./Autosave";
import { applyEffects } from "../domain/effects/EffectApplier";
import { turnRecorded } from "../domain/effects/GameEffects";
import { buildWorldView } from "./WorldView";
import { buildRenderContext } from "./RenderContext";
import { Command } from "./Command";
import { GameSession } from "./GameSession";
import { CommandHandlerMap, runCommand } from "./handlers";
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
	worldTick: WorldTick;
	autosave: Autosave;
	generateCampaignBlueprint: GenerateCampaignBlueprint;
	generateYearBlueprint: GenerateYearBlueprint;
	blueprintProgressService: BlueprintProgressService;
	logger: Logger;
}

/** Commands about the world, as opposed to the game itself (save, load, undo, …). */
const IN_WORLD = new Set<Command["type"]>([
	"MOVE",
	"TALK",
	"STUDY",
	"ATTEND_CLASS",
	"PRACTICE",
	"INTERACT",
	"REST",
]);

type StartupMilestoneId = "campaign-blueprint" | "year-blueprint";
type StartupMilestoneStatus = "in_progress" | "done";

class GameEngine implements IGameEngine {
	private session: GameSession;
	private registry: Registry;
	private resolver: Resolver;
	private renderer: Renderer;
	private handlers: CommandHandlerMap;
	private worldTick: WorldTick;
	private autosave: Autosave;
	private bus: GameBus;
	private generateCampaignBlueprint: GenerateCampaignBlueprint;
	private generateYearBlueprint: GenerateYearBlueprint;
	private blueprintProgressService: BlueprintProgressService;
	private logger: Logger;

	constructor(deps: GameEngineDeps) {
		this.session = new GameSession(new GameState());
		this.registry = deps.registry;
		this.bus = deps.bus;
		this.resolver = deps.resolver;
		this.renderer = deps.renderer;
		this.handlers = deps.handlers;
		this.worldTick = deps.worldTick;
		this.autosave = deps.autosave;
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
		let command: Command;
		try {
			command = await this.resolver.resolve(
				input,
				buildWorldView(this.registry, this.state),
			);
		} catch (error) {
			return this._fail("internal", "Something went wrong.", error);
		}

		// The turn works on a copy of the state. It is kept only if the turn
		// succeeds; any failure puts the untouched state back.
		this.session.begin();
		let report: TickReport | undefined;
		try {
			const working = this.state;
			const clockBefore = working.worldClock.getTotalMinutes();
			const fromLocationId = working.currentLocationId;
			const result = await runCommand(this.handlers, command, this.session);

			if (result.kind === "fail") {
				this.session.rollback();
				const { kind, message, cause } = result.error;
				return this._fail(kind, message, cause);
			}

			// Time passed during this turn: let the world react. (A LOAD or an
			// undo swaps the whole state, so there is no "before" to compare with.)
			if (this.state === working) {
				report = this.worldTick.run(
					this.state,
					this.registry,
					this.bus,
					clockBefore,
					this.state.worldClock.getTotalMinutes(),
				);
			}
			const notices = report?.notices ?? [];

			this.state.output =
				result.kind === "say"
					? [result.text, ...notices].join(" ")
					: await this.renderer.render(
							buildRenderContext(
								this.registry,
								this.state,
								result.briefOutput,
								result.timePassed,
								notices,
							),
						);

			this.blueprintProgressService.checkMilestones(this.state, this.bus);

			// Remember what the player did, so the next sentence can say "again",
			// "go back" or "ask her". Only in-world turns, and only on the working
			// copy, so a rollback forgets it too.
			if (IN_WORLD.has(command.type) && this.state === working) {
				applyEffects(
					this.state,
					[turnRecorded({ input, command, fromLocationId })],
					this.bus,
				);
			}
			this.session.commit();
		} catch (error) {
			this.session.rollback();
			return this._fail("internal", "Something went wrong.", error);
		}

		// The turn is final now, so this is what the player would come back to.
		if (report?.startedNewDay) {
			await this.autosave.save(this.state);
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
