import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { timingChecks } from "../../src/checks/timing.ts";
import { MAX_FILE_SIZE, walk } from "../../src/scan/walk.ts";
import { makeRepo } from "../support/temp-repo.ts";

function run(check: string, files: Record<string, string>) {
	const fn = timingChecks[check];
	if (!fn) throw new Error(`no check ${check}`);
	return fn({ repo: makeRepo(files), agents: [], params: {} });
}

const scripts = JSON.stringify({
	scripts: { test: "vitest run", lint: "biome check" },
});
const workflow = (commands: string) => `on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: |
${commands
	.split("\n")
	.map((line) => `          ${line}`)
	.join("\n")}
`;

test("fixture timing results are deterministic and match rubric check names", () => {
	const repo = walk(
		fileURLToPath(new URL("../fixtures/timing/checked/", import.meta.url)),
	);
	const scan = () =>
		Object.fromEntries(
			Object.entries(timingChecks).map(([name, check]) => [
				name,
				check({ repo, agents: [], params: {} }),
			]),
		);
	expect(scan()).toEqual(scan());
	expect(scan()).toMatchInlineSnapshot(`
		{
		  "ci-tests-and-lint": {
		    "status": "pass",
		  },
		  "drift-sensor": {
		    "status": "pass",
		  },
		  "pre-commit": {
		    "status": "pass",
		  },
		  "scheduled-workflow": {
		    "status": "pass",
		  },
		}
	`);
});

describe("F1 pre-commit", () => {
	test.each([
		[
			".husky/pre-commit",
			'#!/bin/sh\n. "$(dirname "$0")/_/husky.sh"\nnpm test\n',
		],
		[".husky/pre-commit", '# checks (fast)\necho "checks (fast)"\nnpm test'],
		[
			"lefthook.yml",
			"pre-commit:\n  commands:\n    lint:\n      run: npm run lint",
		],
		[".lefthook.yaml", "pre-commit:\n  jobs:\n    - run: npm test"],
		[".config/lefthook.yml", "pre-commit:\n  jobs:\n    - run: npm test"],
		[
			".pre-commit-config.yaml",
			"repos:\n  - repo: https://github.com/pre-commit/pre-commit-hooks\n    rev: v5.0.0\n    hooks:\n      - id: check-yaml",
		],
	])("passes with active configuration in %s", (path, text) => {
		expect(run("pre-commit", { [path]: text })).toEqual({ status: "pass" });
	});

	test.each<Record<string, string>>([
		{},
		{ ".husky/pre-commit": "#!/bin/sh\n# npm test\n" },
		{ ".husky/pre-commit": '. "$(dirname "$0")/_/husky.sh"' },
		{ "lefthook.yml": "pre-commit: {}" },
		{
			"lefthook.yml": "pre-push:\n  commands:\n    test:\n      run: npm test",
		},
		{ "lefthook.yml": "pre-commit: [broken" },
		{ ".pre-commit-config.yaml": "repos: []" },
		{ ".pre-commit-config.yaml": "repos:\n  - repo: local\n    hooks: []" },
		{
			".pre-commit-config.yaml":
				"default_stages: [pre-push]\nrepos:\n  - repo: remote\n    hooks:\n      - id: check",
		},
	])("fails without a configured pre-commit command: %j", (files) => {
		expect(run("pre-commit", files)).toMatchObject({ status: "fail" });
	});

	test("hook stages override framework defaults", () => {
		expect(
			run("pre-commit", {
				".pre-commit-config.yaml":
					"default_stages: [pre-push]\nrepos:\n  - repo: remote\n    hooks:\n      - id: check\n        stages: [pre-commit]",
			}),
		).toEqual({ status: "pass" });
	});

	test("reads Lefthook script entries only when the local script exists", () => {
		const config = {
			"lefthook.yml":
				"pre-commit:\n  scripts:\n    check.sh:\n      runner: bash",
		};
		expect(run("pre-commit", config)).toMatchObject({ status: "fail" });
		expect(
			run("pre-commit", {
				...config,
				".lefthook/pre-commit/check.sh": "npm test",
			}),
		).toEqual({ status: "pass" });
	});

	test("does not count skipped Lefthook commands or local framework hooks without entry", () => {
		expect(
			run("pre-commit", {
				"lefthook.yml":
					"pre-commit:\n  jobs:\n    - run: npm test\n      skip: true",
				".pre-commit-config.yaml":
					"repos:\n  - repo: local\n    hooks:\n      - id: test",
			}),
		).toMatchObject({ status: "fail" });
	});
});

