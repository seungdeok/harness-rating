import { posix } from "node:path";
import { parse } from "yaml";
import { type Repo, readText } from "../scan/walk.ts";
import type { Check, CheckOutcome } from "./types.ts";

/** Timing checks F1–F4, keyed by the rubric's `check:` name. */
export const timingChecks: Record<string, Check> = {
	"pre-commit": ({ repo }) =>
		outcome(hasPreCommit(repo), "no supported pre-commit configuration"),
	"ci-tests-and-lint": ({ repo }) =>
		outcome(
			workflows(repo).some((workflow) => hasTestsAndLint(repo, workflow)),
			"no GitHub Actions workflow runs both test and lint scripts",
		),
	"drift-sensor": ({ repo }) =>
		outcome(hasDriftSensor(repo), "no supported drift sensor configuration"),
	"scheduled-workflow": ({ repo }) =>
		outcome(
			workflows(repo).some((workflow) => {
				const schedule = object(workflow.on)?.schedule;
				return (
					Object.keys(object(workflow.jobs) ?? {}).length > 0 &&
					Array.isArray(schedule) &&
					schedule.some((entry) => {
						const cron = object(entry)?.cron;
						return typeof cron === "string" && isCron(cron);
					})
				);
			}),
			"no GitHub Actions workflow has an on.schedule cron trigger",
		),
};

function outcome(pass: boolean, detail: string): CheckOutcome {
	return pass ? { status: "pass" } : { status: "fail", detail };
}

function object(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function nonempty(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/** Never load executable configuration. YAML uses 1.2 and its default alias limit. */
function config(repo: Repo, path: string): Record<string, unknown> | undefined {
	const text = readText(repo, path);
	if (!text) return undefined;
	try {
		return object(
			/\.ya?ml$/.test(path)
				? parse(text, { logLevel: "silent" })
				: JSON.parse(text),
		);
	} catch {
		return undefined;
	}
}

function hasPreCommit(repo: Repo): boolean {
	const husky = readText(repo, ".husky/pre-commit");
	if (
		husky &&
		commands(
			husky
				.split("\n")
				.filter((line) => !/^\s*(?:\.|source)\s.*\/_\/husky\.sh/.test(line))
				.join("\n"),
		).length > 0
	)
		return true;
	for (const prefix of ["", ".", ".config/", ".config/."]) {
		for (const extension of ["yml", "yaml", "json"]) {
			const hook = object(
				config(repo, `${prefix}lefthook.${extension}`)?.["pre-commit"],
			);
			if (!hook) continue;
			const entries = [
				...Object.values(object(hook.commands) ?? {}),
				...(Array.isArray(hook.jobs) ? hook.jobs : []),
			];
			if (
				entries.some((entry) => {
					const job = object(entry);
					return (
						job?.skip !== true &&
						nonempty(job?.run) &&
						commands(job.run).length > 0
					);
				})
			)
				return true;
			if (
				Object.entries(object(hook.scripts) ?? {}).some(([file, settings]) => {
					const script = object(settings);
					const path = inside(".lefthook/pre-commit", file);
					return (
						script?.skip !== true &&
						nonempty(script?.runner) &&
						path !== undefined &&
						nonempty(readText(repo, path))
					);
				})
			)
				return true;
		}
	}
	const framework = config(repo, ".pre-commit-config.yaml");
	return (
		Array.isArray(framework?.repos) &&
		framework.repos.some((entry) => {
			const repository = object(entry);
			return (
				nonempty(repository?.repo) &&
				Array.isArray(repository?.hooks) &&
				repository.hooks.some((entry) => {
					const hook = object(entry);
					const stages = hook?.stages ?? framework.default_stages;
					return (
						nonempty(hook?.id) &&
						(repository.repo !== "local" || nonempty(hook?.entry)) &&
						(stages === undefined ||
							(Array.isArray(stages) &&
								stages.some(
									(stage) => stage === "pre-commit" || stage === "commit",
								)))
					);
				})
			);
		})
	);
}

function workflows(repo: Repo): Record<string, unknown>[] {
	return [...repo.files.keys()]
		.filter((path) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))
		.flatMap((path) => {
			const workflow = config(repo, path);
			return workflow ? [workflow] : [];
		});
}

/** GitHub's five-field POSIX cron syntax, including month/day names. */
function isCron(cron: string): boolean {
	const fields = cron.trim().toUpperCase().split(/\s+/);
	const limits = [
		[0, 59],
		[0, 23],
		[1, 31],
		[1, 12],
		[0, 6],
	] as const;
	return (
		fields.length === 5 &&
		fields.every((field, index) => {
			const [min, max] = limits[index] ?? [0, 0];
			const names =
				index === 3
					? "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ")
					: index === 4
						? "SUN MON TUE WED THU FRI SAT".split(" ")
						: [];
			const number = (part: string): number =>
				names.includes(part)
					? names.indexOf(part) + min
					: /^\d+$/.test(part)
						? Number(part)
						: Number.NaN;
			return field.split(",").every((part) => {
				const [range = "", step, ...extra] = part.split("/");
				if (
					extra.length ||
					(step !== undefined && (!/^\d+$/.test(step) || Number(step) < 1))
				)
					return false;
				if (range === "*") return true;
				const bounds = range.split("-").map(number);
				return (
					bounds.length <= 2 &&
					bounds.every((bound) => bound >= min && bound <= max) &&
					(bounds.length === 1 || (bounds[0] ?? 0) <= (bounds[1] ?? 0))
				);
			});
		})
	);
}

