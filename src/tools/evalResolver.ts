/**
 * Manual accuracy check for the resolver against a real local Ollama:
 *   npm run eval:resolver [-- <label>]
 * Runs every phrase in src/test/fixtures/resolver-phrases.json and prints what
 * the resolver produced. Writes results to eval-results/<label>.json so two
 * runs (before / after a change) can be compared. Not part of the jest suite.
 */
import * as fs from "fs";
import * as path from "path";
import GameState from "../core/domain/world/GameState";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import Resolver from "../core/engine/Resolver";
import { DEFAULT_RESOLVER_OLLAMA_CONFIG } from "../ai/OllamaConfig";
import { probeOllamaConnection } from "../ai/OllamaClient";

interface Case {
	input: string;
	at: string;
	expect: Record<string, string>;
}

const ID_KEY: Record<string, string> = {
	MOVE: "destinationId",
	TALK: "npcId",
	STUDY: "subjectId",
	ATTEND_CLASS: "subjectId",
	PRACTICE: "spellId",
};

async function main() {
	const label = process.argv[2] ?? "latest";
	const fixture = JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "..", "test", "fixtures", "resolver-phrases.json"),
			"utf-8",
		),
	) as { cases: Case[] };

	const quiet = (m: "debug" | "warn" | "error" | "log") =>
		jest_free_silence(m);
	for (const m of ["debug", "warn", "error", "log"] as const) quiet(m);

	await probeOllamaConnection(DEFAULT_RESOLVER_OLLAMA_CONFIG);
	const registry = buildRegistry();
	const resolver = new Resolver(DEFAULT_RESOLVER_OLLAMA_CONFIG, registry);
	const bus = createGameBus();

	const results: { input: string; ok: boolean; got: unknown; expect: unknown; ms: number }[] = [];
	for (const testCase of fixture.cases) {
		const state = new GameState();
		applyEffects(state, arrivalEffects(registry, state, testCase.at), bus);
		const started = Date.now();
		const got = await resolveWith(resolver, testCase.input, registry, state);
		const ok = Object.entries(testCase.expect).every(
			([key, value]) => (got as any)[key] === value,
		);
		results.push({ input: testCase.input, ok, got, expect: testCase.expect, ms: Date.now() - started });
		console.info(`${ok ? "PASS" : "FAIL"}  [${testCase.at}] ${testCase.input}${ok ? "" : `\n      expected ${JSON.stringify(testCase.expect)}\n      got      ${JSON.stringify(got)}`}`);
	}

	const byType: Record<string, { pass: number; total: number }> = {};
	for (const r of results) {
		const type = (r.expect as any).type;
		byType[type] ??= { pass: 0, total: 0 };
		byType[type].total++;
		if (r.ok) byType[type].pass++;
	}
	const pass = results.filter((r) => r.ok).length;
	console.info(`\n${label}: ${pass}/${results.length} correct`);
	for (const [type, { pass: p, total }] of Object.entries(byType)) {
		console.info(`  ${type.padEnd(13)} ${p}/${total}`);
	}
	fs.mkdirSync("eval-results", { recursive: true });
	fs.writeFileSync(path.join("eval-results", `${label}.json`), JSON.stringify(results, null, 2));
	void ID_KEY;
}

/** Calls `resolve`, passing the world view once the resolver supports it. */
async function resolveWith(
	resolver: Resolver,
	input: string,
	registry: ReturnType<typeof buildRegistry>,
	state: GameState,
) {
	let view: unknown;
	try {
		const { buildWorldView } = require("../core/engine/WorldView");
		view = buildWorldView(registry, state);
	} catch {
		view = undefined;
	}
	return (resolver as any).resolve(input, view);
}

function jest_free_silence(method: "debug" | "warn" | "error" | "log") {
	(console as any)[method] = () => {};
}

main().catch((error) => {
	console.info("eval failed:", error);
	process.exit(1);
});
