/**
 * Read-only host mounts for paths the harness references by absolute path.
 *
 * The system prompt's <docs> section points at the pi package's README, docs
 * and examples, and the <skills> section points at skill files under the user
 * agent directory (including package-provided skills under agentDir/npm|git).
 * The codemode tool description also embeds the package docs path.
 *
 * Mounting these at the same guest path keeps those references valid inside
 * the VM. Credentials, session data, temp files and managed binaries are
 * deliberately not exposed.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";
import { ReadonlyProvider, RealFSProvider } from "@earendil-works/gondolin";

const AGENT_RESOURCE_DIRS = ["skills", "prompts", "themes", "tools", "extensions", "npm", "git"] as const;

export function createHarnessMounts(): Record<string, ReadonlyProvider> {
	const mounts: Record<string, ReadonlyProvider> = {};
	const add = (hostPath: string) => {
		if (!existsSync(hostPath)) return;
		const guestPath = path.resolve(hostPath).split(path.sep).join("/");
		mounts[guestPath] = new ReadonlyProvider(new RealFSProvider(hostPath));
	};

	add(getPackageDir());
	for (const dir of AGENT_RESOURCE_DIRS) add(path.join(getAgentDir(), dir));

	return mounts;
}