/** Resolve a literal repo-relative directory; dynamic and escaping paths fail closed. */
function inside(base: string, path: string): string | undefined {
	if (
		path.startsWith("/") ||
		path.startsWith("~") ||
		/[\\$`]|^[a-z]:/i.test(path)
	)
		return undefined;
	const resolved = posix.join(base, path);
	return resolved === ".." || resolved.startsWith("../") ? undefined : resolved;
}

function runDefault(
	value: Record<string, unknown>,
): Record<string, unknown> | undefined {
	return object(object(value.defaults)?.run);
}

function hasTestsAndLint(
	repo: Repo,
	workflow: Record<string, unknown>,
): boolean {
	const found = new Set<string>();
	const directories = new Set(["."]);
	for (const file of repo.files.keys()) {
		let directory = posix.dirname(file);
		while (!directories.has(directory)) {
			directories.add(directory);
			directory = posix.dirname(directory);
		}
	}
	for (const value of Object.values(object(workflow.jobs) ?? {})) {
		const job = object(value);
		if (!job || disabled(job.if) || !Array.isArray(job.steps)) continue;
		for (const value of job.steps) {
			const step = object(value);
			if (!step || disabled(step.if) || !nonempty(step.run)) continue;
			const defaults = runDefault(job) ?? {};
			const global = runDefault(workflow) ?? {};
			const directory =
				step["working-directory"] ??
				defaults["working-directory"] ??
				global["working-directory"] ??
				".";
			const shell = step.shell ?? defaults.shell ?? global.shell;
			if (
				typeof directory !== "string" ||
				(shell !== undefined &&
					(typeof shell !== "string" ||
						!/^(?:bash|sh|zsh)(?:\s|$)/.test(shell)))
			)
				continue;
			let cwd = resolveDirectory(directories, ".", directory);
			for (const words of commands(step.run)) {
				if (words[0] === "cd") {
					cwd =
						cwd !== undefined && words.length === 2
							? resolveDirectory(directories, cwd, words[1] ?? "")
							: undefined;
					continue;
				}
				if (cwd === undefined) continue;
				const script = scriptName(words);
				const kind = script?.name
					.match(/^(test|lint)(?:$|[:-])/i)?.[1]
					?.toLowerCase();
				const target = script?.package
					? packageDirectory(repo, script.runner, script.package)
					: cwd;
				if (
					script &&
					kind &&
					target !== undefined &&
					nonempty(packageScripts(repo, target)?.[script.name])
				)
					found.add(kind);
			}
		}
	}
	return found.has("test") && found.has("lint");
}

/** Validate each traversed directory before `..` can discard it. */
function resolveDirectory(
	directories: ReadonlySet<string>,
	base: string,
	path: string,
): string | undefined {
	if (inside(base, path) === undefined) return undefined;
	let current = base;
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === ".." && current === ".") return undefined;
		current =
			part === ".." ? posix.dirname(current) : posix.join(current, part);
		if (!directories.has(current)) return undefined;
	}
	return current;
}

/**
 * Split off one literal package selection: pnpm --filter/-F, npm --workspace/-w.
 * Returns undefined for selectors (globs, `...`, paths, exclusions) or repeats.
 */
function selectedPackage(
	runner: string,
	args: string[],
): { args: string[]; name?: string } | undefined {
	const flags =
		runner === "pnpm"
			? ["--filter", "-F"]
			: runner === "npm"
				? ["--workspace", "-w"]
				: [];
	const rest: string[] = [];
	let name: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i] ?? "";
		// Arguments after `--`, and for pnpm after the command name, go to the script.
		if (arg === "--" || (runner === "pnpm" && !arg.startsWith("-"))) {
			rest.push(...args.slice(i));
			break;
		}
		const flag = flags.find(
			(flag) =>
				arg === flag || (flag.startsWith("--") && arg.startsWith(`${flag}=`)),
		);
		if (!flag) {
			rest.push(arg);
			continue;
		}
		if (name !== undefined) return undefined;
		name = arg === flag ? args[++i] : arg.slice(flag.length + 1);
		if (
			!name ||
			!/^(?:@[a-z0-9][\w~-]*(?:\.[\w~-]+)*\/)?[a-z0-9][\w~-]*(?:\.[\w~-]+)*$/i.test(
				name,
			)
		)
			return undefined;
	}
	return { args: rest, name };
}

/**
 * The directory of the only workspace member named exactly `name`. Members come
 * from pnpm-workspace.yaml `packages` (pnpm) or root package.json `workspaces` (npm).
 */
function packageDirectory(
	repo: Repo,
	runner: string,
	name: string,
): string | undefined {
	const workspaces =
		runner === "pnpm"
			? config(repo, "pnpm-workspace.yaml")?.packages
			: config(repo, "package.json")?.workspaces;
	const patterns = (
		Array.isArray(workspaces) ? workspaces : object(workspaces)?.packages
	) as unknown[] | undefined;
	if (!Array.isArray(patterns)) return undefined;
	const globs = patterns
		.filter(nonempty)
		.map((pattern) => pattern.replace(/^(!?)(?:\.\/)?(.*?)\/?$/, "$1$2"));
	const member = (directory: string) =>
		globs.some(
			(glob) => !glob.startsWith("!") && posix.matchesGlob(directory, glob),
		) &&
		!globs.some(
			(glob) =>
				glob.startsWith("!") && posix.matchesGlob(directory, glob.slice(1)),
		);
	const matches = [...repo.files.keys()].filter(
		(path) =>
			/(?:^|\/)package\.json$/.test(path) && config(repo, path)?.name === name,
	);
	const directory = posix.dirname(matches[0] ?? "");
	return matches.length === 1 && member(directory) ? directory : undefined;
}

function scriptName(
	words: string[],
): { name: string; runner: string; package?: string } | undefined {
	const [runner, ...all] = words;
	if (!runner || !["npm", "pnpm", "yarn", "bun"].includes(runner))
		return undefined;
	const selection = selectedPackage(runner, all);
	if (!selection) return undefined;
	const { args, name: selected } = selection;
	// These flags change package selection or bypass scripts; do not guess.
	if (
		args.some((arg) =>
			/^(?:--(?:prefix|dir(?:ectory)?|cwd|filter(?:-prod)?|workspace(?:s|-root)?|top-level|binaries-only|recursive)(?:=|$)|-[CwTBr])/.test(
				arg,
			),
		)
	)
		return undefined;
	const name =
		args[0] === "run" ||
		((runner === "npm" || runner === "pnpm") && args[0] === "run-script")
			? args[1]
			: runner === "npm"
				? args[0] === "test"
					? "test"
					: undefined
				: // Bun's bare test/lint commands are built-ins, not package-script evidence.
					runner === "bun"
					? undefined
					: args[0];
	return name ? { name, runner, package: selected } : undefined;
}

function disabled(condition: unknown): boolean {
	return (
		condition === false ||
		(typeof condition === "string" &&
			/^(?:false|\$\{\{\s*false\s*\}\})$/.test(condition.trim()))
	);
}

function packageScripts(
	repo: Repo,
	directory: string,
): Record<string, unknown> | undefined {
	let current = directory;
	while (true) {
		const path = posix.join(current, "package.json");
		if (repo.files.has(path)) return object(config(repo, path)?.scripts);
		if (current === ".") return undefined;
		current = posix.dirname(current);
	}
}

/**
 * A bounded shell lexer, not an interpreter: only literal command words are used.
 * Quotes/comments prevent prose from becoming commands. Heredocs are unsupported.
 */
function commands(text: string): string[][] {
	const result: string[][] = [];
	let words: string[] = [];
	let word = "";
	let quote = "";
	let comment = false;
	const flushWord = () => {
		if (word) words.push(word);
		word = "";
	};
	const flushCommand = () => {
		flushWord();
		if (words.length) result.push(words);
		words = [];
	};
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] ?? "";
		if (comment && ch !== "\n") continue;
		if (comment) comment = false;
		if (quote) {
			const next = text[i + 1] ?? "";
			if (quote === '"' && ch === "\\" && /[$`"\\\n]/.test(next)) {
				if (next !== "\n") word += next;
				i++;
			} else if (ch === quote) quote = "";
			else if (quote === '"' && (ch === "`" || (ch === "$" && next === "(")))
				return [];
			else word += ch;
		} else if (ch === "\\" && i + 1 < text.length) {
			const next = text[++i] ?? "";
			if (next !== "\n") word += next;
		} else if (ch === '"' || ch === "'") quote = ch;
		else if (ch === "#" && !word) comment = true;
		else if (
			ch === "`" ||
			ch === "(" ||
			ch === ")" ||
			(ch === "<" && text[i + 1] === "<")
		)
			return [];
		else if (/[\n;&|]/.test(ch)) flushCommand();
		else if (/\s/.test(ch)) flushWord();
		else word += ch;
	}
	if (quote) return [];
	flushCommand();
	return result;
}

