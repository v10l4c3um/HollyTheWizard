export interface RenderContext {
	briefOutput: string;
	playerName: string;
	locationName: string;
	locationDescription: string;
	timeOfDay: string;
	/** Calendar day, from 1. */
	day: number;
	weekday: string;
	nearbyNPCNames: string[];
	recentEvents: string[];
	narrationMode: string;
	timePassed?: {
		minutes: number;
		beforeTimeOfDay: string;
		afterTimeOfDay: string;
	};
}
