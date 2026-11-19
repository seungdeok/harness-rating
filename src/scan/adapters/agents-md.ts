import { scanAgent } from "../agent.ts";
import type { Repo } from "../walk.ts";

// AGENTS.md plus Codex project config (ADR 0001). Codex loads hooks from both files (ADR 0008).
export function agentsMd(repo: Repo) {
	return scanAgent(repo, {
		id: "agents-md",
		instructionFiles: ["AGENTS.md"],
		hooksFiles: [".codex/hooks.json", ".codex/config.toml"],
		skills: /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
		subagents: /^\.codex\/agents\/[^/]+\.toml$/,
	});
}
