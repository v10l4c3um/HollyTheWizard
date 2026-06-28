class Location {
	id: string;
	displayName: string;
	description: string;
	connectedLocations: string[];

	// TODO: affiliations as an array of fraction-number pairs, like [{faction: "magesGuild", influence: 0.8}, {faction: "thievesGuild", influence: 0.2}]

	// TODO: maybe items available to loot

	// maybe allow possible expansions, or restrictions on what can be done in this location, like "no magic" or "only combat actions allowed"

	constructor(
		id: string,
		displayName: string,
		description: string,
		connectedLocations: string[],
	) {
		this.id = id;
		this.displayName = displayName;
		this.description = description;
		this.connectedLocations = connectedLocations;
	}
}

export default Location;
