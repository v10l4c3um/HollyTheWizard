import { Command } from "../../ui/cli/commands/Command";
import GameState from "../domain/world/GameState";
import Registry from "../Registry";
import { TurnResult } from "./TurnResult";
import { TimeCost } from "./TimeCost";

class TurnResolver {
	apply(command: Command, state: GameState, registry: Registry): TurnResult {
		switch (command.type) {
			case "MOVE":
				return this._move(command.destinationId, state, registry);
			case "TALK":
				return this._talk(
					command.npcId,
					command.conversationTopic,
					state,
					registry,
				);
			case "STUDY":
				return this._study(command.classId, state, registry);
			case "PRACTICE":
				return this._practice(
					command.spellId,
					command.duration ?? 1,
					state,
					registry,
				);
			case "INTERACT":
				return this._interact(
					command.itemId,
					command.actionType,
					state,
				);
			case "REST":
				return this._rest(
					command.duration,
					command.locationId,
					state,
					registry,
				);
			case "SAVE":
				return this._save(command.filename);
			case "LOAD":
				return this._load(command.filename);
		}
	}

	private _move(
		destinationId: string,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const current = registry.getLocation(state.currentLocationId);
		if (!current) {
			return {
				briefOutput: "You seem to be nowhere. Something is wrong.",
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		if (!registry.getLocation(destinationId)) {
			return {
				briefOutput: `There is no "${destinationId}" here.`,
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		const destination = registry.getLocation(destinationId);
		const destinationDisplayName =
			destination?.displayName ?? destinationId;
		const isNew = !state.discoveredLocationIds.includes(destinationId);

		if (!current.connectedLocationsIds.includes(destinationId)) {
			return {
				briefOutput: `You can't move to ${destinationDisplayName} from ${current.displayName}.`,
				events: [
					`Failed to move from ${current.displayName} to ${destinationDisplayName}`,
				],
				timeCost: { type: "minutes", amount: 2 },
				stateChanges: {},
			};
		}

		return {
			briefOutput: `You traveled to ${destinationDisplayName}.`,
			events: [
				`Moved from ${current.displayName} to ${destinationDisplayName}`,
			],
			timeCost: { type: "minutes", amount: 5 },
			stateChanges: {
				currentLocationId: destinationId,
				newDiscoveredLocationId: isNew ? destinationId : undefined,
			},
		};
	}

	private _talk(
		npcId: string,
		topic: string | undefined,
		state: GameState,
		registry: Registry,
	): TurnResult {
		// Note: Removed the check for known NPCs to allow talking to any NPC, even if not known yet.
		// if (!state.knownNPCIds.includes(npcId)) {
		// 	return {
		// 		briefOutput: `You don't know anyone with id "${npcId}" here.`,
		// 		events: [],
		// 		timeCost: { type: "none" },
		// 		stateChanges: {},
		// 	};
		// }

		const npc = registry.getNPC(npcId);
		const npcName = npc?.name ?? npcId;
		const topicSuffix = topic ? ` about ${topic}` : "";

		return {
			briefOutput: `You talked to ${npcName}${topicSuffix}. They seem interested in what you have to say.`,
			events: [`Talked to ${npcId}`],
			timeCost: { type: "minutes", amount: 15 },
			stateChanges: {},
		};
	}

	private _study(
		classId: string,
		state: GameState,
		registry: Registry,
	): TurnResult {
		return {
			briefOutput: "Studied a class.",
			events: [`Studied ${classId}`],
			timeCost: { type: "minutes", amount: 60 },
			stateChanges: {},
		};
	}

	private _practice(
		spellId: string,
		duration: number,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const spell = state.spellbook.spells.find(
			(s) => s.definition.id === spellId,
		);
		if (!spell) {
			const known = registry.getSpell(spellId);
			const briefOutput = known
				? `You haven't learned ${known.definition.name} yet.`
				: `There is no spell with id "${spellId}".`;

			return {
				briefOutput,
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		const spellToUpdate = state.spellbook.spells.find(
			(s) => s.definition.id === spellId,
		)!;
		if (spellToUpdate.balance) {
			spellToUpdate.balance.practiceRequirement -= duration;
		}

		return {
			briefOutput: `You spent ${duration} hour(s) practicing ${spell.definition.name}. You feel more proficient now.`,
			events: [`Practiced ${spellId} for ${duration}h`],
			timeCost: { type: "minutes", amount: 30 * duration },
			stateChanges: {},
		};
	}

	private _interact(
		itemId: string,
		actionType: string,
		state: GameState,
	): TurnResult {
		const item = state.inventory.items.find((i) => i.id === itemId);
		if (!item) {
			return {
				briefOutput: `You don't have an item with id "${itemId}".`,
				events: [],
				timeCost: { type: "none" },
				stateChanges: {},
			};
		}

		return {
			briefOutput: `You ${actionType} ${item.name}. Something happened!`,
			events: [`${actionType} ${itemId}`],
			timeCost: { type: "minutes", amount: 10 },
			stateChanges: {},
		};
	}

	private _rest(
		duration: number,
		locationId: string | undefined,
		state: GameState,
		registry: Registry,
	): TurnResult {
		const locId = locationId ?? state.currentLocationId;
		const location = registry.getLocation(locId);
		const locName = location?.displayName ?? locId;

		return {
			briefOutput: `You rested for ${duration} hour(s) at ${locName}. You feel refreshed!`,
			events: [`Rested for ${duration} hour(s) at ${locId}`],
			timeCost: { type: "minutes", amount: 60 * duration },
			stateChanges: {},
		};
	}

	private _save(filename: string): TurnResult {
		return {
			briefOutput: `Game saved as '${filename}'.`,
			events: [`Game saved as ${filename}`],
			timeCost: { type: "none" },
			stateChanges: {},
		};
	}

	private _load(filename: string): TurnResult {
		return {
			briefOutput: `Loaded game from '${filename}'.`,
			events: [`Loaded game from ${filename}`],
			timeCost: { type: "none" },
			stateChanges: {},
		};
	}
}

export default TurnResolver;
