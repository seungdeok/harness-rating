import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { parse, stringify } from "yaml";
import type { Rubric } from "../src/rubric/types.ts";

const generator = fileURLToPath(
	new URL("../scripts/gen-rubric-docs.ts", import.meta.url),
);
const yaml = readFileSync(
	new URL("../rubric/v0.1.yaml", import.meta.url),
	"utf8",
);
const rubric = parse(yaml) as Rubric;
const directories: string[] = [];
const outputs = ["docs/rubric.md", "docs/levels.md"];

function first<T>(items: T[]): T {
	const item = items[0];
	assert.ok(item);
	return item;
}

function directory() {
	const cwd = mkdtempSync(join(tmpdir(), "harness-rating-docs-"));
	directories.push(cwd);
	mkdirSync(join(cwd, "rubric"));
	writeFileSync(join(cwd, "rubric/v0.1.yaml"), yaml);
	return cwd;
}

function run(cwd: string, ...args: string[]) {
	return spawnSync(process.execPath, [generator, ...args], {
		cwd,
		encoding: "utf8",
	});
}

function docs(cwd: string) {
	return outputs.map((file) => readFileSync(join(cwd, file), "utf8"));
}

function prose(markdown: string) {
	return markdown
		.replace(/\\([\\`*_[\]#|])/g, "$1")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

afterEach(() => {
	for (const cwd of directories.splice(0))
		rmSync(cwd, { recursive: true, force: true });
});

test("generates complete docs deterministically from the public rubric", () => {
	const cwd = directory();
	expect(run(cwd).status).toBe(0);
	const [checks = "", levels = ""] = docs(cwd);
	const content = prose(checks);
	for (const check of rubric.checks) {
		expect(checks).toContain(`## ${check.id}\n`);
		expect(content).toContain(check.title.replace(/\r?\n/g, " "));
		expect(checks).toContain(check.check);
		expect(content).toContain(check.fix_hint.replace(/\r?\n/g, " "));
		for (const source of check.sources) {
			expect(content).toContain(source.org.replace(/\r?\n/g, " "));
			expect(checks).toContain(source.url);
			expect(content).toContain(source.recommendation.replace(/\r?\n/g, " "));
			expect(checks).toContain(source.checked);
		}
	}
	expect(checks).toContain('`{"max_lines":200}`');
	expect(checks).toContain("has-type-checkable-language");
	expect(checks).toContain("claude-code");
	expect(checks).toContain("agents-md");
	expect(levels).toContain("every lower level");
	expect(levels).toContain("not an industry standard");
	expect(levels).toContain("L0");
	expect(levels).toContain(
		"[F2](rubric.md#f2) AND (([D1](rubric.md#d1) AND [D2](rubric.md#d2)) OR [F1](rubric.md#f1))",
	);
	expect(levels).toContain(
		"[A2](rubric.md#a2) AND [A4](rubric.md#a4) AND [E1](rubric.md#e1) AND ([F3](rubric.md#f3) OR [F4](rubric.md#f4))",
	);
	expect(run(cwd).status).toBe(0);
	expect(docs(cwd)).toEqual([checks, levels]);
	expect(run(cwd, "--check").status).toBe(0);
});

test("the committed docs match the public rubric", () => {
	const result = run(fileURLToPath(new URL("..", import.meta.url)), "--check");
	expect(result.stderr).toBe("");
	expect(result.status).toBe(0);
});

test.each(outputs)(
	"detects an edited %s without writing either doc",
	(file) => {
		const cwd = directory();
		expect(run(cwd).status).toBe(0);
		writeFileSync(join(cwd, file), "Manually edited.\n");
		const before = docs(cwd);
		const result = run(cwd, "--check");
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(file);
		expect(result.stderr).toContain("npm run generate:rubric-docs");
		expect(docs(cwd)).toEqual(before);
		expect(run(cwd).status).toBe(0);
		expect(run(cwd, "--check").status).toBe(0);
	},
);

test("missing docs fail check mode without creating the docs directory", () => {
	const cwd = directory();
	const result = run(cwd, "--check");
	expect(result.status).toBe(1);
	for (const file of outputs) expect(result.stderr).toContain(file);
	expect(existsSync(join(cwd, "docs"))).toBe(false);
});

test.each([
	[
		"check title",
		(data: Rubric) => {
			first(data.checks).title = "Updated title";
		},
	],
	[
		"recommendation",
		(data: Rubric) => {
			first(first(data.checks).sources).recommendation =
				"Updated recommendation";
		},
	],
	[
		"checked date",
		(data: Rubric) => {
			first(first(data.checks).sources).checked = "2026-11-18";
		},
	],
	[
		"level requirement",
		(data: Rubric) => {
			data.levels.L1 = { requires: ["A1"] };
		},
	],
] as const)("YAML-only changes to %s make docs stale", (_name, mutate) => {
	const cwd = directory();
	expect(run(cwd).status).toBe(0);
	const before = docs(cwd);
	const changed = structuredClone(rubric);
	mutate(changed);
	writeFileSync(join(cwd, "rubric/v0.1.yaml"), stringify(changed));
	expect(run(cwd, "--check").status).toBe(1);
	expect(docs(cwd)).toEqual(before);
	expect(run(cwd).status).toBe(0);
	expect(docs(cwd)).not.toEqual(before);
	expect(run(cwd, "--check").status).toBe(0);
});

test.each([
	"checks: [",
	"checks: []\nchecks: []\n",
	"checks: !unknown []",
	"checks: []",
	yaml.replace("tier: A", "tier: C"),
])("rejects invalid rubric data before writing docs (%#)", (invalid) => {
	const cwd = directory();
	expect(run(cwd).status).toBe(0);
	const before = docs(cwd);
	writeFileSync(join(cwd, "rubric/v0.1.yaml"), invalid);
	for (const args of [[], ["--check"]]) {
		const result = run(cwd, ...args);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("rubric/v0.1.yaml");
		expect(result.stderr).not.toContain("at Module");
		expect(docs(cwd)).toEqual(before);
	}
});

test("preserves recursive grouping and sorts levels by number", () => {
	const cwd = directory();
	const changed = structuredClone(rubric);
	changed.levels = {
		L2: { requires: [{ all_of: ["A1", { any_of: ["C1", "C2"] }] }] },
		L1: { requires: ["A1"] },
	};
	writeFileSync(join(cwd, "rubric/v0.1.yaml"), stringify(changed));
	expect(run(cwd).status).toBe(0);
	const levels = docs(cwd)[1] ?? "";
	expect(levels.indexOf("| L1 |")).toBeLessThan(levels.indexOf("| L2 |"));
	expect(levels).toContain(
		"([A1](rubric.md#a1) AND ([C1](rubric.md#c1) OR [C2](rubric.md#c2)))",
	);
});

test("escapes Markdown-sensitive prose without losing its content", () => {
	const cwd = directory();
	const changed = structuredClone(rubric);
	const title = "A [label] | <tag> & *text*\nnext line";
	first(changed.checks).title = title;
	writeFileSync(join(cwd, "rubric/v0.1.yaml"), stringify(changed));
	expect(run(cwd).status).toBe(0);
	const checks = docs(cwd)[0] ?? "";
	expect(checks).toContain(
		"A \\[label\\] \\| &lt;tag&gt; &amp; \\*text\\* next line",
	);
	expect(prose(checks)).toContain(title.replaceAll("\n", " "));
});

test("rejects unknown arguments instead of silently generating docs", () => {
	const cwd = directory();
	const result = run(cwd, "--chek");
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("Usage:");
	expect(existsSync(join(cwd, "docs"))).toBe(false);
});
