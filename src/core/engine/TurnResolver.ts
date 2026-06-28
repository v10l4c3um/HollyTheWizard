import { Command } from "../../types";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { TurnResult } from "./TurnResult";

class TurnResolver {
	apply(command: Command, state: GameState, registry: Registry): TurnResult {
		switch (command.type) {
			case "MOVE":
				return this._move(command.destinationId, state, registry);
			case "TALK":
				return this._talk(command.npcId, command.conversationTopic, state, registry);
			case "STUDY":
				return this._study(command.spellId, command.duration ?? 1, state, registry);
			case "INTERACT":
				return this._interact(command.itemId, command.actionType, state);
			case "REST":
				return this._rest(command.duration, command.locationId, state, registry);
			case "SAVE":
				return this._save(command.filename);
			case "LOAD":
				return this._load(command.filename);
		}
	}

	private _move(destinationId: string, state: GameState, registry: Registry): TurnResult {
		const current = registry.getLocation(state.currentLocationId);
		if (!current) {
			return { briefOutput: "You seem to be nowhere. Something is wrong.", events: [], stateChanges: {} };
		}

		if (!current.connectedLocations.includes(destinationId)) {
			return {
				briefOutput: `You can't move to ${destinationId} from ${current.displayName}.`,
				events: [`Failed to move from ${current.id} to ${destinationId}`],
				stateChanges: {},
			};
		}

		const destination = registry.getLocation(destinationId);
		const destinationName = destination?.displayName ?? destinationId;
		const isNew = !state.discoveredLocationIds.includes(destinationId);

		return {
			briefOutput: `You traveled to ${destinationName}.`,
			events: [`Moved from ${current.id} to ${destinationId}`],
			stateChanges: {
				currentLocationId: destinationId,
				newDiscoveredLocationId: isNew ? destinationId : undefined,
			},
		};
	}

	private _talk(npcId: string, topic: string | undefined, state: GameState, registry: Registry): TurnResult {
		if (!state.knownNPCIds.includes(npcId)) {
			return { briefOutput: `You don't see anyone with id "${npcId}" here.`, events: [], stateChanges: {} };
		}

		const npc = registry.getNPC(npcId);
		const npcName = npc?.name ?? npcId;
		const topicSuffix = topic ? ` about ${topic}` : "";

		return {
			briefOutput: `You talked to ${npcName}${topicSuffix}. They seem interested in what you have to say.`,
			events: [`Talked to ${npcId}`],
			stateChanges: {},
		};
	}

	private _study(spellId: string, duration: number, state: GameState, registry: Registry): TurnResult {
		const spell = state.spellbook.spells.find((s) => s.id === spellId);
		if (!spell) {
			const known = registry.getSpell(spellId);
			const briefOutput = known
				? `You haven't learned ${known.name} yet.`
				: `There is no spell with id "${spellId}".`;
			return { briefOutput, events: [], stateChanges: {} };
		}

		return {
			briefOutput: `You spent ${duration} hour(s) studying ${spell.name}. You feel more proficient now.`,
			events: [`Studied ${spellId} for ${duration}h`],
			stateChanges: {},
		};
	}

	private _interact(itemId: string, actionType: string, state: GameState): TurnResult {
		const item = state.inventory.items.find((i) => i.id === itemId);
		if (!item) {
			return { briefOutput: `You don't have an item with id "${itemId}".`, events: [], stateChanges: {} };
		}

		return {
			briefOutput: `You ${actionType} ${item.name}. Something happened!`,
			events: [`${actionType} ${itemId}`],
			stateChanges: {},
		};
	}

	private _rest(duration: number, locationId: string | undefined, state: GameState, registry: Registry): TurnResult {
		const locId = locationId ?? state.currentLocationId;
		const location = registry.getLocation(locId);
		const locName = location?.displayName ?? locId;

		return {
			briefOutput: `You rested for ${duration} hour(s) at ${locName}. You feel refreshed!`,
			events: [`Rested for ${duration} hour(s) at ${locId}`],
			stateChanges: {},
		};
	}

	private _save(filename: string): TurnResult {
		return {
			briefOutput: `Game saved as '${filename}'.`,
			events: [`Game saved as ${filename}`],
			stateChanges: {},
		};
	}

	private _load(filename: string): TurnResult {
		return {
			briefOutput: `Loaded game from '${filename}'.`,
			events: [`Loaded game from ${filename}`],
			stateChanges: {},
		};
	}
}

export default TurnResolver;
