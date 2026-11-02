import type { VM } from "@earendil-works/gondolin";

export async function detectGuestOs(vm: VM): Promise<string> {
	const probe = await vm.exec([
		"/bin/sh",
		"-lc",
		`. /etc/os-release 2>/dev/null; printf '%s' "\${PRETTY_NAME:-Linux}"`,
	]);
	return probe.stdout.trim() || "Linux";
}

export function applyGondolinSystemPrompt(
	sections: Record<string, string>,
	options: { localCwd: string; guestWorkspace: string; guestOs: string },
): void {
	sections.cwd =
		`Current working directory: ${options.guestWorkspace} (Gondolin VM; host workspace mounted from ${options.localCwd})`;
	sections.gondolin = [
		`You are running inside a Gondolin microVM (${options.guestOs}).`,
		"",
		"- Other guest filesystem changes are VM-local and discarded when the VM stops.",
		"- The guest is a minimal rootfs; common host tools may be absent.",
		"- Install missing tools with the distro's package manager.",
		"- User configuration is mounted read-only.",
	].join("\n");
}
