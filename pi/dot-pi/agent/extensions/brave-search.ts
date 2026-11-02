/**
 * Brave Search — LLM Context API as a pi tool.
 *
 * This extension registers two things:
 *
 * 1. A credential-only model provider named `brave-search`. It has no models, so
 *    it never appears in `/model`, but it makes the built-in `/login brave-search`
 *    prompt for an API key and store it in `~/.pi/agent/auth.json`. `/logout` can
 *    remove it again, and `BRAVE_SEARCH_API_KEY` (or `BRAVE_API_KEY`) works as an
 *    ambient fallback without logging in.
 * 2. The `brave-search` tool, which calls the LLM Context endpoint and returns
 *    pre-extracted, relevance-ranked page content, token-budgeted by Brave.
 *
 * Unlike a classic search API, LLM Context returns the page content itself, so the
 * model never needs a follow-up fetch. Source: https://api-dashboard.search.brave.com/
 */

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PROVIDER_ID = "brave-search";
const ENDPOINT = "https://api.search.brave.com/res/v1/llm/context";
const REQUEST_TIMEOUT_MS = 30_000;
/** Brave rate-limits requests in a 1-second sliding window; serialize calls. */
const MIN_REQUEST_INTERVAL_MS = 1_000;
/** Hard cap on model-facing text, mirroring the other pi tools. */
const MAX_CONTENT_CHARS = 48_000;

const TOKEN_MIN = 1_024;
const TOKEN_MAX = 32_768;
const TOKEN_DEFAULT = 8_192;

const FRESHNESS_PATTERN = /^(pd|pw|pm|py|\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2})$/;

/** Raw response shape (only the fields this tool reads). */
interface BraveResponse {
	grounding?: {
		generic?: { url?: string; title?: string; snippets?: string[] }[];
	};
	sources?: Record<string, { title?: string; hostname?: string; age?: string[] }>;
}

interface NormalizedResult {
	title: string;
	url: string;
	hostname: string;
	published?: string;
	age?: string;
	snippets: string[];
}

const outputSchema = Type.Object({
	query: Type.String(),
	results: Type.Array(
		Type.Object({
			title: Type.String(),
			url: Type.String(),
			hostname: Type.String(),
			published: Type.Optional(Type.String({ description: "Publication date as YYYY-MM-DD when Brave reports one." })),
			age: Type.Optional(Type.String({ description: "Relative age, e.g. \"392 days ago\"." })),
			snippets: Type.Array(Type.String({ description: "Extracted page chunk; may contain JSON-serialized tables or code." })),
		}),
	),
	truncated: Type.Boolean({ description: "True when the rendered text was cut to fit the tool output cap." }),
	tokens: Type.Integer({ description: "Token budget requested from Brave." }),
});

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;

async function waitForRateLimitSlot(): Promise<void> {
	const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
	if (wait > 0) await delay(wait);
	lastRequestAt = Date.now();
}

/**
 * Brave returns snippets as plain text or as JSON-serialized structured data
 * (tables, schemas, code blocks). Pretty-printing the JSON form keeps it readable
 * (and cheaper in tokens than escaped one-liners) while leaving prose untouched.
 */
function formatSnippet(snippet: string): string {
	const trimmed = snippet.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return `\`\`\`json\n${JSON.stringify(JSON.parse(trimmed), null, 2)}\n\`\`\``;
		} catch {
			// Not JSON after all; fall through to the plain text below.
		}
	}
	return trimmed;
}

/** `sources[url].age` is [full date, YYYY-MM-DD, "N days ago", ISO 8601], possibly empty. */
function readDates(age: string[] | undefined): { published?: string; relative?: string } {
	if (!age || age.length === 0) return {};
	const published = age[1]?.trim() || undefined;
	const relative = age[2]?.trim() || undefined;
	return { published, relative };
}

