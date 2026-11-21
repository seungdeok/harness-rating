import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { join, posix } from "node:path";
import ignore, { type Ignore } from "ignore";

/** Files above this size are listed but never read. See ADR 0002. */
export const MAX_FILE_SIZE = 512 * 1024;

const IGNORED_DIRS = new Set([".git", "node_modules"]);

export interface Skipped {
	path: string;
	reason: "symlink" | "special" | "unreadable";
}

export interface Repo {
	root: string;
	/** Regular files: repo-relative POSIX path → size in bytes, in sorted walk order. */
	files: Map<string, number>;
	skipped: Skipped[];
}

/** Lists every regular file under `root` without following symlinks or reading contents. */
export function walk(root: string): Repo {
	const realRoot = realpathSync(root);
	if (!statSync(realRoot).isDirectory()) {
		throw new Error(`not a directory: ${root}`);
	}
	const repo: Repo = { root: realRoot, files: new Map(), skipped: [] };
	visit(repo, "", excludeRules(realRoot));
	return repo;
}

/** The patterns of one ignore file, which apply to paths under `base`. See ADR 0009. */
interface Rules {
	base: string;
	matcher: Ignore;
}

// `.git/info/exclude` never reaches a CI checkout either, so honoring it keeps
// local scans closer to CI. Only a real `.git` directory is read: a worktree's
// `.git` file points outside the root.
function excludeRules(root: string): Rules[] {
	const isDir = (path: string) => {
		try {
			return lstatSync(join(root, path)).isDirectory();
		} catch {
			return false;
		}
	};
	if (!isDir(".git") || !isDir(".git/info")) return [];
	const text = readIgnoreFile(join(root, ".git/info/exclude"));
	return text === undefined ? [] : [{ base: "", matcher: parseIgnore(text) }];
}

// Case-sensitive like git on Linux, where CI usually runs, so results don't
// depend on the machine's filesystem.
const parseIgnore = (text: string) => ignore({ ignorecase: false }).add(text);

// Like git, a deeper ignore file overrides a shallower one, so the last rule
// that matches decides.
function isIgnored(rules: Rules[], path: string, isDir: boolean): boolean {
	let ignored = false;
	for (const { base, matcher } of rules) {
		const relative = base ? path.slice(base.length + 1) : path;
		const result = matcher.test(isDir ? `${relative}/` : relative);
		if (result.ignored) ignored = true;
		else if (result.unignored) ignored = false;
	}
	return ignored;
}

function visit(repo: Repo, dir: string, parentRules: Rules[]): void {
	let names: string[];
	try {
		names = readdirSync(join(repo.root, dir));
	} catch (error) {
		if (!dir) throw error;
		repo.skipped.push({ path: dir, reason: "unreadable" });
		return;
	}
	// A `.git` here means some other checkout (worktree, submodule, nested clone).
	// Not ours, so don't scan it.
	if (dir && names.includes(".git")) return;
	// Code-unit order, not localeCompare, so the order never depends on the machine's locale.
	names.sort();
	let rules = parentRules;
	if (names.includes(".gitignore")) {
		const text = readIgnoreFile(join(repo.root, dir, ".gitignore"));
		if (text !== undefined) {
			rules = [...parentRules, { base: dir, matcher: parseIgnore(text) }];
		}
	}
	for (const name of names) {
		const path = dir ? `${dir}/${name}` : name;
		const stat = lstatSync(join(repo.root, path));
		// An ignored directory is never entered; git can't re-include files under it either.
		if (isIgnored(rules, path, stat.isDirectory())) continue;
		if (stat.isSymbolicLink()) {
			repo.skipped.push({ path, reason: "symlink" });
		} else if (stat.isDirectory()) {
			if (!IGNORED_DIRS.has(name)) visit(repo, path, rules);
		} else if (stat.isFile()) {
			repo.files.set(path, stat.size);
		} else {
			repo.skipped.push({ path, reason: "special" });
		}
	}
}

/**
 * Reads a walked file as UTF-8. Returns undefined for paths the walk did not list
 * (outside the root, symlinks, ignored, missing) and for files above MAX_FILE_SIZE.
 */
export function readText(repo: Repo, path: string): string | undefined {
	const normalized = posix.normalize(path);
	const size = repo.files.get(normalized);
	if (size === undefined || size > MAX_FILE_SIZE) return undefined;
	return readCapped(join(repo.root, normalized));
}

/** Reads an ignore file, or undefined unless it is a regular file within MAX_FILE_SIZE. */
function readIgnoreFile(absolute: string): string | undefined {
	try {
		// lstat first: opening a FIFO would block, and a symlink is never followed.
		const stat = lstatSync(absolute);
		if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return undefined;
		return readCapped(absolute);
	} catch {
		return undefined;
	}
}

function readCapped(absolute: string): string | undefined {
	// O_NOFOLLOW: refuse a file that was swapped for a symlink after the walk.
	// ponytail: guards the last path component only; a directory swapped for a
	// symlink mid-scan is not caught (Node has no openat). Add a realpath check if needed.
	const fd = openSync(
		absolute,
		constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
	);
	try {
		// Re-check on the open handle in case the file grew after the walk.
		if (fstatSync(fd).size > MAX_FILE_SIZE) return undefined;
		return readFileSync(fd, "utf8");
	} finally {
		closeSync(fd);
	}
}
