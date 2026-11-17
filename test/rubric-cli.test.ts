import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { stringify } from "yaml";

const cli = fileURLToPath(
	new URL("../src/rubric/validate-cli.ts", import.meta.url),
);
const fixture = JSON.parse(
	readFileSync(
		new URL("./fixtures/rubric/valid.json", import.meta.url),
		"utf8",
	),
);
const directories: string[] = [];

function directory() {
	const path = mkdtempSync(join(tmpdir(), "harness-rating-rubric-"));
	directories.push(path);
	return path;
}

function run(args: string[], cwd = process.cwd()) {
	return spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8" });
}

afterEach(() => {
	for (const path of directories.splice(0))
		rmSync(path, { recursive: true, force: true });
});

test("validates a JSON rubric file", () => {
	const result = run([resolve("test/fixtures/rubric/valid.json")]);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain("valid rubric v0.1.0");
});

test("validates YAML and preserves unquoted dates as strings", () => {
	const file = join(directory(), "rubric.yaml");
	writeFileSync(
		file,
		stringify(fixture).replaceAll('"2026-11-16"', "2026-11-16"),
	);
	const result = run([file]);
	expect(result.status).toBe(0);
	expect(result.stderr).toBe("");
});

test("auto-discovers rubric YAML files but excludes the source registry", () => {
	const cwd = directory();
	mkdirSync(join(cwd, "rubric"));
	writeFileSync(join(cwd, "rubric", "v0.1.yaml"), stringify(fixture));
	writeFileSync(
		join(cwd, "rubric", "sources.yaml"),
		"registry: not-a-rubric\n",
	);
	const result = run([], cwd);
	expect(result.status).toBe(0);
	expect(result.stdout).toContain("v0.1.yaml: valid rubric");
	expect(result.stdout).not.toContain("sources.yaml");
});

test("reports every failing file and exits nonzero", () => {
	const cwd = directory();
	const invalid = structuredClone(fixture);
	invalid.checks[0].sources = [];
	const first = join(cwd, "invalid.yaml");
	const second = join(cwd, "other.json");
	writeFileSync(first, stringify(invalid));
	writeFileSync(second, JSON.stringify(invalid));
	const result = run([first, second]);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain(first);
	expect(result.stderr).toContain(second);
	expect(result.stderr).toContain("A1");
	expect(result.stderr).toContain("Fix:");
});

test("fails discovery rather than silently validating a fixture", () => {
	const cwd = directory();
	mkdirSync(join(cwd, "rubric"));
	writeFileSync(
		join(cwd, "rubric", "sources.yaml"),
		"registry: not-a-rubric\n",
	);
	const result = run([], cwd);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("No rubric YAML files found");
	expect(result.stderr).toContain("Fix:");
});

test("fails clearly when the rubric directory is missing", () => {
	const result = run([], directory());
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("Fix:");
	expect(result.stderr).not.toContain("at Module");
});

test.each(["checks: [", "checks: []\nchecks: []\n", "checks: !unknown []"])(
	"rejects broken or unsupported YAML: %s",
	(content) => {
		const file = join(directory(), "invalid.yaml");
		writeFileSync(file, content);
		const result = run([file]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain(file);
		expect(result.stderr).toContain("Fix:");
	},
);

test("rejects a missing file without a stack trace", () => {
	const result = run([join(directory(), "missing.yaml")]);
	expect(result.status).toBe(1);
	expect(result.stderr).toContain("Fix:");
	expect(result.stderr).not.toContain("at Module");
});
