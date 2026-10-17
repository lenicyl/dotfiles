import path from "node:path";
import { getAgentDir, getPackageDir } from "@earendil-works/pi-coding-agent";

/**
 * Host paths pi's system prompt refers to by absolute path. They are mounted
 * read-only into the VM at the same guest path so those references keep
 * resolving without touching the system prompt.
 *
 * Deliberately excludes the rest of the agent dir (auth.json, sessions, ...).
 */
export function piReadableHostRoots(): string[] {
	return [getPackageDir(), path.join(getAgentDir(), "skills")];
}
