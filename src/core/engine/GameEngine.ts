import { CommandSchema, IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Resolver from "./Resolver";

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

	private async _executeCommand(command: CommandSchema): Promise<void> {
		switch (command.type) {
			case "MOVE":
				this._handleMove(command);
				break;
			case "TALK":
				this._handleTalk(command);
				break;
			case "STUDY":
				this._handleStudy(command);
				break;
			case "INTERACT":
				this._handleInteract(command);
				break;
			case "REST":
				this._handleRest(command);
				break;
			case "SAVE":
				this._handleSave(command);
				break;
			case "LOAD":
				this._handleLoad(command);
				break;
		}
	}

	private _handleMove(command: CommandSchema): void {
		if (!command.target) {
			this.state.output = "Where would you like to go?";
			return;
		}

		const previousLocation = this.state.currentLocation as string;
		this.state.currentLocation =
			command.target as unknown as WebGLUniformLocation;
		this.state.recentEvents.push(
			`Moved from ${previousLocation} to ${command.target}`,
		);
		this.state.output = `You traveled to ${command.target}.`;
	}

	private _handleTalk(command: CommandSchema): void {
		if (!command.target) {
			this.state.output = "Who would you like to talk to?";
			return;
		}

		const npc = this.state.knownNPCs.find(
			(n) => n.name.toLowerCase() === command.target?.toLowerCase(),
		);
		if (!npc) {
			this.state.output = `You don't see anyone named ${command.target} here.`;
			return;
		}

		this.state.recentEvents.push(`Talked to ${command.target}`);
		this.state.output = `You talked to ${command.target}. They seem interested in what you have to say.`;
	}

	private _handleStudy(command: CommandSchema): void {
		if (!command.target) {
			this.state.output = "What would you like to study?";
			return;
		}

		const spell = this.state.spellbook.spells?.find(
			(s) => s.name.toLowerCase() === command.target?.toLowerCase(),
		);
		if (!spell) {
			this.state.output = `You don't know a spell called ${command.target}.`;
			return;
		}

		this.state.recentEvents.push(`Studied ${command.target}`);
		this.state.output = `You spent time studying ${command.target}. You feel more proficient now.`;
	}

	private _handleInteract(command: CommandSchema): void {
		if (!command.target) {
			this.state.output = "What would you like to interact with?";
			return;
		}

		const item = this.state.inventory.items.find(
			(i) => i.name.toLowerCase() === command.target?.toLowerCase(),
		);
		if (!item) {
			this.state.output = `You don't have anything called ${command.target}.`;
			return;
		}

		this.state.recentEvents.push(`Interacted with ${command.target}`);
		this.state.output = `You interacted with ${command.target}. Something happened!`;
	}

	private _handleRest(command: CommandSchema): void {
		const duration = (command.params?.duration as number) || 1;
		this.state.worldClock.advanceTime(duration * 60);
		this.state.player.health = Math.min(
			100,
			this.state.player.health + 20 * duration,
		);
		this.state.recentEvents.push(`Rested for ${duration} hour(s)`);
		this.state.output = `You rested for ${duration} hour(s). You feel refreshed!`;
	}

	private _handleSave(command: CommandSchema): void {
		const filename =
			(command.params?.filename as string) ||
			command.target ||
			"autosave";
		this.state.recentEvents.push(`Game saved as ${filename}`);
		this.state.output = `Game saved as '${filename}'.`;
		// TODO: Implement actual file persistence
	}

	private _handleLoad(command: CommandSchema): void {
		const filename =
			(command.params?.filename as string) ||
			command.target ||
			"autosave";
		this.state.recentEvents.push(`Loaded game from ${filename}`);
		this.state.output = `Loaded game from '${filename}'.`;
		// TODO: Implement actual file loading
	}
}

export { GameEngine };
