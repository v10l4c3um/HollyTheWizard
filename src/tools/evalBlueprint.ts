/**
 * Manual check of blueprint generation against a real local Ollama:
 *   npm run eval:blueprint [-- <label> [<runs>]]
 * Generates <runs> campaign blueprints and the year-1 blueprint after each, and
 * reports how often the model's FIRST reply was already valid (one request),
 * how often it needed the repair pass (two requests), and how often it failed.
 * Not part of the jest suite.
 */
import GameState from "../core/domain/world/GameState";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { DEFAULT_BLUEPRINT_OLLAMA_CONFIG } from "../ai/OllamaConfig";
import { probeOllamaConnection } from "../ai/OllamaClient";
import { BlueprintLLMProvider } from "../ai/providers/BlueprintLLMProvider";
import { GenerateCampaignBlueprint } from "../core/application/use-cases/GenerateCampaignBlueprint";
import { GenerateYearBlueprint } from "../core/application/use-cases/GenerateYearBlueprint";

type Outcome = "first-try" | "after-repair" | "failed";

async function main() {
	const label = process.argv[2] ?? "latest";
	const runs = Number(process.argv[3] ?? 6);

	await probeOllamaConnection(DEFAULT_BLUEPRINT_OLLAMA_CONFIG);

	// Count the requests each generation makes: 1 = valid first time, 2 = repaired.
	const realFetch = global.fetch;
	let requests = 0;
	global.fetch = ((...args: Parameters<typeof fetch>) => {
		requests++;
		return realFetch(...args);
	}) as typeof fetch;

	const registry = buildRegistry();
	const bus = createGameBus();
	const provider = new BlueprintLLMProvider(DEFAULT_BLUEPRINT_OLLAMA_CONFIG);
	const campaign = new GenerateCampaignBlueprint(provider, registry, bus, false);
	const year = new GenerateYearBlueprint(provider, registry, bus, false);

	const results: Record<"campaign" | "year", Outcome[]> = { campaign: [], year: [] };
	const times: number[] = [];

	for (let i = 0; i < runs; i++) {
		const state = new GameState();

		requests = 0;
		let started = Date.now();
		let base;
		try {
			base = await campaign.execute(`eval-${label}-${i}-${Date.now()}`);
			results.campaign.push(requests === 1 ? "first-try" : "after-repair");
		} catch {
			results.campaign.push("failed");
		}
		times.push(Date.now() - started);
		console.info(`campaign ${i + 1}/${runs}: ${results.campaign[i]} (${requests} request(s), ${Date.now() - started} ms)`);
		if (!base) {
			results.year.push("failed");
			continue;
		}

		requests = 0;
		started = Date.now();
		try {
			await year.execute(1, base, state);
			results.year.push(requests === 1 ? "first-try" : "after-repair");
		} catch {
			results.year.push("failed");
		}
		times.push(Date.now() - started);
		console.info(`year     ${i + 1}/${runs}: ${results.year[results.year.length - 1]} (${requests} request(s), ${Date.now() - started} ms)`);
	}

	global.fetch = realFetch;
	console.info(`\n${label}: ${runs} runs`);
	for (const kind of ["campaign", "year"] as const) {
		const count = (o: Outcome) => results[kind].filter((r) => r === o).length;
		console.info(
			`  ${kind.padEnd(9)} first-try ${count("first-try")}  after-repair ${count("after-repair")}  failed ${count("failed")}`,
		);
	}
	const avg = Math.round(times.reduce((a, b) => a + b, 0) / Math.max(times.length, 1));
	console.info(`  average ${avg} ms per generation`);
}

main().catch((error) => {
	console.info("eval failed:", error);
	process.exit(1);
});
