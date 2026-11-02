/**
 * Brave LLM Context — the `brave-search` tool.
 *
 * Calls POST /res/v1/llm/context, which returns pre-extracted, relevance-ranked
 * page content (text chunks, tables, code) instead of links and snippets, so the
 * model never needs a follow-up fetch. Brave owns the token budget; this module
 * only normalizes the response, renders it for the model, and shapes the
 * structured content for programmatic callers.
 *
 * Docs: https://api-dashboard.search.brave.com/documentation/services/llm-context
 */

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { postBraveJson, truncate } from "./shared.ts";

const ENDPOINT = "https://api.search.brave.com/res/v1/llm/context";

const TOKEN_MIN = 1_024;
const TOKEN_MAX = 32_768;
const TOKEN_DEFAULT = 8_192;

const FRESHNESS_PATTERN = /^(pd|pw|pm|py|\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2})$/;

/** Raw response shape (only the fields this tool reads). */
interface BraveContextResponse {
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
			age: Type.Optional(Type.String({ description: 'Relative age, e.g. "392 days ago".' })),
			snippets: Type.Array(
				Type.String({ description: "Extracted page chunk; may contain JSON-serialized tables or code." }),
			),
		}),
	),
	truncated: Type.Boolean({ description: "True when the rendered text was cut to fit the tool output cap." }),
	tokens: Type.Integer({ description: "Token budget requested from Brave." }),
});

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

function renderText(query: string, results: NormalizedResult[], tokens: number, filters: string[]): string {
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

export const braveLlmContextTool = defineTool({
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
			description: 'Search query. Supports operators such as site: and exact "quoted" terms.',
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
	annotations: { readOnlyHint: true, openWorldHint: true },

	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
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

		const { data: payload, rateLimit } = await postBraveJson<BraveContextResponse>({
			endpoint: ENDPOINT,
			plan: "search",
			body,
			signal,
			ctx,
		});

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
			const snippets = (entry.snippets ?? [])
				.map((snippet) => snippet.trim())
				.filter((snippet) => snippet.length > 0);
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
				perSecondLimit: rateLimit.perSecond,
				quotaRemaining: rateLimit.monthlyRemaining,
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
