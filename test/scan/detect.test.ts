import { expect, test } from "vitest";
import { detect } from "../../src/scan/detect.ts";
import { makeRepo } from "../support/temp-repo.ts";

const scan = (files: Record<string, string>) => detect(makeRepo(files));

const hooksJson = JSON.stringify({
	hooks: {
		PostToolUse: [
			{
				matcher: "Edit|Write",
				hooks: [{ type: "command", command: "npm run lint" }],
			},
		],
		Stop: [{ hooks: [{ type: "prompt", prompt: "Check the tests ran" }] }],
	},
});

test("detects nothing in a repo without agent files", () => {
	expect(scan({ "README.md": "# app" })).toEqual([]);
});

test("lists agents in a fixed order", () => {
	const ids = scan({ "AGENTS.md": "", "CLAUDE.md": "" }).map((a) => a.id);
	expect(ids).toEqual(["claude-code", "agents-md"]);
});

test("reads Claude Code instruction files, hooks, skills, and subagents", () => {
	const [agent] = scan({
		"CLAUDE.md": "",
		".claude/CLAUDE.md": "",
		".claude/settings.json": hooksJson,
		".claude/settings.local.json": hooksJson,
		".claude/skills/review/SKILL.md": "",
		".claude/skills/review/notes.md": "",
		".claude/agents/reviewer.md": "",
	});
	expect(agent).toEqual({
		id: "claude-code",
		instructionFiles: ["CLAUDE.md", ".claude/CLAUDE.md"],
		hooks: [
			{
				file: ".claude/settings.json",
				event: "PostToolUse",
				type: "command",
				command: "npm run lint",
			},
			{ file: ".claude/settings.json", event: "Stop", type: "prompt" },
		],
		skills: [".claude/skills/review/SKILL.md"],
		subagents: [".claude/agents/reviewer.md"],
		errors: [],
	});
});

test("reads Codex project config for agents-md, even without AGENTS.md", () => {
	const [agent] = scan({
		".codex/hooks.json": hooksJson,
		".codex/agents/reviewer.toml": "",
		".agents/skills/review/SKILL.md": "",
	});
	expect(agent).toMatchObject({
		id: "agents-md",
		instructionFiles: [],
		skills: [".agents/skills/review/SKILL.md"],
		subagents: [".codex/agents/reviewer.toml"],
		errors: [],
	});
	expect(agent?.hooks.map((h) => h.command)).toEqual([
		"npm run lint",
		undefined,
	]);
});

test("reports malformed settings JSON instead of throwing", () => {
	const [agent] = scan({ ".claude/settings.json": "{ not json" });
	expect(agent?.hooks).toEqual([]);
	expect(agent?.errors).toEqual([
		{
			path: ".claude/settings.json",
			message: expect.stringMatching(/^invalid JSON/),
		},
	]);
});

test("reports unexpected hook shapes and keeps the valid hooks", () => {
	const [agent] = scan({
		".codex/hooks.json": JSON.stringify({
			hooks: {
				Stop: "npm test",
				PreToolUse: [
					{
						hooks: [{ command: "no type" }, { type: "command", command: "ok" }],
					},
				],
			},
		}),
	});
	expect(agent?.hooks.map((h) => h.command)).toEqual(["ok"]);
	expect(agent?.errors.map((e) => e.message)).toEqual([
		"hooks.Stop: unexpected shape",
		"hooks.PreToolUse: handler has no type",
	]);
});

test("settings without hooks yield no hooks and no errors", () => {
	const [agent] = scan({ ".claude/settings.json": '{"model":"x"}' });
	expect(agent).toMatchObject({ id: "claude-code", hooks: [], errors: [] });
});

const configToml = `model = "x"

[[hooks.PreToolUse]]
matcher = "^Bash$"

[[hooks.PreToolUse.hooks]]
type = "command"
command = "npm test"
timeout = 30
`;

test("reads inline [hooks] in .codex/config.toml along with hooks.json", () => {
	const [agent] = scan({
		".codex/hooks.json": hooksJson,
		".codex/config.toml": configToml,
	});
	expect(agent).toMatchObject({ id: "agents-md", errors: [] });
	expect(agent?.hooks).toContainEqual({
		file: ".codex/config.toml",
		event: "PreToolUse",
		type: "command",
		command: "npm test",
	});
	expect(agent?.hooks).toHaveLength(3);
});

test("reports malformed config.toml instead of throwing", () => {
	const [agent] = scan({ ".codex/config.toml": "[hooks\n" });
	expect(agent?.hooks).toEqual([]);
	expect(agent?.errors).toEqual([
		{
			path: ".codex/config.toml",
			message: expect.stringMatching(/^invalid TOML/),
		},
	]);
});

test("config.toml without hooks yields no hooks and no errors", () => {
	const [agent] = scan({ ".codex/config.toml": 'model = "x"\n' });
	expect(agent).toMatchObject({ id: "agents-md", hooks: [], errors: [] });
});
