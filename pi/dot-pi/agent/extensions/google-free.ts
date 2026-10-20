import {
	createProvider,
	envApiKeyAuth,
	getModels as getBuiltinModels,
	googleGenerativeAIApi,
	type Api,
	type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "google-free";
const SOURCE_PROVIDER_ID = "google";

/**
 * Mirrors the built-in `google` provider under `google-free` so a second
 * (free-tier) API key can be used without duplicating the model list.
 *
 * Models are read from the live model registry on every read, so catalog
 * updates (pi updates, pi.dev remote catalog refreshes, and models.json
 * overrides for `google`) are reflected automatically.
 */
export default function (pi: ExtensionAPI) {
	let liveModels: (() => readonly Model<Api>[]) | undefined;

	// session_start is the earliest point that exposes the model registry.
	pi.on("session_start", (_event, ctx) => {
		liveModels = () => ctx.modelRegistry.getModelsOfType("chat", SOURCE_PROVIDER_ID);
	});

	const mirror = (): Model<Api>[] => {
		let source: readonly Model<Api>[] = [];
		try {
			source = liveModels?.() ?? [];
		} catch {
			// Fall back to the bundled catalog below.
		}
		if (source.length === 0) {
			// Used by --list-models and other runs that never start a session.
			source = getBuiltinModels(SOURCE_PROVIDER_ID);
		}
		// Remapping the provider makes requests resolve the google-free credentials.
		return source.map((model) => ({ ...model, provider: PROVIDER_ID }));
	};

	const base = createProvider({
		id: PROVIDER_ID,
		name: "Google (Free)",
		baseUrl: "https://generativelanguage.googleapis.com/v1beta",
		auth: {
			apiKey: envApiKeyAuth("Google free-tier API key", ["GOOGLE_FREE_API_KEY", "GEMINI_FREE_API_KEY"]),
		},
		models: [],
		api: googleGenerativeAIApi(),
	});

	pi.registerProvider({ ...base, getModels: mirror, getAllModels: mirror });
}
