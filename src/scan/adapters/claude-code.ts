import { scanAgent } from "../agent.ts";
import type { Repo } from "../walk.ts";

// Project-scope paths only: settings.local.json and CLAUDE.local.md are personal and gitignored.
// ponytail: root .claude/ only; nested <subdir>/.claude/skills (monorepos) waits for A5/A6 in v0.2.
export function claudeCode(repo: Repo) {
	return scanAgent(repo, {
		id: "claude-code",
		instructionFiles: ["CLAUDE.md", ".claude/CLAUDE.md"],
		hooksFiles: [".claude/settings.json"],
		skills: /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
		subagents: /^\.claude\/agents\/[^/]+\.md$/,
	});
}
