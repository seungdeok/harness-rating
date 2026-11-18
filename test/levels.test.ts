import { spawnSync } from "node:child_process";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { MAX_FILE_SIZE } from "../src/scan/walk.ts";

const tmp = mkdtempSync(join(tmpdir(), "harness-rating-levels-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const fixture = (name: string) =>
	fileURLToPath(new URL(`fixtures/levels/${name}`, import.meta.url));

/**
 * Runs the CLI twice and returns the JSON report, after checking both runs match byte for
 * byte. The package version is masked so a release bump does not rewrite every snapshot;
 * test/cli.test.ts checks it.
 */
function scanTwice(root: string): string {
	const outputs = [1, 2].map((run) => {
		const out = join(tmp, `${basename(root)}-${run}.json`);
		const { status, stderr } = spawnSync(
			process.execPath,
			["src/cli.ts", root, "--json", out],
			{ encoding: "utf8" },
		);
		expect(stderr).toBe("");
		expect(status).toBe(0);
		return readFileSync(out, "utf8");
	});
	expect(outputs[1]).toBe(outputs[0]);
	return (outputs[0] as string).replace(
		/^ {2}"version": "[^"]+"/m,
		'  "version": "<package>"',
	);
}

describe("level fixtures", () => {
	test.each([
		["empty", 0],
		["l1-guided", 1],
		["l3-enforced", 3],
		["l4-sustained", 4],
		// ADR 0001: agents-md supports E1 through Codex config, so the missing review step is
		// unmet (see the snapshot), not capped. No v0.1 check leaves agents-md out of supported_by.
		["agents-md-only", 3],
	])("%s reaches L%i with deterministic JSON", async (name, level) => {
		const json = scanTwice(fixture(name));
		expect(JSON.parse(json).level).toBe(level);
		await expect(json).toMatchFileSnapshot(
			`fixtures/levels/__snapshots__/${name}.json`,
		);
	});

	// Git cannot store symlinks to outside paths or oversized files portably, so they are
	// added to a temp copy of the committed `unsafe` fixture at test time.
	test("unsafe ignores symlinks and oversized files", async () => {
		const root = join(tmp, "unsafe");
		cpSync(fileURLToPath(new URL("fixtures/unsafe", import.meta.url)), root, {
			recursive: true,
		});
		const outside = join(tmp, "outside");
		mkdirSync(outside);
		writeFileSync(join(outside, "CLAUDE.md"), "```sh\nnpm test\n```\n");
		symlinkSync(join(outside, "CLAUDE.md"), join(root, "CLAUDE.md"));
		symlinkSync(outside, join(root, ".claude"));
		writeFileSync(
			join(root, "GEMINI.md"),
			`\`\`\`sh\nnpm test\n\`\`\`\n${"x".repeat(MAX_FILE_SIZE)}`,
		);

		const json = scanTwice(root);
		expect(json).not.toContain(tmp);
		const report = JSON.parse(json);
		expect(report.agents).toEqual(["agents-md"]);
		expect(report.level).toBe(0);
		await expect(json).toMatchFileSnapshot(
			"fixtures/levels/__snapshots__/unsafe.json",
		);
	});
});
