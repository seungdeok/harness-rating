// Checks that every URL in rubric/sources.yaml is reachable. Prints a Markdown report and
// exits 1 when any link is broken; the source-links workflow turns that into an issue.
import { readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { parse } from "yaml";

export interface Source {
	org: string;
	title: string;
	url: string;
	/** Copy to try when `url` blocks automated clients (see rubric/sources.yaml). */
	archive?: string;
}

export interface Result {
	source: Source;
	ok: boolean;
	/** HTTP status or error for `url`, plus the archive outcome when it was tried. */
	note: string;
}

/** Fetches a URL and returns its final HTTP status; throws on network errors. */
export type Probe = (url: string) => Promise<number>;

export function loadSources(path = "rubric/sources.yaml"): Source[] {
	const data = parse(readFileSync(path, "utf8")) as { sources: Source[] };
	return data.sources;
}

export async function checkSources(
	sources: Source[],
	probe: Probe,
	retryDelayMs = 2000,
): Promise<Result[]> {
	return Promise.all(
		sources.map(async (source): Promise<Result> => {
			const main = await attempt(probe, source.url, retryDelayMs);
			if (main.ok) return { source, ok: true, note: main.note };
			if (!source.archive) return { source, ok: false, note: main.note };
			const archive = await attempt(probe, source.archive, retryDelayMs);
			return {
				source,
				ok: archive.ok,
				note: `${main.note}; archive ${archive.note}`,
			};
		}),
	);
}

/** One delayed retry for network errors, 429, and 5xx, which are often transient. */
async function attempt(
	probe: Probe,
	url: string,
	retryDelayMs: number,
): Promise<{ ok: boolean; note: string }> {
	let note = "";
	for (let tries = 0; tries < 2; tries++) {
		if (tries > 0) await setTimeout(retryDelayMs);
		try {
			const status = await probe(url);
			if (status >= 200 && status < 400)
				return { ok: true, note: String(status) };
			note = String(status);
			if (status < 500 && status !== 429) break;
		} catch (error) {
			note = error instanceof Error ? error.message : String(error);
		}
	}
	return { ok: false, note };
}

export function report(results: Result[], runUrl?: string): string {
	const broken = results.filter((result) => !result.ok);
	const rows = broken.map(
		({ source, note }) =>
			`| ${cell(source.org)} | ${cell(source.title)} | ${source.url} | ${cell(note)} |`,
	);
	return [
		`${broken.length} of ${results.length} source links are broken.`,
		"",
		"| Org | Document | URL | Result |",
		"| --- | --- | --- | --- |",
		...rows,
		"",
		"Fix: replace a moved document with its new URL (rubric patch version) or remove the source (rubric minor version). See docs/spec/SPEC.md § Versioning.",
		...(runUrl ? ["", `Run: ${runUrl}`] : []),
		"",
	].join("\n");
}

function cell(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

const USER_AGENT =
	"Mozilla/5.0 (compatible; harness-rating-source-check; +https://github.com/seungdeok/harness-rating)";

const probeHttp: Probe = async (url) => {
	const response = await fetch(url, {
		redirect: "follow",
		headers: { "user-agent": USER_AGENT },
		signal: AbortSignal.timeout(30_000),
	});
	await response.body?.cancel();
	return response.status;
};

if (import.meta.main) {
	const sources = loadSources();
	// workflow_dispatch input, used to test that a broken link opens an issue.
	const extra = process.env.EXTRA_URL?.trim();
	if (extra)
		sources.push({
			org: "(manual)",
			title: "workflow_dispatch input",
			url: extra,
		});
	const results = await checkSources(sources, probeHttp);
	const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
	const runUrl =
		GITHUB_SERVER_URL && GITHUB_REPOSITORY && GITHUB_RUN_ID
			? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
			: undefined;
	process.stdout.write(report(results, runUrl));
	if (results.some((result) => !result.ok)) process.exitCode = 1;
}
