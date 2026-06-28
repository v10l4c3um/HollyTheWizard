import { IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Resolver from "./Resolver";
import { MoveCommand } from "../../ui/cli/commands/Move";
import { TalkCommand } from "../../ui/cli/commands/Talk";
import { StudyCommand } from "../../ui/cli/commands/Study";
import { InteractCommand } from "../../ui/cli/commands/Interact";
import { RestCommand } from "../../ui/cli/commands/Rest";
import { SaveCommand } from "../../ui/cli/commands/Save";
import { LoadCommand } from "../../ui/cli/commands/Load";
import { Command } from "../../ui/cli/commands/Command";

class GameEngine implements IGameEngine {
	public state: GameState;
	private resolver: Resolver;

	constructor() {
		this.state = new GameState();
		this.resolver = new Resolver();
		this.state.output =
			"Welcome to Holly the Wizard! Type a command to begin.";
	}

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);
			await this._executeCommand(command);
		} catch (error) {
			this.state.output = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
		}

		return this.state;
	}

	private async _executeCommand(command: Command): Promise<void> {
		if (command instanceof MoveCommand) {
			this._handleMove(command);
		} else if (command instanceof TalkCommand) {
			this._handleTalk(command);
		} else if (command instanceof StudyCommand) {
			this._handleStudy(command);
		} else if (command instanceof InteractCommand) {
			this._handleInteract(command);
		} else if (command instanceof RestCommand) {
			this._handleRest(command);
		} else if (command instanceof SaveCommand) {
			this._handleSave(command);
		} else if (command instanceof LoadCommand) {
			this._handleLoad(command);
		}
	}

	private _handleMove(command: MoveCommand): void {
		const previousLocation = this.state.currentLocation;
		const destinationLocation = command.destination as string;

		if (
			previousLocation.connectedLocationsIds.some(
				(locationId) => locationId === destinationLocation,
			)
		) {
			this.state.currentLocation =
				command.destination as unknown as Location;
			this.state.recentEvents.push(
				`Moved from ${previousLocation} to ${command.destination}`,
			);
			this.state.output = `You traveled to ${command.destination}.`;
		} else {
			this.state.output = `You can't move to ${command.destination} from ${previousLocation}.`;
			this.state.recentEvents.push(
				`Failed to move from ${previousLocation} to ${command.destination}`,
			);
		}
	}

	private _handleTalk(command: TalkCommand): void {
		const npc = this.state.knownNPCs.find(
			(n) => n.name.toLowerCase() === command.npcName.toLowerCase(),
		);
		if (!npc) {
			this.state.output = `You don't see anyone named ${command.npcName} here.`;
			return;
		}

		this.state.recentEvents.push(`Talked to ${command.npcName}`);
		this.state.output = `You talked to ${command.npcName}. They seem interested in what you have to say.`;
	}

	private _handleStudy(command: StudyCommand): void {
		const spell = this.state.spellbook.spells?.find(
			(s) => s.name.toLowerCase() === command.spellName.toLowerCase(),
		);
		if (!spell) {
			this.state.output = `You don't know a spell called ${command.spellName}.`;
			return;
		}

		this.state.recentEvents.push(`Studied ${command.spellName}`);
		this.state.output = `You spent time studying ${command.spellName}. You feel more proficient now.`;
	}

	private _handleInteract(command: InteractCommand): void {
		const item = this.state.inventory.items.find(
			(i) => i.name.toLowerCase() === command.targetName.toLowerCase(),
		);
		if (!item) {
			this.state.output = `You don't have anything called ${command.targetName}.`;
			return;
		}

		this.state.recentEvents.push(
			`Interacted with ${command.targetName} using ${command.actionType}`,
		);
		this.state.output = `You ${command.actionType} ${command.targetName}. Something happened!`;
	}

	private _handleRest(command: RestCommand): void {
		this.state.worldClock.advanceTime(command.duration * 60);
		this.state.player.health = Math.min(
			100,
			this.state.player.health + 20 * command.duration,
		);
		this.state.recentEvents.push(`Rested for ${command.duration} hour(s)`);
		this.state.output = `You rested for ${command.duration} hour(s) at ${command.location}. You feel refreshed!`;
	}

	private _handleSave(command: SaveCommand): void {
		this.state.recentEvents.push(`Game saved as ${command.filename}`);
		this.state.output = `Game saved as '${command.filename}'.`;
	}

	private _handleLoad(command: LoadCommand): void {
		this.state.recentEvents.push(`Loaded game from ${command.filename}`);
		this.state.output = `Loaded game from '${command.filename}'.`;
	}
}

export { GameEngine };