function truncate(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_CONTENT_CHARS) return { text, truncated: false };
	const candidate = text.lastIndexOf("\n", MAX_CONTENT_CHARS);
	const end = candidate > MAX_CONTENT_CHARS * 0.8 ? candidate : MAX_CONTENT_CHARS;
	return {
		text: `${text.slice(0, end).trimEnd()}\n\n[truncated at ${end} of ${text.length} characters — narrow the query or lower the token budget]`,
		truncated: true,
	};
}

function renderText(
	query: string,
	results: NormalizedResult[],
	tokens: number,
	filters: string[],
): string {
	if (results.length === 0) {
		const suffix = filters.length > 0 ? ` (${filters.join(", ")})` : "";
		return `Brave found no usable content for "${query}"${suffix}. Try broader terms, or drop the filters.`;
	}

	const header = `Brave results for "${query}" — ${results.length} source${results.length === 1 ? "" : "s"} (${tokens}-token budget)`;
	const blocks = results.map((result, index) => {
		const heading = result.title ? `${result.title} — ${result.hostname}` : result.hostname;
		const lines = [`[${index + 1}] ${heading}`];
		lines.push(result.url);
		const dates = [result.published, result.age].filter(Boolean).join(" · ");
		if (dates) lines.push(dates);
		for (const snippet of result.snippets) {
			lines.push("", formatSnippet(snippet));
		}
		return lines.join("\n");
	});
	return [header, ...blocks].join("\n\n");
}

async function readError(response: Response): Promise<string> {
	const raw = await response.text().catch(() => "");
	try {
		const body = JSON.parse(raw) as { error?: { code?: string; detail?: string } };
		const code = body.error?.code;
		const detail = body.error?.detail;
		if (code || detail) return [code, detail].filter(Boolean).join(": ").replace(/\.+$/, "");
	} catch {
		// Not JSON; fall back to a truncated body preview.
	}
	const preview = raw.trim().slice(0, 200);
	return preview || response.statusText || "unknown error";
}

