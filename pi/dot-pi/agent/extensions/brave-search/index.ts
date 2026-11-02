/**
 * Brave Search — pi extension entry point.
 *
 * Registers one credential-only provider shared by every Brave endpoint, so
 * `/login brave-search` stores a single subscription token that all Brave tools
 * use (`BRAVE_SEARCH_API_KEY` also works as an ambient fallback), then registers
 * the individual API tools:
 *
 * - `brave-search` (llm-context.ts) — LLM Context: pre-extracted page content.
 *
 * Each API lives in its own module next to this file and exports a tool
 * definition; add new ones here. Endpoints that answer with generated text
 * instead of sources (Answers, Summarizer) belong in their own module too.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { braveLlmContextTool } from "./llm-context.ts";
import { PROVIDER_ID } from "./shared.ts";

export default function braveSearchExtension(pi: ExtensionAPI) {
	// No models, so it never appears in `/model`; it exists so the built-in
	// `/login brave-search` and `/logout` manage the API key in auth.json.
	pi.registerProvider(PROVIDER_ID, {
		name: "Brave Search",
		apiKey: "$BRAVE_SEARCH_API_KEY",
	});

	pi.registerTool(braveLlmContextTool);
}
