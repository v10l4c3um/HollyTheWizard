import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import GameState from "../core/domain/world/GameState";
import { InvalidSaveError } from "../core/application/ports/InvalidSaveError";
import { JsonPersistenceRepository } from "../infrastructure/persistence/json/JsonPersistenceRepository";

describe("the save format is strict", () => {
	let dir: string;
	let repository: JsonPersistenceRepository;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "holly-format-"));
		repository = new JsonPersistenceRepository(dir);
	});
	afterEach(() => fs.rm(dir, { recursive: true, force: true }));

	const file = (name: string) => path.join(dir, `${name}.json`);
	const readSave = async (name: string) =>
		JSON.parse(await fs.readFile(file(name), "utf-8"));
	const writeSave = (name: string, data: unknown) =>
		fs.writeFile(file(name), JSON.stringify(data), "utf-8");

	/** Saves a valid state, lets `damage` break the JSON, and returns the load error. */
	async function loadDamaged(damage: (data: any) => void): Promise<InvalidSaveError> {
		await repository.save("s", new GameState());
		const data = await readSave("s");
		damage(data);
		await writeSave("s", data);
		const error = await repository.load("s").then(
			() => undefined,
			(e) => e,
		);
		expect(error).toBeInstanceOf(InvalidSaveError);
		return error;
	}

	it("writes the format version into the save", async () => {
		await repository.save("s", new GameState());
		expect((await readSave("s")).metadata.saveVersion).toBe("2");
	});

	it("round-trips a valid save", async () => {
		const state = new GameState();
		state.currentLocationId = "hallway";
		await repository.save("s", state);
		expect((await repository.load("s")).currentLocationId).toBe("hallway");
	});

	it("refuses a save from another format version", async () => {
		const error = await loadDamaged((d) => (d.metadata.saveVersion = "1"));
		expect(error.problems.join()).toContain("metadata.saveVersion");
	});

	it("refuses a turn in the history that is missing its command", async () => {
		const error = await loadDamaged((d) => d.recentTurns.push({ input: "x", fromLocationId: "a" }));
		expect(error.problems.join()).toContain("recentTurns");
	});

	it("refuses a save with no version at all (an old save)", async () => {
		const error = await loadDamaged((d) => delete d.metadata);
		expect(error.problems.join()).toContain("metadata");
	});

	it.each([
		"worldClock",
		"currentLocationId",
		"visitedLocationIds",
		"discoveredLocationIds",
		"questFlags",
		"spellbook",
		"academicState",
		"yearProgress",
		"yearBlueprints",
		"player",
		"knownNPCIds",
		"recentEvents",
		"recentTurns",
		"settings",
	])("refuses a save missing %s and names it", async (field) => {
		const error = await loadDamaged((d) => delete d[field]);
		expect(error.problems.join()).toContain(field);
		expect(error.message).toContain("can't be used");
	});

	it("refuses a nested part that is missing", async () => {
		const error = await loadDamaged((d) => delete d.player.attributes.values.WIL);
		expect(error.problems.join()).toContain("player.attributes.values.WIL");
	});

	it("refuses a wrong-typed part", async () => {
		const error = await loadDamaged((d) => (d.worldClock.totalMinutes = "soon"));
		expect(error.problems.join()).toContain("worldClock.totalMinutes");
	});

	it("refuses an old-format clock", async () => {
		const error = await loadDamaged((d) => (d.worldClock = { minutesOfDay: 600 }));
		expect(error.problems.join()).toContain("worldClock.totalMinutes");
	});

	it("refuses a file that is not JSON", async () => {
		await fs.writeFile(file("junk"), "{ not json", "utf-8");
		await expect(repository.load("junk")).rejects.toThrow(InvalidSaveError);
	});

	it("a missing file is still a plain error, not an invalid save", async () => {
		const error = await repository.load("nothing").then(
			() => undefined,
			(e) => e,
		);
		expect(error).toBeDefined();
		expect(error).not.toBeInstanceOf(InvalidSaveError);
	});
});