describe("F2 ci-tests-and-lint", () => {
	test.each(["job", "step"])(
		"does not count a statically disabled %s",
		(where) => {
			const jobIf = where === "job" ? "    if: false\n" : "";
			const stepIf = where === "step" ? "        if: false\n" : "";
			expect(
				run("ci-tests-and-lint", {
					"package.json": scripts,
					".github/workflows/ci.yml": `on: push\njobs:\n  check:\n${jobIf}    steps:\n      - run: npm test && npm run lint\n${stepIf}`,
				}),
			).toMatchObject({ status: "fail" });
		},
	);

	test("resolves literal cd within a run step and resets it for the next step", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				"web/package.json": '{"scripts":{"test":"vitest"}}',
				".github/workflows/ci.yml":
					"on: push\njobs:\n  check:\n    steps:\n      - run: cd web && npm test\n      - run: npm run lint",
			}),
		).toEqual({ status: "pass" });
	});
	test.each([
		"npm test\nnpm run lint",
		"npm test && npm run lint",
		"npm run-script test && npm run-script lint",
		"pnpm run-script test && pnpm run-script lint",
		"# checks (fast)\nnpm test\nnpm run lint",
		'echo "checks (fast)"\nnpm test\nnpm run lint',
		"pnpm run test\npnpm lint",
		"yarn test\nyarn run lint",
		"bun run test\nbun run lint",
		"npm run test -- --run\nnpm run lint -- --fix=false",
	])("passes with existing package scripts: %s", (commands) => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				".github/workflows/ci.yml": workflow(commands),
			}),
		).toEqual({ status: "pass" });
	});

	test("combines jobs within one workflow", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				".github/workflows/ci.yaml":
					"on: push\njobs:\n  test:\n    steps:\n      - run: npm test\n  lint:\n    steps:\n      - run: npm run lint",
			}),
		).toEqual({ status: "pass" });
	});

	test.each([
		"npm test",
		"npm run lint",
		"# npm test\n# npm run lint",
		'echo "npm test && npm run lint"',
		"echo npm test; echo npm run lint",
		"npm install test lint",
		"npm test && npm lint",
		"yarn run-script test && yarn run-script lint",
		"bun run-script test && bun run-script lint",
		"bun test && bun lint",
		"yarn run test --binaries-only && yarn run lint",
		"yarn run test -B && yarn run lint",
		"npm test -wother && npm run lint -wother",
		"npx test && npx lint",
		"echo `x && npm test && npm run lint && x`",
		"cat <<EOF\nnpm test\nnpm run lint\nEOF",
		"npm test --prefix other && npm run lint --prefix other",
		"cd ~\nnpm test\nnpm run lint",
		"cd missing\nnpm test\nnpm run lint",
		"cd missing/..\nnpm test\nnpm run lint",
		"cd package.json/..\nnpm test\nnpm run lint",
	])("fails when CI does not invoke both checks: %s", (commands) => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				".github/workflows/ci.yml": workflow(commands),
			}),
		).toMatchObject({ status: "fail" });
	});

	const workspace = {
		"package.json": JSON.stringify({
			workspaces: ["./api/", "packages/*", "!packages/old"],
			scripts: { lint: "biome check" },
		}),
		"pnpm-workspace.yaml":
			"packages:\n  - ./api/\n  - packages/*\n  - '!packages/old'\n",
		"api/package.json": '{"name":"api","scripts":{"test":"vitest"}}',
		"packages/web/package.json":
			'{"name":"@acme/web","scripts":{"test":"vitest"}}',
		"packages/old/package.json": '{"name":"old","scripts":{"test":"vitest"}}',
		"examples/demo/package.json": '{"name":"demo","scripts":{"test":"vitest"}}',
	};

	test.each([
		"pnpm lint\npnpm --filter api test",
		"pnpm lint\npnpm --filter=api run test",
		"pnpm lint\npnpm -F api test",
		"pnpm lint\npnpm --filter @acme/web test",
		"npm run lint\nnpm test -w api",
		"npm run lint\nnpm run test --workspace=api",
		"npm run lint\nnpm test --workspace @acme/web",
	])("resolves a literal workspace package name: %s", (commands) => {
		expect(
			run("ci-tests-and-lint", {
				...workspace,
				".github/workflows/ci.yml": workflow(commands),
			}),
		).toEqual({ status: "pass" });
	});

	test.each([
		"pnpm --filter missing test",
		"pnpm --filter web test",
		"pnpm --filter 'api...' test",
		"pnpm --filter '...api' test",
		"pnpm --filter ./api test",
		"pnpm --filter '!web' test",
		"pnpm --filter 'a*' test",
		"pnpm --filter api --filter @acme/web test",
		"pnpm --filter test",
		// Exist, but aren't in the workspace.
		"pnpm --filter old test",
		"pnpm --filter demo test",
		"npm test -w demo",
		// The filter goes to the root script, and the root has no test.
		"pnpm test --filter api",
		"pnpm run test -F api",
		"npm test -- --workspace=api",
		// A valid filter doesn't excuse flags we already refuse.
		"pnpm --filter api -w test",
		"pnpm --filter api --workspace-root test",
		"pnpm --filter api --recursive test",
		"npm test -w api --workspaces",
		"npm test --filter api",
	])("does not guess other package selections: %s", (command) => {
		expect(
			run("ci-tests-and-lint", {
				...workspace,
				".github/workflows/ci.yml": workflow(`pnpm lint\n${command}`),
			}),
		).toMatchObject({ status: "fail" });
	});

	test("does not resolve a package name shared by two manifests", () => {
		expect(
			run("ci-tests-and-lint", {
				...workspace,
				"packages/copy/package.json":
					'{"name":"api","scripts":{"test":"vitest"}}',
				".github/workflows/ci.yml": workflow(
					"pnpm lint\npnpm --filter api test",
				),
			}),
		).toMatchObject({ status: "fail" });
	});

	test("does not combine unrelated workflows", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				".github/workflows/test.yml": workflow("npm test"),
				".github/workflows/lint.yml": workflow("npm run lint"),
			}),
		).toMatchObject({ status: "fail" });
	});

	test.each([
		"{}",
		'{"scripts":{"test":"vitest"}}',
		'{"scripts":{"test":"vitest","lint":""}}',
		"{broken",
	])("rejects missing/empty scripts: %s", (manifest) => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": manifest,
				".github/workflows/ci.yml": workflow("npm test && npm run lint"),
			}),
		).toMatchObject({ status: "fail" });
	});

	test("recognizes test and lint script variants", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": JSON.stringify({
					scripts: { "test:unit": "vitest", "lint:ci": "biome check" },
				}),
				".github/workflows/ci.yml": workflow("pnpm test:unit && pnpm lint:ci"),
			}),
		).toEqual({ status: "pass" });
	});

	test("requires npm run for custom test script names", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": JSON.stringify({
					scripts: { "test:unit": "vitest", lint: "biome check" },
				}),
				".github/workflows/ci.yml": workflow("npm test:unit && npm run lint"),
			}),
		).toMatchObject({ status: "fail" });
	});

	test.each(["defaults:\n  run:\n    working-directory: web\n", ""])(
		"resolves package scripts using working-directory defaults: %s",
		(defaults) => {
			const jobDefaults = defaults
				? ""
				: "    defaults:\n      run:\n        working-directory: web\n";
			expect(
				run("ci-tests-and-lint", {
					"web/package.json": scripts,
					".github/workflows/ci.yml": `${defaults}on: push\njobs:\n  check:\n${jobDefaults}    steps:\n      - run: npm test && npm run lint`,
				}),
			).toEqual({ status: "pass" });
		},
	);

	test("step working-directory overrides defaults without leaking to the next step", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				"web/package.json": '{"scripts":{"test":"vitest"}}',
				".github/workflows/ci.yml":
					"on: push\njobs:\n  check:\n    steps:\n      - run: npm test\n        working-directory: web\n      - run: npm run lint",
			}),
		).toEqual({ status: "pass" });
	});

	test.each([".", "./", "web", "web/", "./web/", "web/..", "web/../web/"])(
		"resolves equivalent literal directory spellings: %s",
		(directory) => {
			expect(
				run("ci-tests-and-lint", {
					"package.json": scripts,
					"web/package.json": scripts,
					".github/workflows/ci.yml": `${workflow("npm test && npm run lint")}        working-directory: ${directory}\n`,
				}),
			).toEqual({ status: "pass" });
			expect(
				run("ci-tests-and-lint", {
					"package.json": scripts,
					"web/package.json": scripts,
					".github/workflows/ci.yml": workflow(
						`cd ${directory} && npm test && npm run lint`,
					),
				}),
			).toEqual({ status: "pass" });
		},
	);

	test.each(["missing/..", "package.json/.."])(
		"does not normalize away invalid working-directory components: %s",
		(directory) => {
			expect(
				run("ci-tests-and-lint", {
					"package.json": scripts,
					".github/workflows/ci.yml": `${workflow("npm test && npm run lint")}        working-directory: ${directory}\n`,
				}),
			).toMatchObject({ status: "fail" });
		},
	);

	test.each(["../outside", "/tmp", `\${{ matrix.directory }}`])(
		"rejects unsafe or dynamic working directories: %s",
		(directory) => {
			expect(
				run("ci-tests-and-lint", {
					"package.json": scripts,
					".github/workflows/ci.yml": `${workflow("npm test && npm run lint")}        working-directory: ${directory}\n`,
				}),
			).toMatchObject({ status: "fail" });
		},
	);

	test("ignores non-workflows, invalid shapes, and names rather than run steps", () => {
		expect(
			run("ci-tests-and-lint", {
				"package.json": scripts,
				".gitlab-ci.yml": workflow("npm test && npm run lint"),
				".github/workflows/nested/ci.yml": workflow("npm test && npm run lint"),
				".github/workflows/example.txt": workflow("npm test && npm run lint"),
				".github/workflows/broken.yml": "jobs: [bad",
				".github/workflows/names.yml":
					"jobs:\n  check:\n    steps:\n      - name: npm test && npm run lint\n        uses: actions/checkout@v4",
			}),
		).toMatchObject({ status: "fail" });
	});
});

