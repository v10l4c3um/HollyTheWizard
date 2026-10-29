import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileLogger } from "../infrastructure/logging/FileLogger";
import { InvalidSaveError } from "../core/application/ports/InvalidSaveError";
import Resolver from "../core/engine/Resolver";
import Renderer from "../core/engine/Renderer";
import { collectingLogger } from "./helpers/collectingLogger";

describe("logging stays off the terminal", () => {
	it("a resolver, renderer or client given no logger writes nothing to the console", async () => {
		const spies = (["log", "debug", "info", "warn", "error"] as const).map((m) =>
			jest.spyOn(console, m).mockImplementation(),
		);
		const originalFetch = global.fetch;
		global.fetch = jest.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED")) as never;
		try {
			const config = { endpoint: "http://x/api/generate", model: "m" };
			await new Resolver(config).resolve("go somewhere");
			await new Renderer(config).render({
				briefOutput: "x", playerName: "p", locationName: "l", locationDescription: "d",
				timeOfDay: "morning", day: 1, weekday: "monday", nearbyNPCNames: [], recentEvents: [],
				narrationMode: "default",
			});
			spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
		} finally {
			global.fetch = originalFetch;
			spies.forEach((spy) => spy.mockRestore());
		}
	}, 30000);

	it("a resolver reports a failure to the logger it was given", async () => {
		const originalFetch = global.fetch;
		global.fetch = jest.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED")) as never;
		const logs = collectingLogger();
		try {
			await new Resolver({ endpoint: "http://x/api/generate", model: "m" }, undefined, logs).resolve("go somewhere");
			expect(logs.at("error").some((m) => m.includes("Failed to resolve"))).toBe(true);
			expect(logs.at("warn").some((m) => m.includes("attempt"))).toBe(true);
		} finally {
			global.fetch = originalFetch;
		}
	}, 30000);
});

describe("FileLogger", () => {
	let dir: string;
	let file: string;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "holly-log-"));
		file = path.join(dir, "nested", "game.log");
	});
	afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
	const text = () => fs.readFileSync(file, "utf-8");

	it("writes each level on its own line with a timestamp, creating the folder", () => {
		const logger = new FileLogger(file);
		logger.debug("parsed it");
		logger.warn("retrying");
		logger.error("gave up");
		const lines = text().trim().split("\n");
		expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z DEBUG parsed it$/);
		expect(lines[1]).toMatch(/WARN\s+retrying$/);
		expect(lines[2]).toMatch(/ERROR gave up$/);
	});

	it("keeps the detail: an error's stack, an object as JSON, a save's problems", () => {
		const logger = new FileLogger(file);
		logger.error("failed", new Error("disk full"));
		logger.debug("body", { model: "m" });
		logger.error("bad save", new InvalidSaveError("s", ["a is missing", "b is wrong"]));
		const out = text();
		expect(out).toContain("Error: disk full");
		expect(out).toContain('"model": "m"');
		expect(out).toContain("- a is missing");
		expect(out).toContain("- b is wrong");
	});

	it("can skip the chatty levels", () => {
		const logger = new FileLogger(file, "warn");
		logger.debug("noise");
		logger.warn("kept");
		expect(text()).not.toContain("noise");
		expect(text()).toContain("kept");
	});

	it("never throws, even when it cannot write", () => {
		fs.writeFileSync(path.join(dir, "blocker"), "x");
		const logger = new FileLogger(path.join(dir, "blocker", "game.log"));
		expect(() => logger.error("nowhere to go")).not.toThrow();
	});
});
