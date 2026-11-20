import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import { releaseMode } from "../scripts/release-tag.ts";

describe("release tag policy", () => {
	test.each(["0.0.0", "0.1.0", "12.34.56"])(
		"publishes only a matching stable version: %s",
		(version) => {
			expect(releaseMode(`v${version}`, version)).toBe("publish");
		},
	);

	test.each(["v0.0.0-dry-run.22", "v0.0.0-dry-run.22.1"])(
		"reserves %s for dry-run only",
		(tag) => {
			expect(releaseMode(tag, "0.0.0")).toBe("dry-run");
		},
	);

	test.each([
		"v0.1.0",
		"0.0.0",
		"v0.0.0-beta.1",
		"v0.0.0+build",
		"v00.0.0",
		"v0.0.0-dry-run",
		"v0.0.0-dry-run.01",
		"v0.0.0-dry-run.22x",
		"v0.1.0-dry-run.22",
		"v0.0.0\npublish",
		"v0.0.0; echo publish",
		"",
	])("fails closed on an unsupported or mismatched tag: %j", (tag) => {
		expect(() => releaseMode(tag, "0.0.0")).toThrow();
	});

	test.each(["", "01.0.0", "0.1.0-beta.1"])(
		"rejects unsupported package versions: %j",
		(version) => {
			expect(() => releaseMode(`v${version}`, version)).toThrow();
		},
	);
});

const tmp = mkdtempSync(join(tmpdir(), "harness-rating-release-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

test("tag CLI writes only validated mode to GitHub output", () => {
	const output = join(tmp, "output");
	const version = JSON.parse(readFileSync("package.json", "utf8")).version;
	const invoke = (tag: string) =>
		spawnSync(process.execPath, ["scripts/release-tag.ts"], {
			encoding: "utf8",
			env: { ...process.env, RELEASE_TAG: tag, GITHUB_OUTPUT: output },
		});
	expect(invoke(`v${version}-dry-run.22`).status).toBe(0);
	expect(readFileSync(output, "utf8")).toBe("mode=dry-run\n");
	expect(invoke("v999.0.0").status).toBe(1);
	expect(readFileSync(output, "utf8")).toBe("mode=dry-run\n");
});

describe("release workflow contract", () => {
	const workflow = () =>
		parse(readFileSync(".github/workflows/release.yml", "utf8"));

	test("runs only for v* tag pushes with read-only default permissions", () => {
		const config = workflow();
		expect(config.on).toEqual({ push: { tags: ["v*"] } });
		expect(config.permissions).toEqual({ contents: "read" });
		expect(config.concurrency["cancel-in-progress"]).toBe(false);
	});

	test("verifies and dry-runs a tarball without publishing permission", () => {
		const job = workflow().jobs.verify;
		expect(job.permissions).toBeUndefined();
		expect(job.outputs.mode).toBe(`\${{ steps.tag.outputs.mode }}`);
		const commands = job.steps
			.map((step: { run?: string }) => step.run ?? "")
			.join("\n");
		for (const command of [
			"npm ci",
			"npm run typecheck",
			"npm run lint",
			"npm test",
			"npm run validate:rubric",
			"npm run check:rubric-docs",
			"npm run build",
			"npm pack --ignore-scripts",
			"--min-level 4",
			"npm publish ./package/harness-rating.tgz --dry-run --provenance --access public --ignore-scripts",
		]) {
			expect(commands).toContain(command);
		}
		expect(commands).toContain(
			'"$RUNNER_TEMP/release-smoke/node_modules/.bin/harness-rating" --version',
		);
		expect(commands).toContain(
			'"$RUNNER_TEMP/release-smoke/node_modules/.bin/harness-rating" test/fixtures/levels/l4-sustained --min-level 4',
		);
		expect(commands).toContain(
			'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
		);
		const tag = job.steps.find((step: { id?: string }) => step.id === "tag");
		expect(tag.env.RELEASE_TAG).toBe(`\${{ github.ref_name }}`);
		expect(tag.run).toBe("node scripts/release-tag.ts");
		const ancestry = job.steps.find((step: { run?: string }) =>
			step.run?.includes("git merge-base"),
		);
		expect(ancestry.if).toBe("steps.tag.outputs.mode == 'publish'");
	});

	test("publishes only the verified artifact with narrowly scoped OIDC permission", () => {
		const config = workflow();
		const job = config.jobs.publish;
		expect(job.needs).toBe("verify");
		expect(job.if).toBe("needs.verify.outputs.mode == 'publish'");
		expect(job.environment).toBe("npm");
		expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
		expect(
			job.steps.some((step: { uses?: string }) =>
				step.uses?.startsWith("actions/checkout@"),
			),
		).toBe(false);
		const upload = config.jobs.verify.steps.find((step: { uses?: string }) =>
			step.uses?.startsWith("actions/upload-artifact@"),
		);
		const download = job.steps.find((step: { uses?: string }) =>
			step.uses?.startsWith("actions/download-artifact@"),
		);
		expect(upload?.with?.name).toBe(download?.with?.name);
		expect(upload?.with?.["if-no-files-found"]).toBe("error");
		expect(download?.with?.path).toBe("package");
		expect(download?.with?.["digest-mismatch"]).toBe("error");
		expect(upload?.with?.["retention-days"]).toBe(7);
		expect(job.steps.at(-1)?.run).toBe(
			"npm publish ./package/harness-rating.tgz --provenance --access public --ignore-scripts",
		);
	});

	test("pins actions, disables credential persistence and release caches, and uses no npm secret", () => {
		const config = workflow();
		const steps = Object.values(config.jobs).flatMap(
			(job) =>
				(job as { steps: { uses?: string; with?: Record<string, unknown> }[] })
					.steps,
		);
		for (const step of steps) {
			if (step.uses)
				expect(step.uses).toMatch(/^actions\/[a-z-]+@[a-f0-9]{40}$/);
			if (step.uses?.startsWith("actions/setup-node@")) {
				expect(step.with?.["node-version"]).toBe(24);
				expect(step.with?.["package-manager-cache"]).toBe(false);
				expect(step.with?.cache).toBeUndefined();
			}
			if (step.uses?.startsWith("actions/checkout@"))
				expect(step.with?.["persist-credentials"]).toBe(false);
		}
		expect(JSON.stringify(config)).not.toContain("secrets.");
	});
});