describe("F3 drift-sensor", () => {
	test.each([
		[
			".github/dependabot.yml",
			"version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly",
		],
		["renovate.json", '{"extends":["config:recommended"]}'],
		[
			".github/renovate.json",
			'{"packageRules":[{"matchPackageNames":["*"],"automerge":false}]}',
		],
		["knip.json", '{"entry":["src/index.ts"],"project":["src/**/*.ts"]}'],
		[".nycrc", '{"all":true,"include":["src/**/*.ts"]}'],
		[".nycrc.yaml", "reporter: [text, lcov]"],
		[".coveragerc", "[run]\nbranch = True\nsource = src"],
		["package.json", '{"nyc":{"all":true}}'],
		["package.json", '{"knip":{"entry":["src/index.ts"]}}'],
		["package.json", '{"renovate":{"extends":["config:recommended"]}}'],
	])("passes with content in %s", (path, text) => {
		expect(run("drift-sensor", { [path]: text })).toEqual({ status: "pass" });
	});

	test.each<Record<string, string>>([
		{},
		{ ".github/dependabot.yml": "" },
		{ ".github/dependabot.yml": "version: 2\nupdates: []" },
		{
			".github/dependabot.yml":
				"version: 2\nupdates:\n  - package-ecosystem: npm",
		},
		{ "renovate.json": "{}" },
		{ ".renovaterc": 'extends: ["config:recommended"]' },
		{ "renovate.json": '{"enabled":false,"extends":["config:recommended"]}' },
		{ "knip.json": "{}" },
		{ ".nycrc": "{}" },
		{ ".nycrc": "{bad" },
		{ ".coveragerc": "# [run]\n# source = src" },
		{ "package.json": '{"devDependencies":{"knip":"1.0.0"}}' },
		{ "vitest.config.ts": 'throw new Error("must not execute config")' },
	])("fails without supported drift configuration: %j", (files) => {
		expect(run("drift-sensor", files)).toMatchObject({ status: "fail" });
	});

	test.each<Record<string, string>>([
		{
			"pnpm-workspace.yaml": "packages:\n  - api\n  - web/*",
			"web/app/package.json": '{"name":"web"}',
			"web/app/knip.json": '{"entry":["src/index.ts"]}',
		},
		{
			"package.json": '{"workspaces":["packages/*"]}',
			"packages/a/package.json": '{"knip":{"entry":["src/index.ts"]}}',
		},
		{
			"package.json": '{"workspaces":{"packages":["packages/*"]}}',
			"packages/a/package.json": "{}",
			"packages/a/.nycrc": '{"all":true}',
		},
		{
			"package.json": '{"workspaces":["packages/*"]}',
			"packages/a/package.json": '{"nyc":{"all":true}}',
		},
	])("passes with config in a workspace package: %j", (files) => {
		expect(run("drift-sensor", files)).toEqual({ status: "pass" });
	});

	test.each<Record<string, string>>([
		// Not a workspace member.
		{
			"web/app/package.json": "{}",
			"web/app/knip.json": '{"entry":["src/index.ts"]}',
		},
		{
			"pnpm-workspace.yaml": "packages:\n  - web/*\n  - '!web/old'",
			"web/old/package.json": "{}",
			"web/old/knip.json": '{"entry":["src/index.ts"]}',
		},
		{
			"package.json": '{"workspaces":["packages/*","!packages/old"]}',
			"packages/old/package.json": "{}",
			"packages/old/knip.json": '{"entry":["src/index.ts"]}',
		},
		// pnpm ignores package.json workspaces when pnpm-workspace.yaml exists.
		{
			"pnpm-workspace.yaml": "packages:\n  - web/app",
			"package.json": '{"workspaces":["web/*"]}',
			"web/old/package.json": "{}",
			"web/old/knip.json": '{"entry":["src/index.ts"]}',
		},
		// A member directory without package.json is not a package.
		{
			"pnpm-workspace.yaml": "packages:\n  - web/*",
			"web/app/knip.json": '{"entry":["src/index.ts"]}',
		},
		{
			"pnpm-workspace.yaml": "packages:\n  - web/*",
			"web/app/package.json": "{}",
			"web/app/knip.json": "{}",
		},
	])("fails without usable workspace config: %j", (files) => {
		expect(run("drift-sensor", files)).toMatchObject({ status: "fail" });
	});
});

