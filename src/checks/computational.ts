import { isObject } from "../scan/agent.ts";
import { type Repo, readText } from "../scan/walk.ts";
import type { Check, CheckOutcome } from "./types.ts";

// ponytail: manifests and config are read at the repository root only; per-package config
// in monorepos (packages/*/package.json, nested tsconfig) waits for A5 in v0.2.

/** Computational sensor checks C1–C3, keyed by the rubric's `check:` name. */
export const computationalChecks: Record<string, Check> = {
	"test-suite": ({ repo }) => {
		const hasTests =
			[...repo.files.keys()].some((path) => TEST_FILE.test(path)) ||
			hasInlineTests(repo);
		if (!hasTests) return { status: "fail", detail: "no test files found" };
		if (!hasTestCommand(repo)) {
			return {
				status: "fail",
				detail:
					"no test command (package.json test script, Makefile test target, or a language test runner)",
			};
		}
		return { status: "pass" };
	},

	"linter-config": ({ repo }) =>
		LINTER_FILES.some((path) => repo.files.has(path)) ||
		hasSection(repo, LINTER_SECTIONS) ||
		packageJson(repo)?.eslintConfig !== undefined ||
		scriptOf(repo, "lint") !== undefined
			? { status: "pass" }
			: { status: "fail", detail: "no linter configuration found" },

	"type-check-config": ({ repo }) => typeCheck(repo),
};

// Test files by common convention: test directories (SwiftPM's Tests/ included), .NET
// *.Tests projects, *.test.* / *.spec.*, test_*.py, *_test.{py,go,rb}, *_spec.rb, and
// Java/Kotlin src/test/.
const TEST_FILE =
	/(?:^|\/)(?:[Tt]ests?|__tests__|spec)\/|(?:^|\/)[^/]+\.(?:Unit|Integration)?Tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)test_[^/]+\.py$|_test\.(?:py|go|rb)$|_spec\.rb$/;

// Ecosystems whose standard tooling runs tests without a project-defined script.
const BUILT_IN_TEST_RUNNERS = [
	"go.mod",
	"Cargo.toml",
	"pyproject.toml",
	"setup.py",
	"setup.cfg",
	"tox.ini",
	"noxfile.py",
	"pytest.ini",
	"pom.xml",
	"build.gradle",
	"build.gradle.kts",
	"mix.exs",
	".rspec",
	"Rakefile",
	"pubspec.yaml",
	"Package.swift",
	// R: `R CMD check` runs tests/ for a package, which a DESCRIPTION file declares.
	"DESCRIPTION",
	"phpunit.xml",
	"phpunit.xml.dist",
	"phpunit.dist.xml",
];

// `dotnet test` finds a solution or project file in the current directory.
const DOTNET_PROJECT = /^[^/]+\.(?:sln|slnx|csproj|fsproj|vbproj)$/;

// npm init's placeholder: "echo \"Error: no test specified\" && exit 1"
const NPM_PLACEHOLDER = /no test specified/;

