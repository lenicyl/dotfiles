/**
 * Shared plumbing for the Brave Search API tools.
 *
 * Every Brave endpoint authenticates with the same subscription token header,
 * but rate limits are **per plan** (Search ≈ 50 req/s, Answers ≈ 2 req/s, free
 * credit ≈ 1 req/s), and Brave reports the limits in force on every response:
 *
 *   X-RateLimit-Limit:     1, 2000
 *   X-RateLimit-Policy:    1;w=1, 2000;w=2592000
 *   X-RateLimit-Remaining: 0, 1945
 *   X-RateLimit-Reset:     1, 45999
 *
 * So credentials, pacing, transport, and error decoding live here, and pacing
 * adapts to those headers instead of assuming a plan. Requests are serialized
 * per plan, because each plan has its own bucket — an Answers call must not
 * throttle a Search call, or vice versa.
 */

import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";

/** Credential-only provider id; the API key is stored in auth.json under this key. */
export const PROVIDER_ID = "brave-search";

/** Hard cap on model-facing text, mirroring the other pi tools. */
export const MAX_CONTENT_CHARS = 48_000;

const REQUEST_TIMEOUT_MS = 30_000;
/** Conservative spacing until a response tells us the plan's real per-second limit. */
const UNKNOWN_PLAN_INTERVAL_MS = 1_000;
/** Longest we are willing to park a tool call for a rate limit before failing. */
const MAX_RATE_LIMIT_WAIT_MS = 30_000;

/** Plans have independent limits and quotas; the Search plan covers every search endpoint. */
export type BravePlan = "search" | "answers";

export interface BraveRateLimit {
	/** Burst rate derived from the shortest policy window, e.g. 1, 2, or 50. */
	perSecond?: number;
	/** Requests left in the burst window, when Brave reports it. */
	burstRemaining?: number;
	/** Requests left in the monthly quota, when Brave reports it. */
	monthlyRemaining?: number;
	/** Seconds until the monthly quota window resets. */
	monthlyResetSeconds?: number;
	/** How long the burst window asks us to wait before the next request. */
	cooldownMs?: number;
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_CONTENT_CHARS) return { text, truncated: false };
	const candidate = text.lastIndexOf("\n", MAX_CONTENT_CHARS);
	const end = candidate > MAX_CONTENT_CHARS * 0.8 ? candidate : MAX_CONTENT_CHARS;
	return {
		text: `${text.slice(0, end).trimEnd()}\n\n[truncated at ${end} of ${text.length} characters — narrow the query or lower the token budget]`,
		truncated: true,
	};
}

interface PolicyWindow {
	limit: number;
	window: number;
}

function parsePolicy(value: string | null): PolicyWindow[] {
	if (!value) return [];
	const windows: PolicyWindow[] = [];
	for (const part of value.split(",")) {
		const [limitText, windowText] = part.trim().split(";");
		const limit = Number(limitText);
		const window = Number((windowText ?? "").replace(/^w=/, ""));
		// A limit of 0 means unlimited (Brave reports `0;w=2592000` for no quota),
		// so keep it to preserve index alignment with the other header lists.
		if (Number.isFinite(limit) && Number.isFinite(window) && limit >= 0 && window > 0) {
			windows.push({ limit, window });
		}
	}
	return windows;
}

function parseNumberList(value: string | null): number[] {
	if (!value) return [];
	return value
		.split(",")
		.map((part) => Number(part.trim()))
		.filter((entry) => Number.isFinite(entry));
}

