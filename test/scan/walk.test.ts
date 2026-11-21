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
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test("lists regular files in sorted order, skipping .git, node_modules, and nested repositories", () => {
	expect([...walk(root).files.keys()]).toEqual([
		"AGENTS.md",
		"big.txt",
		"docs/guide.md",
		"max.txt",
		"pkg/index.js",
	]);
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
