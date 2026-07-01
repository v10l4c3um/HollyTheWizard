export class Relationship {
	stats = new RelationshipStats();
	memories: string[] = [];
}

export class RelationshipStats {
	trust = 0; // belief in honesty/reliability
	affection = 0; // emotional attachment
	respect = 0; // competence/status
	comfort = 0; // ease around them
	attraction = 0; // romantic/physical interest
	loyalty = 0; // willingness to support
	resentment = 0; // unresolved negative history
	fear = 0; // concern about potential harm
	envy = 0; // desire for what one has

	applyDelta(delta: RelationshipDelta) {
		for (const key of Object.keys(delta) as RelationshipStatId[]) {
			this[key] += delta[key] ?? 0;
			this[key] = Math.max(-100, Math.min(100, this[key]));
		}
	}
}

type RelationshipStatId =
	| "trust"
	| "affection"
	| "respect"
	| "comfort"
	| "attraction"
	| "loyalty"
	| "resentment"
	| "fear"
	| "envy";

export type RelationshipDelta = Partial<Record<RelationshipStatId, number>>;
