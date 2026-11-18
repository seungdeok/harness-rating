import { describe, expect, test } from "vitest";
import {
	checkSources,
	loadSources,
	type Probe,
	report,
	type Source,
} from "../scripts/check-source-links.ts";

const source = (url: string, archive?: string): Source => ({
	org: "Org",
	title: "Doc",
	url,
	...(archive ? { archive } : {}),
});

/** Answers from a table; a function value is called each time (to count retries). */
function probeFrom(table: Record<string, number | (() => number)>): Probe {
	return async (url) => {
		const answer = table[url];
		if (answer === undefined) throw new Error("fetch failed");
		return typeof answer === "function" ? answer() : answer;
	};
}

describe("checkSources", () => {
	test("2xx and 3xx are reachable", async () => {
		const results = await checkSources(
			[source("https://a.test"), source("https://b.test")],
			probeFrom({ "https://a.test": 200, "https://b.test": 301 }),
			0,
		);
		expect(results.map((r) => r.ok)).toEqual([true, true]);
	});

	test("a 404 is broken", async () => {
		const [result] = await checkSources(
			[source("https://gone.test")],
			probeFrom({ "https://gone.test": 404 }),
			0,
		);
		expect(result).toMatchObject({ ok: false, note: "404" });
	});

	test("a blocked URL passes when its archive copy is reachable", async () => {
		const [result] = await checkSources(
			[source("https://blocked.test", "https://archive.test")],
			probeFrom({ "https://blocked.test": 403, "https://archive.test": 200 }),
			0,
		);
		expect(result).toMatchObject({ ok: true, note: "403; archive 200" });
	});

	test("a blocked URL with a dead archive is broken", async () => {
		const [result] = await checkSources(
			[source("https://blocked.test", "https://archive.test")],
			probeFrom({ "https://blocked.test": 403, "https://archive.test": 404 }),
			0,
		);
		expect(result?.ok).toBe(false);
	});

	test("retries once on 5xx and 429, not on other 4xx", async () => {
		let serverCalls = 0;
		let clientCalls = 0;
		const results = await checkSources(
			[source("https://flaky.test"), source("https://missing.test")],
			probeFrom({
				"https://flaky.test": () => (++serverCalls === 1 ? 503 : 200),
				"https://missing.test": () => {
					clientCalls++;
					return 404;
				},
			}),
			0,
		);
		expect(results.map((r) => r.ok)).toEqual([true, false]);
		expect([serverCalls, clientCalls]).toEqual([2, 1]);
	});

	test("a network error after the retry is broken with its message", async () => {
		const [result] = await checkSources(
			[source("https://down.test")],
			probeFrom({}),
			0,
		);
		expect(result).toMatchObject({ ok: false, note: "fetch failed" });
	});
});

describe("report", () => {
	test("lists only broken links and the run URL", async () => {
		const results = await checkSources(
			[source("https://ok.test"), source("https://gone.test")],
			probeFrom({ "https://ok.test": 200, "https://gone.test": 404 }),
			0,
		);
		const text = report(results, "https://github.com/o/r/actions/runs/1");
		expect(text).toContain("1 of 2 source links are broken.");
		expect(text).toContain("| Org | Doc | https://gone.test | 404 |");
		expect(text).not.toContain("https://ok.test");
		expect(text).toContain("Run: https://github.com/o/r/actions/runs/1");
	});
});

test("loads every source from rubric/sources.yaml", () => {
	const sources = loadSources();
	expect(sources.length).toBeGreaterThan(0);
	for (const { url } of sources) expect(url).toMatch(/^https:\/\//);
});
