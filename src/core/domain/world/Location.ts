import { z } from "zod";

/** The shape of a place in a content pack; the `Location` class is built from it. */
export const LocationSchema = z.strictObject({
	id: z.string().min(1),
	displayName: z.string().min(1),
	description: z.string(),
	connectedLocationsIds: z.array(z.string()),
	/** Other names players use for the place ("the hut", "outside"). */
	aliases: z.array(z.string()).default([]),
	/** Nobody overhears here, so conversations can go further. */
	private: z.boolean().default(false),
});

export type LocationData = z.infer<typeof LocationSchema>;

class Location {
	id: string;
	displayName: string;
	description: string;
	connectedLocationsIds: string[];
	/** Other names players use for the place; matched as whole phrases. */
	aliases: string[];
	/** A place where you can speak freely: nobody overhears (changes how conversations go). */
	isPrivate: boolean;

	// TODO: affiliations as an array of fraction-number pairs, like [{faction: "magesGuild", influence: 0.8}, {faction: "thievesGuild", influence: 0.2}]

	// TODO: maybe items available to loot

	// maybe allow possible expansions, or restrictions on what can be done in this location, like "no magic" or "only combat actions allowed"

	constructor(
		id: string,
		displayName: string,
		description: string,
		connectedLocations: string[],
		aliases: string[] = [],
		isPrivate: boolean = false,
	) {
		this.id = id;
		this.displayName = displayName;
		this.description = description;
		this.connectedLocationsIds = connectedLocations;
		this.aliases = aliases;
		this.isPrivate = isPrivate;
	}
}

export default Location;
