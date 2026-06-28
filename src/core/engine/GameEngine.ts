import { IGameEngine } from "../../types";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import Resolver from "./Resolver";
import { Command } from "../../ui/cli/commands/Command";

class GameEngine implements IGameEngine {
	public state: GameState;
	private registry: Registry;
	private resolver: Resolver;

	constructor(registry: Registry) {
		this.state = new GameState();
		this.registry = registry;
		this.resolver = new Resolver();
		this.state.output = "Welcome to Holly the Wizard! Type a command to begin.";
	}

	async handleCommand(input: string): Promise<GameState> {
		try {
			const command = await this.resolver.resolve(input);
			this._executeCommand(command);
		} catch (error) {
			this.state.output = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
		}

		return this.state;
	}

	private _executeCommand(command: Command): void {
		switch (command.type) {
			case "MOVE":
				this._handleMove(command.destinationId);
				break;
			case "TALK":
				this._handleTalk(command.npcId, command.conversationTopic);
				break;
			case "STUDY":
				this._handleStudy(command.spellId, command.duration ?? 1);
				break;
			case "INTERACT":
				this._handleInteract(command.itemId, command.actionType);
				break;
			case "REST":
				this._handleRest(command.duration, command.locationId);
				break;
			case "SAVE":
				this._handleSave(command.filename);
				break;
			case "LOAD":
				this._handleLoad(command.filename);
				break;
		}
	}

	private _handleMove(destinationId: string): void {
		const current = this.registry.getLocation(this.state.currentLocationId);
		if (!current) {
			this.state.output = "You seem to be nowhere. Something is wrong.";
			return;
		}

		if (!current.connectedLocations.includes(destinationId)) {
			this.state.output = `You can't move to ${destinationId} from ${current.displayName}.`;
			this.state.recentEvents.push(`Failed to move from ${current.id} to ${destinationId}`);
			return;
		}

		const destination = this.registry.getLocation(destinationId);
		const destinationName = destination?.displayName ?? destinationId;

		this.state.currentLocationId = destinationId;
		if (!this.state.discoveredLocationIds.includes(destinationId)) {
			this.state.discoveredLocationIds.push(destinationId);
		}
		this.state.recentEvents.push(`Moved from ${current.id} to ${destinationId}`);
		this.state.output = `You traveled to ${destinationName}.`;
	}

	private _handleTalk(npcId: string, topic?: string): void {
		if (!this.state.knownNPCIds.includes(npcId)) {
			this.state.output = `You don't see anyone with id "${npcId}" here.`;
			return;
		}

		const npc = this.registry.getNPC(npcId);
		const npcName = npc?.name ?? npcId;
		const topicSuffix = topic ? ` about ${topic}` : "";

		this.state.recentEvents.push(`Talked to ${npcId}`);
		this.state.output = `You talked to ${npcName}${topicSuffix}. They seem interested in what you have to say.`;
	}

	private _handleStudy(spellId: string, duration: number): void {
		const spell = this.state.spellbook.spells.find((s) => s.id === spellId);
		if (!spell) {
			const known = this.registry.getSpell(spellId);
			if (!known) {
				this.state.output = `There is no spell with id "${spellId}".`;
				return;
			}
			this.state.output = `You haven't learned ${known.name} yet.`;
			return;
		}

		this.state.recentEvents.push(`Studied ${spellId} for ${duration}h`);
		this.state.output = `You spent ${duration} hour(s) studying ${spell.name}. You feel more proficient now.`;
	}

	private _handleInteract(itemId: string, actionType: string): void {
		const item = this.state.inventory.items.find((i) => i.id === itemId);
		if (!item) {
			this.state.output = `You don't have an item with id "${itemId}".`;
			return;
		}

		this.state.recentEvents.push(`${actionType} ${itemId}`);
		this.state.output = `You ${actionType} ${item.name}. Something happened!`;
	}

	private _handleRest(duration: number, locationId?: string): void {
		const locId = locationId ?? this.state.currentLocationId;
		const location = this.registry.getLocation(locId);
		const locName = location?.displayName ?? locId;

		this.state.recentEvents.push(`Rested for ${duration} hour(s) at ${locId}`);
		this.state.output = `You rested for ${duration} hour(s) at ${locName}. You feel refreshed!`;
	}

	private _handleSave(filename: string): void {
		this.state.recentEvents.push(`Game saved as ${filename}`);
		this.state.output = `Game saved as '${filename}'.`;
	}

	private _handleLoad(filename: string): void {
		this.state.recentEvents.push(`Loaded game from ${filename}`);
		this.state.output = `Loaded game from '${filename}'.`;
	}
}

export { GameEngine };
