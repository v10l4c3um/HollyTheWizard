export interface TurnResult {
	output: string;
	events: string[];
	stateChanges: {
		currentLocationId?: string;
		newDiscoveredLocationId?: string;
	};
}
