import { posix } from "node:path";
import { type Hook, isObject } from "../scan/agent.ts";
import type { Repo } from "../scan/walk.ts";
import { readText } from "../scan/walk.ts";
import type { Check } from "./types.ts";

/** Enforcement checks D1–D2 and the review check E1, keyed by the rubric's `check:` name. */
export const enforcementChecks: Record<string, Check> = {
	"agent-hooks": ({ agents }) => {
		const hooks = agents.flatMap((agent) => agent.hooks);
		if (hooks.length > 0) return { status: "pass" };
		const errors = agents.flatMap((agent) =>
			agent.errors.map((error) => `${error.path}: ${error.message}`),
		);
		return {
			status: "fail",
			detail: errors.length > 0 ? errors.join("; ") : "no agent hooks",
		};
	},

	"hook-runs-check": ({ repo, agents }) => {
		const hook = agents
			.flatMap((agent) => agent.hooks)
			.find((hook) => runsCheckScript(repo, hook));
		return hook
			? {
					status: "pass",
					detail: `${hook.file} ${hook.event}: ${hook.command}`,
				}
			: {
					status: "fail",
					detail:
						"no hook runs a test or lint script defined in the repository",
				};
	},

	"review-step": ({ repo, agents }) => {
		const found = agents
			.flatMap((agent) => [...agent.skills, ...agent.subagents])
			.find((path) => isReviewDefinition(repo, path));
		return found
			? { status: "pass", detail: found }
			: { status: "fail", detail: "no review skill or subagent" };
	},
};

// ADR 0005: a script counts as a check when its name is one of these words,
// alone or joined to others by ":", "-", or "_" (test:unit, lint-ci).
const CHECK_NAME =
	/(?:^|[:_-])(?:test|tests|lint|typecheck|type-check|check|verify)(?:$|[:_-])/;

/** ADR 0005. Only `command` hooks run shell commands. */
function runsCheckScript(repo: Repo, hook: Hook): boolean {
	if (hook.type !== "command" || hook.command === undefined) return false;
	return segments(hook.command).some(
		(words) =>
			invokesEntryPoint(repo, words) ||
			segments(scriptFileText(repo, words) ?? "").some((inner) =>
				invokesEntryPoint(repo, inner),
			),
	);
}

/** Simple commands split on shell operators, as words, without leading `VAR=value`. */
function segments(command: string): string[][] {
	return command
		.split(/&&|\|\||[;|\n]/)
		.map((segment) => {
			const words = segment
				.split(/\s+/)
				// ponytail: quotes are dropped, not parsed; quoted operators or spaces split wrongly.
				.map((word) => word.replace(/["']/g, ""))
				.filter((word) => word !== "");
			while (/^\w+=/.test(words[0] ?? "")) words.shift();
			return words;
		})
		.filter((words) => words.length > 0);
}

/** A package.json script, or a make/just target, that is defined and has a check name. */
function invokesEntryPoint(repo: Repo, [tool, ...args]: string[]): boolean {
	const name = targetName(tool, args);
	if (name === undefined || !CHECK_NAME.test(name)) return false;
	if (tool === "make" || tool === "just") {
		const file = tool === "make" ? "Makefile" : "justfile";
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// `name:` or `name args:` at the start of a line; `name :=` is a variable.
		return new RegExp(`^${escaped}(?=[\\s:])[^\\n=]*:(?!=)`, "m").test(
			cachedText(repo, file),
		);
	}
	return packageScripts(repo).has(name);
}

const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);

// ponytail: options before the script name (`npm --silent test`) are not parsed.
function targetName(
	tool: string | undefined,
	[first, second]: string[],
): string | undefined {
	if (tool === "make" || tool === "just") return first;
	if (!tool || !PACKAGE_MANAGERS.has(tool)) return undefined;
	if (first === "run" || first === "run-script") return second;
	if (first === "test" || first === "t")
		return tool === "bun" ? undefined : "test";
	// `bun <name>` runs bun's own commands first, so bun needs `run`.
	return tool === "pnpm" || tool === "yarn" ? first : undefined;
}

// Read and parse each file once per repo: a hook script may repeat a command thousands of times.
const textCache = new WeakMap<Repo, Map<string, string>>();
const scriptsCache = new WeakMap<Repo, Set<string>>();

function cachedText(repo: Repo, path: string): string {
	let files = textCache.get(repo);
	if (!files) {
		files = new Map();
		textCache.set(repo, files);
	}
	let text = files.get(path);
	if (text === undefined) {
		text = readText(repo, path) ?? "";
		files.set(path, text);
	}
	return text;
}

/** Names of non-empty scripts in the root package.json. */
// ponytail: root package.json only; `cd packages/x && npm test` checks the root scripts.
function packageScripts(repo: Repo): Set<string> {
	let names = scriptsCache.get(repo);
	if (names) return names;
	names = new Set();
	scriptsCache.set(repo, names);
	let data: unknown;
	try {
		data = JSON.parse(cachedText(repo, "package.json"));
	} catch {
		return names;
	}
	const scripts = isObject(data) ? data.scripts : undefined;
	if (!isObject(scripts)) return names;
	for (const [name, script] of Object.entries(scripts)) {
		if (typeof script === "string" && script.trim() !== "") names.add(name);
	}
	return names;
}

const INTERPRETERS = new Set([
	"sh",
	"bash",
	"zsh",
	"node",
	"python",
	"python3",
]);
const PROJECT_DIR = /^\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\//;

/** Text of the repository file a segment executes, if any. */
function scriptFileText(repo: Repo, words: string[]): string | undefined {
	const target = INTERPRETERS.has(words[0] ?? "") ? words[1] : words[0];
	if (target === undefined) return undefined;
	const path = posix.normalize(target.replace(PROJECT_DIR, ""));
	if (path.startsWith("/") || path.startsWith("..")) return undefined;
	return readText(repo, path);
}

// Skill directory or agent file name, or a single-line `name:`/`description =` field
// (YAML frontmatter and Codex TOML).
// ponytail: multi-line descriptions (YAML `>`, TOML `"""`) are not parsed.
const REVIEW_FIELD = /^\s*(?:name|description)\s*[:=].*\breview/im;

function isReviewDefinition(repo: Repo, path: string): boolean {
	const name = path.endsWith("/SKILL.md")
		? posix.basename(posix.dirname(path))
		: posix.basename(path);
	return /review/i.test(name) || REVIEW_FIELD.test(readText(repo, path) ?? "");
}
