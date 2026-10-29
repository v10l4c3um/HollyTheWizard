import { verifyLlmAvailable } from "../bootstrap/engineFactory";
import { probeOllamaConnection } from "../ai/OllamaClient";

jest.mock("../ai/OllamaClient");

const config = { endpoint: "http://x/api/generate", model: "m" };

describe("verifyLlmAvailable", () => {
	it("fails startup when Ollama is unreachable", async () => {
		(probeOllamaConnection as jest.Mock).mockRejectedValue(
			new Error("connection refused"),
		);
		await expect(verifyLlmAvailable([config])).rejects.toThrow(
			"Startup failed: connection refused at http://x/api/generate",
		);
	});

	it("probes each endpoint+model once", async () => {
		(probeOllamaConnection as jest.Mock).mockReset().mockResolvedValue(undefined);
		await verifyLlmAvailable([config, { ...config }, { ...config, model: "n" }]);
		expect(probeOllamaConnection).toHaveBeenCalledTimes(2);
	});
});
