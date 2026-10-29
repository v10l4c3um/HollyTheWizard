/**
 * Thrown when game content is missing, malformed or inconsistent. Carries
 * every problem found, so one run shows everything that needs fixing.
 */
export class ContentError extends Error {
	constructor(public readonly problems: string[]) {
		super(
			`Invalid game content (${problems.length} problem${problems.length === 1 ? "" : "s"}):\n${problems
				.map((problem) => `  - ${problem}`)
				.join("\n")}`,
		);
		this.name = "ContentError";
	}
}
