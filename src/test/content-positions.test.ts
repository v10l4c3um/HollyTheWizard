import { z } from "zod";
import { readContentFileLocated } from "../core/content/readContentFile";
import { tempDir } from "./helpers/contentFixtures";

const Schema = z.strictObject({
	name: z.string(),
	items: z.array(z.strictObject({ id: z.string(), count: z.number() })),
});

describe("content errors point at the line and column", () => {
	const dir = tempDir();
	afterAll(() => dir.remove());

	const read = (text: string) => {
		dir.write("f.json", text);
		const problems: string[] = [];
		const file = readContentFileLocated(`${dir.dir}/f.json`, Schema, problems, dir.dir);
		return { file, problems };
	};

	it("a wrong type is reported where the value is", () => {
		const { problems } = read('{\n  "name": "x",\n  "items": [\n    { "id": "a", "count": "two" }\n  ]\n}');
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/^f\.json:4:27: items\.0\.count: /);
	});

	it("an unknown key is reported at the key", () => {
		const { problems } = read('{\n  "name": "x",\n  "items": [],\n  "oops": 1\n}');
		expect(problems[0]).toMatch(/^f\.json:4:3: \(root\): /);
		expect(problems[0]).toContain("oops");
	});

	it("a missing key is reported where its object starts", () => {
		const { problems } = read('{\n  "name": "x",\n  "items": [\n    { "id": "a" }\n  ]\n}');
		expect(problems[0]).toMatch(/^f\.json:4:5: items\.0\.count: /);
	});

	it("a syntax error has a position and a reason", () => {
		const { problems } = read('{\n  "name": "x",\n  "items": [,]\n}');
		expect(problems[0]).toMatch(/^f\.json:3:\d+: not valid JSON \(/);
	});

	it("trailing commas and comments are not accepted", () => {
		expect(read('{ "name": "x", "items": [], }').problems[0]).toContain("not valid JSON");
		expect(read('{ // hi\n "name": "x", "items": [] }').problems[0]).toContain("not valid JSON");
	});

	it("valid data comes back with a locator", () => {
		const { file, problems } = read('{\n  "name": "x",\n  "items": []\n}');
		expect(problems).toEqual([]);
		expect(file?.data.name).toBe("x");
		expect(file?.locate(["name"])).toEqual({ line: 2, col: 11 });
	});
});
