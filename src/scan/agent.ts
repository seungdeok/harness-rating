import { parse as parseToml } from "smol-toml";
import { type Repo, readText } from "./walk.ts";

export type AgentId = "claude-code" | "agents-md";

/** Display names for reports. */
export const AGENT_NAMES: Record<AgentId, string> = {
	"claude-code": "Claude Code",
	"agents-md": "AGENTS.md",
};

export interface Hook {
	file: string;
	event: string;
	type: string;
	command?: string;
}

export interface ScanError {
	path: string;
	message: string;
}

/** What an adapter found for one agent. Paths are repo-relative. */
export interface Agent {
	id: AgentId;
	instructionFiles: string[];
	hooks: Hook[];
	/** `SKILL.md` files */
	skills: string[];
	/** Subagent definition files */
	subagents: string[];
	errors: ScanError[];
}

/** Where an agent keeps its project config. Paths are repo-relative. */
export interface AgentPaths {
	id: AgentId;
	instructionFiles: string[];
	/** JSON or TOML files with a `hooks` table */
	hooksFiles: string[];
	skills: RegExp;
	subagents: RegExp;
}

/** Returns undefined when the repo has none of the agent's files. */
export function scanAgent(repo: Repo, paths: AgentPaths): Agent | undefined {
	const errors: ScanError[] = [];
	const instructionFiles = paths.instructionFiles.filter((path) =>
		repo.files.has(path),
	);
	const hooksFiles = paths.hooksFiles.filter((path) => repo.files.has(path));
	const hooks = hooksFiles.flatMap((path) => readHooks(repo, path, errors));
	const skills = filesMatching(repo, paths.skills);
	const subagents = filesMatching(repo, paths.subagents);
	if (
		!instructionFiles.length &&
		!hooksFiles.length &&
		!skills.length &&
		!subagents.length
	) {
		return undefined;
	}
	return { id: paths.id, instructionFiles, hooks, skills, subagents, errors };
}

function filesMatching(repo: Repo, pattern: RegExp): string[] {
	return [...repo.files.keys()].filter((path) => pattern.test(path));
}

/**
 * Reads hooks from a Claude Code `settings.json`, a Codex `hooks.json`, or `[hooks]` in a
 * Codex `config.toml` (ADR 0008). All use
 * `hooks: { <event>: [{ matcher?, hooks: [{ type, command? }] }] }`.
 * Problems are pushed to `errors`, never thrown: the file comes from an untrusted repo.
 */
function readHooks(repo: Repo, path: string, errors: ScanError[]): Hook[] {
	const text = readText(repo, path);
	if (text === undefined) {
		errors.push({ path, message: "above the file size cap; not read" });
		return [];
	}
	const toml = path.endsWith(".toml");
	let data: unknown;
	try {
		data = toml ? parseToml(text) : JSON.parse(text);
	} catch (error) {
		errors.push({
			path,
			message: `invalid ${toml ? "TOML" : "JSON"}: ${(error as Error).message}`,
		});
		return [];
	}
	const events = isObject(data) ? data.hooks : undefined;
	if (events === undefined) return [];
	if (!isObject(events)) {
		errors.push({ path, message: '"hooks" is not an object' });
		return [];
	}
	const hooks: Hook[] = [];
	for (const [event, groups] of Object.entries(events)) {
		if (!Array.isArray(groups)) {
			errors.push({ path, message: `hooks.${event}: unexpected shape` });
			continue;
		}
		for (const group of groups) {
			const handlers = isObject(group) ? group.hooks : undefined;
			if (!Array.isArray(handlers)) {
				errors.push({ path, message: `hooks.${event}: unexpected shape` });
				continue;
			}
			for (const handler of handlers) {
				if (!isObject(handler) || typeof handler.type !== "string") {
					errors.push({ path, message: `hooks.${event}: handler has no type` });
					continue;
				}
				const hook: Hook = { file: path, event, type: handler.type };
				if (typeof handler.command === "string") hook.command = handler.command;
				hooks.push(hook);
			}
		}
	}
	return hooks;
}

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
