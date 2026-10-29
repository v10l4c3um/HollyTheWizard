/**
 * Fuzzy lookup of free text (what the model extracted from the player's
 * input) against a list of known entities. Pure and dependency-free.
 *
 * It only ranks; the caller decides what to do with the result: accept a
 * single clear match, or ask the model to choose among a short list.
 */

export interface MatchCandidate {
	id: string;
	/** Every spelling worth matching: the id, the display name, nicknames. */
	names: string[];
	/**
	 * Epithets ("the boy who lived"). Matched as whole phrases only, never by
	 * one of their words, so a common word can't pull in the wrong candidate.
	 */
	aliases?: string[];
}

export interface RankedMatch {
	id: string;
	score: number;
}

/** Below this a candidate is not worth showing. */
export const MATCH_THRESHOLD = 0.7;
/** At or above this a match is a name, not a guess. Typos never reach it. */
export const CLEAR_MATCH_SCORE = 0.85;

const ARTICLES = new Set(["the", "a", "an"]);
const HONORIFICS = new Set(["mr", "mrs", "ms", "miss", "sir", "madam", "lord", "lady", "dr"]);

export function normalizeName(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * Scores per candidate (best of its names and aliases):
 *   1.00  the whole text is the id, a full name or a whole alias
 *   0.85  every word of the text is a word of a name ("Rubeus", "Weasley");
 *         never for aliases
 *   <0.85 typo-tolerant similarity, kept at or above MATCH_THRESHOLD
 * Returns matches best first.
 */
export function rankCandidates(
	query: string,
	candidates: MatchCandidate[],
): RankedMatch[] {
	const words = queryWords(query);
	if (words.length === 0) return [];
	const text = words.join(" ");

	const matches: RankedMatch[] = [];
	for (const candidate of candidates) {
		const score = Math.max(
			...candidate.names.map((name) => scoreName(text, words, name)),
			...(candidate.aliases ?? []).map((alias) => scoreAlias(text, alias)),
		);
		if (score >= MATCH_THRESHOLD) {
			matches.push({ id: candidate.id, score });
		}
	}
	return matches.sort((a, b) => b.score - a.score);
}

function queryWords(query: string): string[] {
	let words = normalizeName(query)
		.split(" ")
		.filter((word) => word !== "" && !ARTICLES.has(word));
	if (words.length > 1) {
		// "Mr Potter": drop honorifics, but only when something else remains.
		words = words.filter((word) => !HONORIFICS.has(word));
	}
	return words;
}

function scoreName(text: string, words: string[], rawName: string): number {
	const name = normalizeName(rawName);
	if (name === "") return 0;
	if (text === name) return 1;

	const nameWords = name.split(" ");
	if (words.every((word) => nameWords.includes(word))) return CLEAR_MATCH_SCORE;

	const similarity = Math.max(
		similarityOf(text, name),
		...nameWords.map((nameWord) => similarityOf(text, nameWord)),
	);
	// A fuzzy hit is a suggestion; it must never look like a clear match.
	return Math.min(similarity, CLEAR_MATCH_SCORE - 0.01);
}

function scoreAlias(text: string, rawAlias: string): number {
	const alias = queryWords(rawAlias).join(" ");
	if (alias === "") return 0;
	if (text === alias) return 1;
	return Math.min(similarityOf(text, alias), CLEAR_MATCH_SCORE - 0.01);
}

/** Edit-distance similarity, also tried with spaces removed ("Volan De Mort"). */
function similarityOf(a: string, b: string): number {
	return Math.max(plainSimilarity(a, b), plainSimilarity(squash(a), squash(b)));
}

function squash(text: string): string {
	return text.replace(/ /g, "");
}

function plainSimilarity(a: string, b: string): number {
	const longest = Math.max(a.length, b.length);
	return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

function editDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				previous[j] + 1,
				current[j - 1] + 1,
				previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length];
}
