class Location {
	id: string;
	displayName: string;
	description: string;
	connectedLocationsIds: string[];

	// TODO: affiliations as an array of fraction-number pairs, like [{faction: "magesGuild", influence: 0.8}, {faction: "thievesGuild", influence: 0.2}]

	// TODO: maybe items available to loot

	// maybe allow possible expansions, or restrictions on what can be done in this location, like "no magic" or "only combat actions allowed"

	constructor() {
		this.id = "defaultLocation";
		this.displayName = "Default Location";
		this.description =
			"This is the default location. It has no special features.";
		this.connectedLocationsIds = [];
	}
}

export default Location;
