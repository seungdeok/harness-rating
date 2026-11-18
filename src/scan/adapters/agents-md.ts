import { scanAgent } from "../agent.ts";
import type { Repo } from "../walk.ts";

// AGENTS.md plus Codex project config (ADR 0001).
// ponytail: inline [hooks] in .codex/config.toml is not read; runtime deps are YAML and JSON only.
// Reading it needs a TOML parser, which needs an ADR.
export function agentsMd(repo: Repo) {
	return scanAgent(repo, {
		id: "agents-md",
		instructionFiles: ["AGENTS.md"],
		hooksFile: ".codex/hooks.json",
		skills: /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
		subagents: /^\.codex\/agents\/[^/]+\.toml$/,
	});
}
