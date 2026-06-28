import { TimeCost } from "./TimeCost";

export interface TurnResult {
	briefOutput: string;
	events: string[];
	timeCost: TimeCost;
	stateChanges: {
		currentLocationId?: string;
		newDiscoveredLocationId?: string;
	};
}
