import GameState from "../domain/world/GameState";
import { GameBus, GameEvents } from "../domain/events/GameEvents";
import { QUEST_FLAG_EVENTS, QuestFlagEventName, QuestFlagEvents } from "../domain/campaign/QuestFlags";
import { applyEffects } from "../domain/effects/EffectApplier";
import { Logger, silentLogger } from "../application/ports/Logger";

/**
 * Turns the events that mean story progress into quest flags. A listener never
 * writes state: it asks `QUEST_FLAG_EVENTS` for effects and applies them with
 * `applyEffects`. The state is read through `getState` at the moment of the
 * event, so a turn's working copy, a load or an undo are all followed.
 */
export class ProgressionTracker {
	constructor(
		private bus: GameBus,
		private getState: () => GameState,
		private logger: Logger = silentLogger,
	) {
		for (const name of Object.keys(QUEST_FLAG_EVENTS) as QuestFlagEventName[]) {
			this.track(name);
		}
	}

	private track<K extends QuestFlagEventName>(name: K): void {
		const toEffects: QuestFlagEvents[K] = QUEST_FLAG_EVENTS[name];
		this.bus.on(name, (payload: GameEvents[K]) => {
			applyEffects(this.getState(), toEffects(payload), this.bus, this.logger);
		});
	}
}
