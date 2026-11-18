import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";
import { type Repo, walk } from "../../src/scan/walk.ts";

const tmp = mkdtempSync(join(tmpdir(), "harness-rating-test-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

/** Writes `files` (repo-relative path → content) into a fresh temp directory and walks it. */
export function makeRepo(files: Record<string, string>): Repo {
	const root = mkdtempSync(join(tmp, "repo-"));
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return walk(root);
}
