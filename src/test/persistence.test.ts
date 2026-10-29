import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import GameState from "../core/domain/world/GameState";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import {
	AttributeStats,
	ResourceStats,
} from "../core/domain/player/PlayerStats";
import { JsonPersistenceRepository } from "../infrastructure/persistence/json/JsonPersistenceRepository";

describe("JsonPersistenceRepository", () => {
	let SAVES_DIR: string;
	let repository: JsonPersistenceRepository;

	beforeEach(async () => {
		// Each test gets its own directory; the real saves/ folder is never touched.
		// The repository creates the directory on first save, so use a
		// not-yet-existing subfolder to keep the "creates saves directory" test honest.
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "holly-saves-"));
		SAVES_DIR = path.join(root, "saves");
		repository = new JsonPersistenceRepository(SAVES_DIR);
	});

	afterEach(async () => {
		await fs.rm(path.dirname(SAVES_DIR), { recursive: true, force: true });
	});

	describe("save()", () => {
		it("saves a GameState to a file with specified filename", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const state = new GameState();
			state.currentLocationId = "forest";
			state.worldClock.advanceTime(125);

			await repository.save(testFilename, state);

			// Verify file was created
			const filePath = path.join(SAVES_DIR, `${testFilename}.json`);
			const exists = await fs
				.stat(filePath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);
		});

		it("saves a GameState to default location when no filename provided", async () => {
			const state = new GameState();
			state.currentLocationId = "startingVillage";
			state.worldClock.advanceTime(60);

			await repository.save("autosave", state);

			// Verify file was created at default location
			const filePath = path.join(SAVES_DIR, "autosave.json");
			const exists = await fs
				.stat(filePath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(true);
		});

		it("sanitizes special characters in filename", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const unsafeFilename = `../../../etc/passwd`;
			const state = new GameState();

			// Should not throw and should sanitize the filename
			await repository.save(unsafeFilename, state);

			// Verify file was saved in safe location
			const files = await fs.readdir(SAVES_DIR);
			expect(files.some((f) => f.includes(".."))).toBe(false);
		});

		// it("rejects empty filenames after sanitization", async () => {
		// 	const state = new GameState();

		// 	// Using just the extension or path separators that all get stripped results in empty name
		// 	const unsafeFilename = "";

		// 	// Empty filename after sanitization should throw
		// 	expect(() => {
		// 		const repository = new JsonPersistenceRepository();
		// 		// Call private method via type casting for testing edge case
		// 		(repository as any)._resolveFilePath(unsafeFilename);
		// 	}).toThrow("Invalid save filename");
		// });

		it("creates saves directory if it doesn't exist", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const state = new GameState();

			await repository.save(testFilename, state);

			// Verify directory exists
			const stats = await fs
				.stat(SAVES_DIR)
				.then(() => true)
				.catch(() => false);
			expect(stats).toBe(true);
		});

		it("preserves GameState data correctly", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const state = new GameState();
			state.currentLocationId = "forest";
			state.worldClock.advanceTime(125);
			state.spellbook.setSpellState("test_spell", {
				spellId: "test_spell",
				knowledgeState: "learned",
				proficiency: 0.5,
				practiceAttempts: 2,
				successfulCasts: 1,
			} as any);

			await repository.save(testFilename, state);

			// Read the saved file and verify content
			const filePath = path.join(SAVES_DIR, `${testFilename}.json`);
			const json = await fs.readFile(filePath, "utf-8");
			const data = JSON.parse(json);

			expect(data.currentLocationId).toBe("forest");
			expect(data.spellbook).toBeDefined();
		});
	});

	describe("exists()", () => {
		it("is false before a save and true after, for the same sanitized name", async () => {
			expect(await repository.exists("slot1")).toBe(false);
			await repository.save("slot1", new GameState());
			expect(await repository.exists("slot1")).toBe(true);
			expect(await repository.exists("other")).toBe(false);
		});
	});

	describe("load()", () => {
		it("loads a GameState from a file", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const originalState = new GameState();
			originalState.currentLocationId = "forest";
			originalState.worldClock.advanceTime(125);

			await repository.save(testFilename, originalState);
			const loadedState = await repository.load(testFilename);

			expect(loadedState.currentLocationId).toBe("forest");
			expect(loadedState.worldClock.getMinutesOfDay()).toBe(
				originalState.worldClock.getMinutesOfDay(),
			);
		});

		it("loads from default location when no filename provided", async () => {
			const originalState = new GameState();
			originalState.currentLocationId = "startingVillage";
			originalState.worldClock.advanceTime(60);

			await repository.save("autosave", originalState);
			const loadedState = await repository.load("autosave");

			expect(loadedState.currentLocationId).toBe("startingVillage");
		});

		it("rehydrates class instances correctly", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const state = new GameState();
			state.spellbook.setSpellState("test_spell", {
				spellId: "test_spell",
				knowledgeState: "learned",
				proficiency: 0.5,
				practiceAttempts: 2,
				successfulCasts: 1,
			} as any);

			await repository.save(testFilename, state);
			const loaded = await repository.load(testFilename);

			expect(
				loaded.spellbook.getSpellState("test_spell")?.knowledgeState,
			).toBe("learned");
		});

		it("rehydrates the player's stats as working instances", async () => {
			const state = new GameState();
			state.player.name = "Holly";
			state.player.attributes.applyDelta({ INT: 3, WIL: 1 });
			state.player.resources.applyDelta({ energy: -30, injured: true });

			await repository.save("player-stats", state);
			const loaded = await repository.load("player-stats");

			expect(loaded.player.name).toBe("Holly");
			expect(loaded.player.attributes).toBeInstanceOf(AttributeStats);
			expect(loaded.player.attributes.get("INT")).toBe(3);
			expect(loaded.player.resources).toBeInstanceOf(ResourceStats);
			expect(loaded.player.resources.energy).toBe(70);
			expect(loaded.player.resources.injured).toBe(true);

			loaded.player.attributes.applyDelta({ INT: 1 });
			loaded.player.resources.applyDelta({ energy: 5 });
			expect(loaded.player.attributes.get("INT")).toBe(4);
			expect(loaded.player.resources.energy).toBe(75);
		});

		it("rehydrates relationships as working instances", async () => {
			const state = new GameState();
			state.relationships["hagrid"] = new RelationshipStats();
			state.relationships["hagrid"].applyDelta({ trust: 4, comfort: 2 });

			await repository.save("relationships", state);
			const loaded = await repository.load("relationships");

			const hagrid = loaded.relationships["hagrid"];
			expect(hagrid).toBeInstanceOf(RelationshipStats);
			expect(hagrid.trust).toBe(4);
			hagrid.applyDelta({ trust: 1 });
			expect(hagrid.trust).toBe(5);
		});

		it("fills in attributes and resources missing from a save", async () => {
			const state = new GameState();
			await repository.save("sparse", state);
			const file = path.join(SAVES_DIR, "sparse.json");
			const data = JSON.parse(await fs.readFile(file, "utf-8"));
			data.player.attributes = { values: { INT: 7 } };
			delete data.player.resources;
			await fs.writeFile(file, JSON.stringify(data), "utf-8");

			const loaded = await repository.load("sparse");

			expect(loaded.player.attributes.get("INT")).toBe(7);
			expect(loaded.player.attributes.get("WIL")).toBe(0);
			expect(loaded.player.resources.energy).toBe(100);
		});

		it("keeps the calendar day through a save", async () => {
			const state = new GameState();
			state.worldClock.advanceTime(2 * 1440 + 90); // day 3

			await repository.save("calendar", state);
			const loaded = await repository.load("calendar");

			expect(loaded.worldClock.getDay()).toBe(3);
			expect(loaded.worldClock.getWeekday()).toBe("wednesday");
			expect(loaded.worldClock.getTotalMinutes()).toBe(
				state.worldClock.getTotalMinutes(),
			);
		});

		it("loads a save from before the calendar existed", async () => {
			const state = new GameState();
			await repository.save("legacy", state);
			const file = path.join(SAVES_DIR, "legacy.json");
			const data = JSON.parse(await fs.readFile(file, "utf-8"));
			data.worldClock = { minutesOfDay: 600 };
			await fs.writeFile(file, JSON.stringify(data), "utf-8");

			const loaded = await repository.load("legacy");

			expect(loaded.worldClock.getDay()).toBe(1);
			expect(loaded.worldClock.getMinutesOfDay()).toBe(600);
		});

		it("throws when loading non-existent file", async () => {
			const nonExistentFilename = `test-save-nonexistent-${Date.now()}`;

			await expect(
				repository.load(nonExistentFilename),
			).rejects.toThrow();
		});
	});

	describe("round-trip", () => {
		it("preserves all GameState data through save and load cycle", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const originalState = new GameState();
			originalState.currentLocationId = "forest";
			originalState.worldClock.advanceTime(125);
			originalState.spellbook.setSpellState("test_spell", {
				spellId: "test_spell",
				knowledgeState: "learned",
				proficiency: 0.5,
				practiceAttempts: 2,
				successfulCasts: 1,
			} as any);

			await repository.save(testFilename, originalState);
			const loadedState = await repository.load(testFilename);

			expect(loadedState.currentLocationId).toBe("forest");
			expect(loadedState.worldClock.getMinutesOfDay()).toBe(
				originalState.worldClock.getMinutesOfDay(),
			);
			expect(
				loadedState.spellbook.getSpellState("test_spell")
					?.knowledgeState,
			).toBe("learned");
		});

		it("supports saving multiple independent game states", async () => {
			const state1 = new GameState();
			state1.currentLocationId = "forest";

			const state2 = new GameState();
			state2.currentLocationId = "library";

			const filename1 = `test-save-1-${Date.now()}`;
			const filename2 = `test-save-2-${Date.now()}`;

			await repository.save(filename1, state1);
			await repository.save(filename2, state2);

			const loaded1 = await repository.load(filename1);
			const loaded2 = await repository.load(filename2);

			expect(loaded1.currentLocationId).toBe("forest");
			expect(loaded2.currentLocationId).toBe("library");
		});

		it("overwrites existing save file when saving with same filename", async () => {
			const testFilename = `test-save-${Date.now()}`;

			const state1 = new GameState();
			state1.currentLocationId = "forest";

			const state2 = new GameState();
			state2.currentLocationId = "library";

			await repository.save(testFilename, state1);
			await repository.save(testFilename, state2);

			const loaded = await repository.load(testFilename);
			expect(loaded.currentLocationId).toBe("library");
		});
	});

	describe("file format", () => {
		it("saves as formatted JSON", async () => {
			const testFilename = `test-save-${Date.now()}`;
			const state = new GameState();

			await repository.save(testFilename, state);

			const filePath = path.join(SAVES_DIR, `${testFilename}.json`);
			const content = await fs.readFile(filePath, "utf-8");

			// Verify it's formatted JSON (should have newlines and indentation)
			expect(content).toMatch(/\n/);
			expect(content).toMatch(/\s{2}/);

			// Verify it parses correctly
			expect(() => JSON.parse(content)).not.toThrow();
		});
	});
});