export function readRateLimit(headers: Headers): BraveRateLimit {
	const windows = parsePolicy(headers.get("x-ratelimit-policy"));
	const remaining = parseNumberList(headers.get("x-ratelimit-remaining"));
	const reset = parseNumberList(headers.get("x-ratelimit-reset"));
	const info: BraveRateLimit = {};
	if (windows.length === 0) return info;

	// The shortest window is the burst limit; the longest is the monthly quota.
	let burstIndex = -1;
	let quotaIndex = -1;
	for (let index = 0; index < windows.length; index++) {
		const entry = windows[index];
		if (entry.limit > 0 && (burstIndex === -1 || entry.window < windows[burstIndex].window)) burstIndex = index;
		if (quotaIndex === -1 || entry.window > windows[quotaIndex].window) quotaIndex = index;
	}
	if (burstIndex === -1) return info;

	const burst = windows[burstIndex];
	info.perSecond = burst.limit / burst.window;

	const burstRemaining = remaining[burstIndex];
	if (burstRemaining !== undefined) {
		info.burstRemaining = burstRemaining;
		if (burstRemaining <= 0) {
			info.cooldownMs = Math.max(1, (reset[burstIndex] ?? 1) * 1000);
		}
	}

	if (quotaIndex !== -1 && quotaIndex !== burstIndex && windows[quotaIndex].limit > 0) {
		const monthlyRemaining = remaining[quotaIndex];
		const monthlyReset = reset[quotaIndex];
		if (monthlyRemaining !== undefined) info.monthlyRemaining = monthlyRemaining;
		if (monthlyReset !== undefined) info.monthlyResetSeconds = monthlyReset;
	}

	return info;
}

/**
 * Serializes requests for one plan and paces them using the limits Brave last
 * reported: a fixed interval derived from the burst rate, plus any cooldown the
 * headers ask for. Unknown plans start at one request per second.
 */
class PlanPacer {
	private tail: Promise<void> = Promise.resolve();
	private nextAt = 0;
	private blockedUntil = 0;
	private intervalMs = UNKNOWN_PLAN_INTERVAL_MS;

	observe(rate: BraveRateLimit): void {
		if (rate.perSecond && rate.perSecond > 0) {
			const interval = Math.max(0, Math.floor(1000 / rate.perSecond));
			if (interval < this.intervalMs) {
				// The plan allows more throughput than we assumed, so don't sit out a
				// slot that was booked against the conservative default.
				this.nextAt = Math.min(this.nextAt, Date.now() + interval);
			}
			this.intervalMs = interval;
		}
		if (rate.cooldownMs && rate.cooldownMs > 0) this.defer(rate.cooldownMs);
	}

	defer(ms: number): void {
		this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		const previous = this.tail;
		let release!: () => void;
		this.tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			const wait = Math.max(this.nextAt, this.blockedUntil) - Date.now();
			if (wait > 0) await delay(wait);
			// Book the slot before the request so queued callers space out from here.
			this.nextAt = Date.now() + this.intervalMs;
			return await task();
		} finally {
			release();
		}
	}
}

const pacers = new Map<BravePlan, PlanPacer>();

function pacerFor(plan: BravePlan): PlanPacer {
	let pacer = pacers.get(plan);
	if (!pacer) {
		pacer = new PlanPacer();
		pacers.set(plan, pacer);
	}
	return pacer;
}

/** Resolve the subscription token from the /login store, then from the environment. */
export async function resolveApiKey(ctx: ExtensionToolContext): Promise<string> {
	const key =
		(await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID)) ?? process.env.BRAVE_API_KEY?.trim() ?? undefined;
	if (!key) {
		throw new Error(
			"Brave Search is not configured. Run /login brave-search to save an API key, or set BRAVE_SEARCH_API_KEY.",
		);
	}
	return key;
}

interface BraveFailure {
	code?: string;
	detail: string;
	/** Brave reports the plan, limits, and quota counters in `error.meta`. */
	meta: Record<string, unknown>;
}

async function readFailure(response: Response): Promise<BraveFailure> {
	const raw = await response.text().catch(() => "");
	try {
		const body = JSON.parse(raw) as {
			error?: { code?: string; detail?: string; meta?: Record<string, unknown> };
		};
		const error = body.error;
		if (error) {
			const detail = [error.code, error.detail]
				.filter((part): part is string => Boolean(part))
				.join(": ")
				.replace(/\.+$/, "");
			return { code: error.code, detail, meta: error.meta ?? {} };
		}
	} catch {
		// Not JSON; fall back to a truncated body preview.
	}
	const preview = raw.trim().slice(0, 200);
	return { detail: preview || response.statusText || "unknown error", meta: {} };
}

