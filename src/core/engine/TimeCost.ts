export type TimeCost =
	| { type: "none" }
	| { type: "minutes"; amount: number };
