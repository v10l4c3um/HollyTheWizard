export interface TurnResult {
	briefOutput: string;
	events: string[];
	stateChanges: {
		currentLocationId?: string;
		newDiscoveredLocationId?: string;
	};
}