function describePlan(meta: Record<string, unknown>): string {
	const plan = meta.plan;
	return typeof plan === "string" && plan.length > 0 ? `plan "${plan}"` : "";
}

function throwHttpFailure(response: Response, failure: BraveFailure, rateLimit: BraveRateLimit): never {
	const { status } = response;
	const plan = describePlan(failure.meta);
	if (status === 401 || status === 403 || status === 422) {
		throw new Error(
			`Brave Search rejected the API key (HTTP ${status}): ${failure.detail}. Run /login brave-search to update it.`,
		);
	}
	if (status === 429 && failure.code === "QUOTA_LIMITED") {
		const reset = rateLimit.monthlyResetSeconds;
		const when = reset === undefined ? "when the monthly quota resets" : `in about ${Math.ceil(reset / 3600)}h`;
		const facts = [plan, rateLimit.monthlyRemaining === undefined ? "" : `${rateLimit.monthlyRemaining} requests left`].filter(
			Boolean,
		);
		const suffix = facts.length > 0 ? ` (${facts.join(", ")})` : "";
		throw new Error(
			`Brave Search monthly quota is exhausted${suffix}: ${failure.detail}. It resets ${when}; retrying will not help.`,
		);
	}
	if (status === 429) {
		const wait = rateLimit.cooldownMs === undefined ? "a moment" : `${Math.round(rateLimit.cooldownMs / 100) / 10}s`;
		const suffix = plan ? ` (${plan})` : "";
		throw new Error(
			`Brave Search is still rate limited after waiting ${wait}${suffix}: ${failure.detail}. Retry shortly.`,
		);
	}
	throw new Error(`Brave Search failed with HTTP ${status}: ${failure.detail}`);
}

export interface BraveRequest {
	endpoint: string;
	plan: BravePlan;
	body: unknown;
	signal: AbortSignal | undefined;
	ctx: ExtensionToolContext;
}

/**
 * POST a JSON body to a Brave endpoint with the subscription token, plan-aware
 * pacing, timeout, one bounded retry on a 429, and decoded errors.
 */
export async function postBraveJson<T>(request: BraveRequest): Promise<{ data: T; rateLimit: BraveRateLimit }> {
	const { endpoint, plan, body, signal, ctx } = request;
	const key = await resolveApiKey(ctx);
	const pacer = pacerFor(plan);

	for (let attempt = 0; ; attempt++) {
		if (signal?.aborted) throw new Error("Brave Search request aborted.");

		const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
		const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

		const response = await pacer.run(async () => {
			try {
				return await fetch(endpoint, {
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
		});

		const rateLimit = readRateLimit(response.headers);
		pacer.observe(rateLimit);

		if (response.ok) {
			try {
				return { data: (await response.json()) as T, rateLimit };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Brave Search returned a response that could not be parsed: ${message}`);
			}
		}

		const failure = await readFailure(response);

		// A quota limit is not transient; a burst limit is. Retry the burst once,
		// but never park a tool call for longer than MAX_RATE_LIMIT_WAIT_MS.
		if (response.status === 429 && failure.code !== "QUOTA_LIMITED") {
			const waitMs = rateLimit.cooldownMs ?? UNKNOWN_PLAN_INTERVAL_MS;
			if (attempt === 0 && waitMs <= MAX_RATE_LIMIT_WAIT_MS) {
				pacer.defer(waitMs);
				continue;
			}
			if (waitMs > MAX_RATE_LIMIT_WAIT_MS) {
				const plan = describePlan(failure.meta);
				throw new Error(
					`Brave Search rate limit resets in ${Math.ceil(waitMs / 1000)}s${plan ? ` (${plan})` : ""}, longer than this tool will wait. Retry then.`,
				);
			}
		}

		throwHttpFailure(response, failure, rateLimit);
	}
}
