import type { Report } from "./build.ts";

/** Pretty-printed JSON; deterministic because the report is. */
export function toJson(report: Report): string {
	return `${JSON.stringify(report, null, 2)}\n`;
}