function hasDriftSensor(repo: Repo): boolean {
	for (const extension of ["yml", "yaml"]) {
		const dependabot = config(repo, `.github/dependabot.${extension}`);
		if (
			dependabot?.version === 2 &&
			Array.isArray(dependabot.updates) &&
			dependabot.updates.some((entry) => {
				const update = object(entry);
				return (
					nonempty(update?.["package-ecosystem"]) &&
					(nonempty(update?.directory) ||
						(Array.isArray(update?.directories) &&
							update.directories.some(nonempty))) &&
					nonempty(object(update?.schedule)?.interval)
				);
			})
		)
			return true;
	}
	const manifest = config(repo, "package.json");
	const renovatePaths = [
		"renovate.json",
		".renovaterc",
		".renovaterc.json",
		".github/renovate.json",
		".github/.renovaterc",
		".gitlab/renovate.json",
	];
	if (
		[
			object(manifest?.renovate),
			...renovatePaths.map((path) => config(repo, path)),
		].some(
			(value) =>
				value &&
				value.enabled !== false &&
				populated(value, ["extends", "packageRules", "enabled"]).length > 0,
		)
	)
		return true;
	if (
		[
			object(manifest?.knip),
			...["knip.json", ".knip.json"].map((path) => config(repo, path)),
		].some(
			(value) =>
				value &&
				populated(value, ["entry", "project", "workspaces", "include"]).length >
					0,
		)
	)
		return true;
	if (
		[
			object(manifest?.nyc),
			...[".nycrc", ".nycrc.json", ".nycrc.yml", ".nycrc.yaml"].map((path) =>
				config(repo, path),
			),
		].some(
			(value) =>
				value &&
				populated(value, [
					"all",
					"include",
					"exclude",
					"reporter",
					"check-coverage",
					"branches",
					"lines",
					"functions",
					"statements",
					"extends",
				]).length > 0,
		)
	)
		return true;
	const coverage = readText(repo, ".coveragerc") ?? "";
	let section = false;
	for (const line of coverage.split(/\r?\n/)) {
		if (/^\s*[#;]/.test(line)) continue;
		if (/^\s*\[/.test(line))
			section = /^\s*\[(?:run|report|paths|html|xml|json|lcov)\]\s*$/.test(
				line,
			);
		else if (section && /^\s*[\w-]+\s*=\s*\S/.test(line)) return true;
	}
	return false;
}

/** Recognized nonempty config fields; false/zero remain meaningful settings. */
function populated(value: Record<string, unknown>, keys: string[]): string[] {
	return keys.filter((key) => {
		const item = value[key];
		return (
			item !== undefined &&
			item !== null &&
			item !== "" &&
			(!Array.isArray(item) || item.length > 0) &&
			(!object(item) || Object.keys(item as object).length > 0)
		);
	});
}