const braveSearchTool = defineTool({
	name: "brave-search",
	label: "Brave Search",
	description:
		"Search the web with Brave and get extracted page content instead of just links: ranked text chunks, tables, and code from the top results, already token-budgeted for you. Use it whenever an answer depends on information that may have changed after your training cutoff — library versions, releases, pricing, APIs, documentation, news, current events — or when the user asks you to look something up or verify a claim. No follow-up fetch is needed; the returned snippets are the page content.",
	promptSnippet:
		"Search the web with Brave and read extracted page content (current facts, versions, docs, news)",
	promptGuidelines: [
		"Use brave-search when the answer depends on information that may have changed after your training cutoff: library versions, releases, pricing, APIs, documentation, current events, or anything the user asks you to look up or verify.",
		"Do not use it for stable knowledge you already have or for code in the working directory.",
		"Cite sources in your answer by their [n] number from the tool result.",
		"If brave-search returns no usable content, say so and suggest different terms or filters instead of answering from memory.",
	],
	parameters: Type.Object({
		q: Type.String({
			minLength: 1,
			maxLength: 400,
			description: "Search query. Supports operators such as site: and exact \"quoted\" terms.",
		}),
		freshness: Type.Optional(
			Type.String({
				description:
					"Restrict results by page age: 'pd' (past day), 'pw' (past week), 'pm' (past month), 'py' (past year), or a custom range 'YYYY-MM-DDtoYYYY-MM-DD'.",
			}),
		),
		tokens: Type.Optional(
			Type.Integer({
				minimum: TOKEN_MIN,
				maximum: TOKEN_MAX,
				default: TOKEN_DEFAULT,
				description:
					"Approximate context budget in tokens. Leave unset for standard queries; raise it for broad research, lower it for a quick factual lookup.",
			}),
		),
		threshold: Type.Optional(
			Type.Union([Type.Literal("strict"), Type.Literal("balanced"), Type.Literal("lenient"), Type.Literal("disabled")], {
				description:
					"Relevance filter. 'strict' trades coverage for precision; 'lenient' returns more, possibly less relevant content. Leave unset for Brave's calibrated default.",
			}),
		),
	}),
	outputSchema,
	executionMode: "sequential",
	annotations: { readOnlyHint: true, openWorldHint: true },

	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		const key =
			(await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID)) ?? process.env.BRAVE_API_KEY?.trim() ?? undefined;
		if (!key) {
			throw new Error(
				"Brave Search is not configured. Run /login brave-search to save an API key, or set BRAVE_SEARCH_API_KEY.",
			);
		}

		const freshness = params.freshness?.trim();
		if (freshness && !FRESHNESS_PATTERN.test(freshness)) {
			throw new Error(
				`Invalid freshness "${params.freshness}". Use pd, pw, pm, py, or a range like 2024-01-01to2024-06-30.`,
			);
		}

		const tokens = params.tokens ?? TOKEN_DEFAULT;
		const body: Record<string, unknown> = {
			q: params.q,
			maximum_number_of_tokens: tokens,
		};
		if (freshness) body.freshness = freshness;
		if (params.threshold) body.context_threshold_mode = params.threshold;

		const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
		const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

		await waitForRateLimitSlot();

		let response: Response;
		try {
			response = await fetch(ENDPOINT, {
				method: "POST",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					"X-Subscription-Token": key,
				},
				body: JSON.stringify(body),
				signal: requestSignal,
			});
		} catch (error) {
			if (requestSignal.aborted) {
				throw new Error(`Brave Search request aborted after ${REQUEST_TIMEOUT_MS / 1000}s.`);
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Brave Search request failed: ${message}`);
		}

		if (!response.ok) {
			const detail = await readError(response);
			if (response.status === 401 || response.status === 403 || response.status === 422) {
				throw new Error(
					`Brave Search rejected the API key (HTTP ${response.status}): ${detail}. Run /login brave-search to update it.`,
				);
			}
			if (response.status === 429) {
				throw new Error(`Brave Search rate limit reached (HTTP 429): ${detail}. Wait a moment and retry.`);
			}
			throw new Error(`Brave Search failed with HTTP ${response.status}: ${detail}`);
		}

		let payload: BraveResponse;
		try {
			payload = (await response.json()) as BraveResponse;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Brave Search returned a response that could not be parsed: ${message}`);
		}

		const sources = payload.sources ?? {};
		const results: NormalizedResult[] = (payload.grounding?.generic ?? []).map((entry) => {
			const url = entry.url ?? "";
			const meta = sources[url] ?? {};
			const { published, relative } = readDates(meta.age);
			let hostname = meta.hostname ?? "";
			if (!hostname) {
				try {
					hostname = new URL(url).hostname;
				} catch {
					hostname = url;
				}
			}
			const snippets = (entry.snippets ?? []).map((snippet) => snippet.trim()).filter((snippet) => snippet.length > 0);
			const result: NormalizedResult = {
				title: (entry.title ?? meta.title ?? "").trim(),
				url,
				hostname,
				snippets,
			};
			if (published) result.published = published;
			if (relative) result.age = relative;
			return result;
		});

		const filters: string[] = [];
		if (freshness) filters.push(`freshness=${freshness}`);
		if (params.threshold) filters.push(`threshold=${params.threshold}`);

		const rendered = truncate(renderText(params.q, results, tokens, filters));

		return {
			content: [{ type: "text", text: rendered.text }],
			details: {
				query: params.q,
				resultCount: results.length,
				truncated: rendered.truncated,
				tokens,
			},
			structuredContent: {
				query: params.q,
				results,
				truncated: rendered.truncated,
				tokens,
			},
		};
	},
});

export default function braveSearchExtension(pi: ExtensionAPI) {
	// Credential-only provider: no models, but `/login brave-search` and `/logout`
	// work through pi's normal auth flow and store the key in auth.json.
	pi.registerProvider(PROVIDER_ID, {
		name: "Brave Search",
		apiKey: "$BRAVE_SEARCH_API_KEY",
	});

	pi.registerTool(braveSearchTool);
}