describe("F4 scheduled-workflow", () => {
	test.each(["*/15 0-12 * JAN,MAR MON-FRI", "0 0 * * 0"])(
		"recognizes cron lists, ranges and steps: %s",
		(cron) => {
			expect(
				run("scheduled-workflow", {
					".github/workflows/cleanup.yml": `on:\n  schedule:\n    - cron: '${cron}'\njobs:\n  cleanup:\n    steps:\n      - run: npm run cleanup`,
				}),
			).toEqual({ status: "pass" });
		},
	);

	test.each(["99 0 * * *", "*/0 * * * *", "0 0 * * FUNDAY", "0 0 * * 5-1"])(
		"rejects invalid cron fields even with valid jobs: %s",
		(cron) => {
			expect(
				run("scheduled-workflow", {
					".github/workflows/cleanup.yml": `on:\n  schedule:\n    - cron: '${cron}'\njobs:\n  cleanup:\n    steps:\n      - run: npm run cleanup`,
				}),
			).toMatchObject({ status: "fail" });
		},
	);
	test.each(["on", '"on"'])("parses %s.schedule using YAML 1.2", (key) => {
		expect(
			run("scheduled-workflow", {
				".github/workflows/cleanup.yml": `${key}:\n  schedule:\n    - cron: '0 0 * * 0'\njobs:\n  cleanup:\n    steps:\n      - run: npm run cleanup`,
			}),
		).toEqual({ status: "pass" });
	});

	test.each([
		"on: schedule",
		"on: [push, schedule]",
		"on:\n  schedule: []",
		"on:\n  schedule:\n    - cron: ''",
		"on:\n  schedule:\n    - cron: false",
		"on:\n  schedule:\n    - cron: '* * *'",
		"# on.schedule: npm run cleanup",
		"on: push\njobs:\n  schedule:\n    steps:\n      - run: echo on.schedule",
		"on: [broken",
	])("fails without a schedule trigger: %s", (text) => {
		expect(
			run("scheduled-workflow", { ".github/workflows/ci.yml": text }),
		).toMatchObject({ status: "fail" });
	});
});

test.each([
	"pre-commit",
	"ci-tests-and-lint",
	"drift-sensor",
	"scheduled-workflow",
])(
	"%s fails safely on oversized, symlinked, and alias-heavy configs",
	(check) => {
		const repo = makeRepo({
			".husky/pre-commit": "#".repeat(MAX_FILE_SIZE + 1),
			".github/workflows/huge.yml": "#".repeat(MAX_FILE_SIZE + 1),
			".nycrc": " ".repeat(MAX_FILE_SIZE + 1),
			".github/workflows/aliases.yml":
				"a: &a [x,x,x,x,x,x,x,x,x,x]\nb: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a,*a]\njobs: [*b,*b,*b,*b,*b,*b,*b,*b,*b,*b]",
			elsewhere: workflow("npm test && npm run lint"),
			"package.json": scripts,
		});
		symlinkSync(
			join(repo.root, "elsewhere"),
			join(repo.root, ".github/workflows/linked.yml"),
		);
		const fn = timingChecks[check];
		expect(
			fn?.({ repo: walk(repo.root), agents: [], params: {} }),
		).toMatchObject({ status: "fail" });
	},
);
