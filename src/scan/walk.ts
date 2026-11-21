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
	visit(repo, "");
	return repo;
}

function visit(repo: Repo, dir: string): void {
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
	for (const name of names) {
		const path = dir ? `${dir}/${name}` : name;
		const stat = lstatSync(join(repo.root, path));
		if (stat.isSymbolicLink()) {
			repo.skipped.push({ path, reason: "symlink" });
		} else if (stat.isDirectory()) {
			if (!IGNORED_DIRS.has(name)) visit(repo, path);
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
	// O_NOFOLLOW: refuse a file that was swapped for a symlink after the walk.
	// ponytail: guards the last path component only; a directory swapped for a
	// symlink mid-scan is not caught (Node has no openat). Add a realpath check if needed.
	const fd = openSync(
		join(repo.root, normalized),
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
