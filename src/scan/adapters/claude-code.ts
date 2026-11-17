import { scanAgent } from "../agent.js";
import type { Repo } from "../walk.js";

// Project-scope paths only: settings.local.json and CLAUDE.local.md are personal and gitignored.
// ponytail: root .claude/ only; nested <subdir>/.claude/skills (monorepos) waits for A5/A6 in v0.2.
export function claudeCode(repo: Repo) {
	return scanAgent(repo, {
		id: "claude-code",
		instructionFiles: ["CLAUDE.md", ".claude/CLAUDE.md"],
		hooksFile: ".claude/settings.json",
		skills: /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
		subagents: /^\.claude\/agents\/[^/]+\.md$/,
	});
}