// Languages that keep unit tests next to the code: Rust `#[test]` functions and Zig
// `test "name" { ... }` blocks.
const INLINE_TESTS: { manifest: string; ext: string; marker: RegExp }[] = [
	{ manifest: "Cargo.toml", ext: ".rs", marker: /#\[test\]/ },
	{
		manifest: "build.zig",
		ext: ".zig",
		marker: /^\s*test\s*(?:"|\{)|^\s*test\s+[A-Za-z_@][\w.]*\s*\{/m,
	},
];

function hasInlineTests(repo: Repo): boolean {
	return INLINE_TESTS.some(
		({ manifest, ext, marker }) =>
			repo.files.has(manifest) &&
			[...repo.files.keys()].some(
				(path) => path.endsWith(ext) && marker.test(readText(repo, path) ?? ""),
			),
	);
}

function hasTestCommand(repo: Repo): boolean {
	const npmTest = scriptOf(repo, "test");
	if (npmTest !== undefined && !NPM_PLACEHOLDER.test(npmTest)) return true;
	if (BUILT_IN_TEST_RUNNERS.some((path) => repo.files.has(path))) return true;
	if ([...repo.files.keys()].some((path) => DOTNET_PROJECT.test(path))) {
		return true;
	}
	const make = ["Makefile", "makefile", "GNUmakefile", "justfile", "Justfile"]
		.map((path) => readText(repo, path) ?? "")
		.join("\n");
	if (/^test[\w-]*\s*:/m.test(make)) return true;
	// Zig: `zig build test` runs the step that build.zig declares.
	return /\.step\(\s*"test"/.test(readText(repo, "build.zig") ?? "");
}

const LINTER_FILES = [
	// JavaScript / TypeScript
	"eslint.config.js",
	"eslint.config.mjs",
	"eslint.config.cjs",
	"eslint.config.ts",
	"eslint.config.mts",
	"eslint.config.cts",
	".eslintrc",
	".eslintrc.js",
	".eslintrc.cjs",
	".eslintrc.json",
	".eslintrc.yml",
	".eslintrc.yaml",
	"biome.json",
	"biome.jsonc",
	".oxlintrc.json",
	// Python
	"ruff.toml",
	".ruff.toml",
	".flake8",
	".pylintrc",
	"pylintrc",
	// Go, Rust, Ruby, Swift, Kotlin, Dart, shell, CSS, PHP (formatters such as Pint are not linters)
	".golangci.yml",
	".golangci.yaml",
	".golangci.toml",
	".golangci.json",
	"clippy.toml",
	".clippy.toml",
	".rubocop.yml",
	".swiftlint.yml",
	"detekt.yml",
	"analysis_options.yaml",
	".shellcheckrc",
	".stylelintrc",
	".stylelintrc.json",
	"stylelint.config.js",
	"phpcs.xml",
	"phpcs.xml.dist",
	"phpstan.neon",
	"phpstan.neon.dist",
	"phpstan.dist.neon",
	"psalm.xml",
	"psalm.xml.dist",
];

const LINTER_SECTIONS: [string, string][] = [
	["pyproject.toml", "[tool.ruff"],
	["pyproject.toml", "[tool.pylint"],
	["setup.cfg", "[flake8]"],
	["tox.ini", "[flake8]"],
	["Cargo.toml", "[lints"],
];

const TYPESCRIPT = /\.(?:ts|tsx|mts|cts)$/;
const PYTHON = /\.pyi?$/;
// Statically typed: the compiler is the type checker (Böckeler: "naturally has type-checking as a sensor").
const STATICALLY_TYPED =
	/\.(?:go|rs|java|kt|scala|cs|fs|swift|hs|dart|elm|purs|cr|nim|zig)$/;

// Any depth: monorepos often keep tsconfig.json only in packages.
const TSCONFIG = /(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/;
// A Python project declares itself at the root; Python files without one are helper scripts.
const PYTHON_MANIFESTS = [
	"pyproject.toml",
	"setup.py",
	"setup.cfg",
	"requirements.txt",
	"Pipfile",
];
const PYTHON_TYPE_FILES = [
	"mypy.ini",
	".mypy.ini",
	"pyrightconfig.json",
	"ty.toml",
];
const PYTHON_TYPE_SECTIONS: [string, string][] = [
	["pyproject.toml", "[tool.mypy"],
	["pyproject.toml", "[tool.pyright"],
	["pyproject.toml", "[tool.basedpyright"],
	["pyproject.toml", "[tool.ty"],
	["setup.cfg", "[mypy"],
];

/**
 * Not applicable unless the repo has a type-checkable language: TypeScript or Python
 * (need a type checker configured) or a statically typed language (passes).
 * Python counts only with a root manifest or a type checker configured (ADR 0010).
 * Plain JavaScript, shell, Ruby, PHP, and docs-only repos are not applicable.
 */
function typeCheck(repo: Repo): CheckOutcome {
	const paths = [...repo.files.keys()];
	const hasTypeScript = paths.some(
		(path) => TYPESCRIPT.test(path) && !path.endsWith(".d.ts"),
	);
	const hasPythonTypeChecker =
		PYTHON_TYPE_FILES.some((path) => repo.files.has(path)) ||
		hasSection(repo, PYTHON_TYPE_SECTIONS);
	const hasPython =
		paths.some((path) => PYTHON.test(path)) &&
		(hasPythonTypeChecker ||
			PYTHON_MANIFESTS.some((path) => repo.files.has(path)));
	if (!hasTypeScript && !hasPython) {
		return paths.some((path) => STATICALLY_TYPED.test(path))
			? { status: "pass" }
			: { status: "na" };
	}
	const missing: string[] = [];
	if (hasTypeScript && !paths.some((path) => TSCONFIG.test(path))) {
		missing.push("TypeScript without tsconfig.json");
	}
	if (hasPython && !hasPythonTypeChecker) {
		missing.push("Python without a mypy, pyright, or ty configuration");
	}
	return missing.length > 0
		? { status: "fail", detail: missing.join("; ") }
		: { status: "pass" };
}

function hasSection(repo: Repo, sections: [string, string][]): boolean {
	return sections.some(([path, header]) =>
		(readText(repo, path) ?? "").includes(header),
	);
}

function packageJson(repo: Repo): Record<string, unknown> | undefined {
	const text = readText(repo, "package.json");
	if (text === undefined) return undefined;
	try {
		const data: unknown = JSON.parse(text);
		return isObject(data) ? data : undefined;
	} catch {
		// A malformed package.json declares nothing.
		return undefined;
	}
}

function scriptOf(repo: Repo, name: string): string | undefined {
	const scripts = packageJson(repo)?.scripts;
	if (!isObject(scripts)) return undefined;
	const script = scripts[name];
	return typeof script === "string" ? script : undefined;
}
