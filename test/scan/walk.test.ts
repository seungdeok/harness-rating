import { execFileSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { MAX_FILE_SIZE, readText, walk } from "../../src/scan/walk.ts";

let tmp: string;
let root: string;

// The committed fixture holds what git can store; symlinks, an oversized file,
// .git/, node_modules/, and a FIFO are added in a temp copy at test time.
beforeAll(() => {
	tmp = mkdtempSync(join(tmpdir(), "harness-rating-"));
	root = join(tmp, "repo");
	cpSync(new URL("../fixtures/unsafe", import.meta.url), root, {
		recursive: true,
	});
	mkdirSync(join(tmp, "outside"));
	writeFileSync(join(tmp, "outside", "secret.txt"), "secret");
	symlinkSync(join(tmp, "outside", "secret.txt"), join(root, "link-file"));
	symlinkSync(join(tmp, "outside"), join(root, "link-dir"));
	writeFileSync(join(root, "big.txt"), "x".repeat(MAX_FILE_SIZE + 1));
	writeFileSync(join(root, "max.txt"), "x".repeat(MAX_FILE_SIZE));
	mkdirSync(join(root, ".git"));
	writeFileSync(join(root, ".git", "HEAD"), "ref");
	mkdirSync(join(root, "pkg", "node_modules"), { recursive: true });
	writeFileSync(join(root, "pkg", "node_modules", "dep.js"), "");
	writeFileSync(join(root, "pkg", "index.js"), "");
	execFileSync("mkfifo", [join(root, "fifo")]);
	// Worktrees get a `.git` file, nested clones a `.git` dir. Both should be skipped.
	mkdirSync(join(root, "worktrees", "foo"), { recursive: true });
	writeFileSync(join(root, "worktrees", "foo", ".git"), "gitdir: ../../.git");
	writeFileSync(join(root, "worktrees", "foo", "move.py"), "");
	mkdirSync(join(root, "vendor", "lib", ".git"), { recursive: true });
	writeFileSync(join(root, "vendor", "lib", "AGENTS.md"), "");
	// Ignore rules: root .gitignore with negation, a nested one, and .git/info/exclude.
	writeFileSync(join(root, ".gitignore"), ".verify/\n*.log\n!keep.log\n");
	mkdirSync(join(root, ".verify"));
	writeFileSync(join(root, ".verify", "move.py"), "");
	writeFileSync(join(root, "debug.log"), "");
	writeFileSync(join(root, "keep.log"), "");
	writeFileSync(join(root, "pkg", ".gitignore"), "local.txt\n");
	writeFileSync(join(root, "pkg", "local.txt"), "");
	writeFileSync(join(root, "local.txt"), "");
	mkdirSync(join(root, ".git", "info"));
	writeFileSync(join(root, ".git", "info", "exclude"), "scratch.md\n");
	writeFileSync(join(root, "scratch.md"), "");
	writeFileSync(join(root, "UPPER.LOG"), "");
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test("lists regular files in sorted order, skipping .git, node_modules, nested repositories, and ignored files", () => {
	expect([...walk(root).files.keys()]).toEqual([
		".gitignore",
		"AGENTS.md",
		"UPPER.LOG",
		"big.txt",
		"docs/guide.md",
		"keep.log",
		"local.txt",
		"max.txt",
		"pkg/.gitignore",
		"pkg/index.js",
	]);
});

test("applies .gitignore relative to its directory, with negation and .git/info/exclude", () => {
	const files = walk(root).files;
	expect(files.has(".verify/move.py")).toBe(false);
	expect(files.has("debug.log")).toBe(false);
	expect(files.has("keep.log")).toBe(true);
	expect(files.has("pkg/local.txt")).toBe(false);
	// pkg/.gitignore only covers pkg/, so the root file with the same name stays.
	expect(files.has("local.txt")).toBe(true);
	expect(files.has("scratch.md")).toBe(false);
	// Case-sensitive, like git on Linux.
	expect(files.has("UPPER.LOG")).toBe(true);
});

test("applies .gitignore without a .git directory", () => {
	const plain = join(tmp, "plain");
	mkdirSync(join(plain, "out"), { recursive: true });
	writeFileSync(join(plain, ".gitignore"), "out/\n");
	writeFileSync(join(plain, "out", "a.py"), "");
	writeFileSync(join(plain, "a.ts"), "");
	expect([...walk(plain).files.keys()]).toEqual([".gitignore", "a.ts"]);
});

test("reports symlinked files and directories as skipped, never read", () => {
	const repo = walk(root);
	expect(repo.skipped).toContainEqual({ path: "link-file", reason: "symlink" });
	expect(repo.skipped).toContainEqual({ path: "link-dir", reason: "symlink" });
	expect(readText(repo, "link-file")).toBeUndefined();
	expect(readText(repo, "link-dir/secret.txt")).toBeUndefined();
});

test("skips special files such as FIFOs", () => {
	expect(walk(root).skipped).toContainEqual({
		path: "fifo",
		reason: "special",
	});
});

test("lists oversized files with their size but returns no content", () => {
	const repo = walk(root);
	expect(repo.files.get("big.txt")).toBe(MAX_FILE_SIZE + 1);
	expect(readText(repo, "big.txt")).toBeUndefined();
	expect(readText(repo, "max.txt")).toHaveLength(MAX_FILE_SIZE);
});

test("never reads a path outside the root", () => {
	const repo = walk(root);
	expect(readText(repo, "../outside/secret.txt")).toBeUndefined();
	expect(readText(repo, "docs/../../outside/secret.txt")).toBeUndefined();
	expect(readText(repo, join(tmp, "outside", "secret.txt"))).toBeUndefined();
	expect(readText(repo, "docs/../AGENTS.md")).toContain("# Fixture: unsafe");
});
