import {
	MatchCandidate,
	normalizeName,
	rankCandidates,
} from "../core/engine/EntityMatcher";

const NPCS: MatchCandidate[] = [
	{ id: "professor_snape", names: ["professor_snape", "Professor Snape"] },
	{ id: "hagrid", names: ["hagrid", "Rubeus Hagrid"] },
	{ id: "harry_potter", names: ["harry_potter", "Harry Potter"] },
	{ id: "hermione_granger", names: ["hermione_granger", "Hermione Granger"] },
	{ id: "ron_weasley", names: ["ron_weasley", "Ron Weasley"] },
];

const ids = (query: string, candidates = NPCS) =>
	rankCandidates(query, candidates).map((match) => match.id);

describe("normalizeName", () => {
	it("lowercases, strips accents and punctuation, and treats _ as a space", () => {
		expect(normalizeName("  Séverus_Snape!! ")).toBe("severus snape");
	});
});

describe("rankCandidates", () => {
	it("scores an exact id or full name as 1", () => {
		expect(rankCandidates("hagrid", NPCS)[0]).toEqual({
			id: "hagrid",
			score: 1,
		});
		expect(rankCandidates("Rubeus Hagrid", NPCS)[0]).toEqual({
			id: "hagrid",
			score: 1,
		});
		expect(rankCandidates("HARRY_POTTER", NPCS)[0]).toEqual({
			id: "harry_potter",
			score: 1,
		});
	});

	it("matches a single word of the name", () => {
		expect(ids("Rubeus")).toEqual(["hagrid"]);
		expect(ids("potter")).toEqual(["harry_potter"]);
		expect(rankCandidates("snape", NPCS)[0].score).toBe(0.85);
	});

	it("matches a title that is part of the name", () => {
		expect(ids("professor")).toEqual(["professor_snape"]);
	});

	it("ignores a leading article and honorifics the name lacks", () => {
		expect(ids("the hagrid")).toEqual(["hagrid"]);
		expect(ids("Mr Potter")).toEqual(["harry_potter"]);
	});

	it("returns every candidate that shares the word, so the caller can disambiguate", () => {
		const twins: MatchCandidate[] = [
			{ id: "ron_weasley", names: ["Ron Weasley"] },
			{ id: "percy_weasley", names: ["Percy Weasley"] },
			{ id: "hagrid", names: ["Rubeus Hagrid"] },
		];
		expect(ids("weasley", twins).sort()).toEqual([
			"percy_weasley",
			"ron_weasley",
		]);
	});

	it("tolerates a typo but never scores it as a clear match", () => {
		const [match] = rankCandidates("hermoine", NPCS);
		expect(match.id).toBe("hermione_granger");
		expect(match.score).toBeLessThan(0.85);
	});

	it("returns nothing for text that resembles no one", () => {
		expect(rankCandidates("gandalf", NPCS)).toEqual([]);
		expect(rankCandidates("", NPCS)).toEqual([]);
		expect(rankCandidates("the", NPCS)).toEqual([]);
	});

	it("orders best first", () => {
		const close: MatchCandidate[] = [
			{ id: "john", names: ["John Doe"] },
			{ id: "jon", names: ["Jon Snow"] },
		];
		expect(ids("jon", close)).toEqual(["jon", "john"]);
	});
});

describe("aliases", () => {
	const VOLDEMORT: MatchCandidate = {
		id: "voldemort",
		names: ["voldemort", "Lord Voldemort"],
		aliases: ["The one who shall not be named", "He who must not be named"],
	};
	const WITH_ALIASES = [...NPCS, VOLDEMORT];

	it("matches the whole epithet exactly, with or without the article", () => {
		expect(rankCandidates("the one who shall not be named", WITH_ALIASES)).toEqual([
			{ id: "voldemort", score: 1 },
		]);
		expect(rankCandidates("One Who Shall Not Be Named", WITH_ALIASES)).toEqual([
			{ id: "voldemort", score: 1 },
		]);
	});

	it("never matches on a single word of an epithet", () => {
		expect(rankCandidates("one", WITH_ALIASES)).toEqual([]);
		expect(rankCandidates("named", WITH_ALIASES)).toEqual([]);
		expect(rankCandidates("who", WITH_ALIASES)).toEqual([]);
	});

	it("suggests, but does not clearly match, a mistyped epithet", () => {
		const [match] = rankCandidates("the one who shal not be named", WITH_ALIASES);
		expect(match.id).toBe("voldemort");
		expect(match.score).toBeGreaterThanOrEqual(0.7);
		expect(match.score).toBeLessThan(0.85);
	});

	it("finds a badly spaced misspelling of a name", () => {
		const [match] = rankCandidates("Volan De Mort", WITH_ALIASES);
		expect(match.id).toBe("voldemort");
		expect(match.score).toBeLessThan(0.85);
	});

	it("an epithet shared in words with another does not make them tie", () => {
		const pair: MatchCandidate[] = [
			{ id: "head_boy", names: ["Percy"], aliases: ["the head boy"] },
			{ id: "headmaster", names: ["Albus"], aliases: ["the headmaster"] },
		];
		const matches = rankCandidates("the headmaster", pair);
		expect(matches[0]).toEqual({ id: "headmaster", score: 1 });
		expect(matches.filter((match) => match.score === 1)).toHaveLength(1);
	});
});
