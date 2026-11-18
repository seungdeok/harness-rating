import { posix } from "node:path";
import type { Repo } from "../scan/walk.ts";
import { readText } from "../scan/walk.ts";
import type { Check, CheckContext, CheckOutcome } from "./types.ts";

/** Guide checks A1–A4, keyed by the rubric's `check:` name. */
export const guideChecks: Record<string, Check> = {
	"instruction-file-exists": (context) =>
		instructionFiles(context).length > 0
			? { status: "pass" }
			: { status: "fail", detail: "no AGENTS.md, CLAUDE.md, or GEMINI.md" },

	"instruction-file-length": (context) => {
		const maxLines = context.params.max_lines as number;
		if (!Number.isInteger(maxLines) || maxLines < 1) {
			throw new Error(
				"instruction-file-length needs a positive integer max_lines",
			);
		}
		return forEachFile(context, (path, text) => {
			if (text === undefined) return `${path}: above the file size cap`;
			const lines = lineCount(text);
			return lines > maxLines
				? `${path}: ${lines} lines > ${maxLines}`
				: undefined;
		});
	},

	"instruction-file-commands": (context) => {
		const files = instructionFiles(context);
		if (files.length === 0) return { status: "na" };
		const found = files.some((path) =>
			codeLines(readText(context.repo, path) ?? "").some(isBuildOrTestCommand),
		);
		return found
			? { status: "pass" }
			: { status: "fail", detail: "no build or test command in a code block" };
	},

	"instruction-file-references": (context) =>
		forEachFile(context, (path, text) => {
			const missing = references(text ?? "")
				.map((ref) => resolveReference(context.repo, path, ref))
				.filter((problem) => problem !== undefined);
			return missing.length > 0 ? `${path}: ${missing.join(", ")}` : undefined;
		}),
};

/**
 * Root instruction files of the detected agents, plus GEMINI.md (A1 counts it,
 * though no v0.1 adapter detects Gemini CLI). Sorted for deterministic output.
 */
function instructionFiles({ repo, agents }: CheckContext): string[] {
	const files = new Set(agents.flatMap((agent) => agent.instructionFiles));
	if (repo.files.has("GEMINI.md")) files.add("GEMINI.md");
	return [...files].sort();
}

/** Runs `problemOf` on each instruction file; fails with every problem found, N/A without files. */
function forEachFile(
	context: CheckContext,
	problemOf: (path: string, text: string | undefined) => string | undefined,
): CheckOutcome {
	const files = instructionFiles(context);
	if (files.length === 0) return { status: "na" };
	const problems = files
		.map((path) => problemOf(path, readText(context.repo, path)))
		.filter((problem) => problem !== undefined);
	return problems.length > 0
		? { status: "fail", detail: problems.join("; ") }
		: { status: "pass" };
}

function lineCount(text: string): number {
	if (text === "") return 0;
	return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

// An unclosed fence runs to the end of the file, as in CommonMark.
const FENCE =
	/^ {0,3}(```|~~~)[^\n]*(?:\n[\s\S]*?(?:\n {0,3}\1[^\n]*|(?![\s\S]))|(?![\s\S]))/gm;
const INLINE_CODE = /`[^`\n]+`/g;

/** Lines inside fenced code blocks and inline code spans. */
function codeLines(text: string): string[] {
	const fenced = [...text.matchAll(FENCE)].flatMap((match) =>
		match[0].split("\n").slice(1),
	);
	const inline = [...text.replace(FENCE, "").matchAll(INLINE_CODE)].map(
		(match) => match[0].slice(1, -1),
	);
	return [...fenced, ...inline];
}

const RUNNER =
	/^\s*(?:\$\s+)?(?:npm|pnpm|yarn|bun|npx|deno|make|just|go|cargo|python3?|pytest|tox|nox|uv|poetry|mvn|gradle|\.\/gradlew|dotnet|swift|mix|bundle|rake|ctest|cmake)\b/;
const BUILD_OR_TEST =
	/\b(?:test|tests|build|check|lint|typecheck|verify|pytest|tox|nox)\b/;

// ponytail: commands written only in prose (no backticks or code block) are not detected.
function isBuildOrTestCommand(line: string): boolean {
	return RUNNER.test(line) && BUILD_OR_TEST.test(line);
}

const LINK = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
// Claude Code import syntax: `@path` outside code; `\ ` escapes a space in the path.
const IMPORT = /(?:^|[\s(])@((?:\\ |[^\s`])+)/g;

interface Reference {
	target: string;
	kind: "link" | "import";
}

/** Link targets and @ import paths, skipping code where neither is parsed. */
function references(text: string): Reference[] {
	const prose = text.replace(FENCE, "").replace(INLINE_CODE, "");
	const links = [...prose.matchAll(LINK)]
		.map((match): Reference => ({ target: match[1] ?? "", kind: "link" }))
		.filter(({ target }) => !/^[a-z][a-z0-9+.-]*:|^#/i.test(target));
	const imports = [...prose.matchAll(IMPORT)].map(
		(match): Reference => ({
			target: (match[1] ?? "")
				.replaceAll("\\ ", " ")
				.replace(/[.,;:!?)]+$/, ""),
			kind: "import",
		}),
	);
	return [...links, ...imports].filter(({ target }) => target !== "");
}

/** Returns a problem description, or undefined when the target exists in the repo. */
function resolveReference(
	repo: Repo,
	from: string,
	{ target, kind }: Reference,
): string | undefined {
	let path = kind === "link" ? target.replace(/[?#].*$/, "") : target;
	try {
		path = decodeURIComponent(path);
	} catch {
		// keep the raw path when it is not valid percent-encoding
	}
	// An absolute import is a filesystem path; a "/" link means the repository root, as on GitHub.
	if (
		path.startsWith("~") ||
		/^[a-z]:/i.test(path) ||
		(kind === "import" && path.startsWith("/"))
	) {
		return `${target} (outside the repository)`;
	}
	const resolved = path.startsWith("/")
		? posix.normalize(path.slice(1))
		: posix.join(posix.dirname(from), path);
	if (resolved === ".." || resolved.startsWith("../")) {
		return `${target} (outside the repository)`;
	}
	const normalized = resolved.replace(/\/$/, "");
	if (normalized === "." || normalized === "") return undefined;
	const exists =
		repo.files.has(normalized) ||
		[...repo.files.keys()].some((file) => file.startsWith(`${normalized}/`));
	return exists ? undefined : `${target} not found`;
}
