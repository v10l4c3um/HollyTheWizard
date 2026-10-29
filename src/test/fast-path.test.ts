import { parseFastPath } from "../core/engine/FastPath";

const save = (filename: string) => ({ type: "SAVE", filename });
const load = (filename: string) => ({ type: "LOAD", filename });

describe("parseFastPath", () => {
	it.each([
		["save", save("quicksave")],
		["Save game", save("quicksave")],
		["  save  ", save("quicksave")],
		["save mygame", save("mygame")],
		["SAVE MyGame", save("MyGame")],
		["save as boss_fight", save("boss_fight")],
		["save game to slot-2", save("slot-2")],
		["load autosave", load("autosave")],
		["LOAD autosave", load("autosave")],
		["load game from slot1", load("slot1")],
		["load from slot1", load("slot1")],
	])("parses %j", (input, expected) => {
		expect(parseFastPath(input)).toEqual(expected);
	});

	it("loads quicksave first, then autosave, for a bare load", () => {
		for (const input of ["load", "Load game"]) {
			expect(parseFastPath(input)).toEqual({
				type: "LOAD",
				filename: "quicksave",
				fallbackFilename: "autosave",
			});
		}
	});

	it.each([
		"save the day",
		"load up on potions",
		"save hagrid please",
		"save as",
		"load from",
		"load a b",
		"saved",
		"loading",
		"please save",
		"save ../secret",
		"save my/game",
		"load game from a b",
		"go to the library",
		"",
		"   ",
	])("leaves %j to the language model", (input) => {
		expect(parseFastPath(input)).toBeNull();
	});
});
