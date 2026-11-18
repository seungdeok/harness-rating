import { LEVEL_NAMES, type RequirementStatus } from "../level.ts";
import type { Requirement, Rubric, RubricCheck } from "../rubric/types.ts";
import { AGENT_NAMES } from "../scan/agent.ts";
import type { Report } from "./build.ts";

const MARK: Record<RequirementStatus, string> = {
	met: "✓",
	unmet: "✗",
	capped: "–",
	na: "–",
};

/** Human-readable summary. `target` is the path as the user gave it. */
export function renderTerminal(
	report: Report,
	rubric: Rubric,
	target: string,
): string {
	const checks = new Map(rubric.checks.map((check) => [check.id, check]));
	const results = new Map(report.checks.map((result) => [result.id, result]));
	const checkOf = (id: string) => {
		const check = checks.get(id);
		if (!check) throw new Error(`no rubric check ${id}`);
		return check;
	};
	const lines = [
		`harness-rating v${report.version} · rubric v${report.rubric.version} · ${target}`,
		`Detected: ${report.agents.map((id) => AGENT_NAMES[id]).join(", ") || "no agent"}`,
		"",
		`Level  L${report.level} · ${LEVEL_NAMES[report.level]}`,
		`Score  ${report.score === null ? "n/a" : Math.round(report.score)} / 100 (reference)`,
	];

	const shown = new Set<string>();
	if (report.next) {
		const capped = report.next.status === "capped" ? " (capped)" : "";
		lines.push("", `To reach L${report.next.level}${capped}`);
		for (const { requirement, status } of report.next.requirements) {
			const name =
				typeof requirement === "string"
					? `${requirement}  ${checkOf(requirement).title}`
					: group(requirement);
			const na = status === "na" ? " · not applicable" : "";
			lines.push(`  ${MARK[status]} ${name}${na}`);
			for (const id of idsIn(requirement)) {
				shown.add(id);
				if (status === "met" || status === "na") continue;
				const result = results.get(id)?.status;
				const check = checkOf(id);
				if (result === "fail") {
					lines.push(
						`      → ${id}: ${check.fix_hint}`,
						`      → Sources: ${orgs(check)}`,
					);
				} else if (result === "capped") {
					lines.push(
						`      → ${id}: capped, cannot be evaluated for the detected agents`,
					);
				}
			}
		}
	}

	const others = report.checks.filter(
		(c) => !shown.has(c.id) && (c.status === "fail" || c.status === "capped"),
	);
	if (others.length > 0) {
		lines.push("", "Not passed (score only)");
		for (const result of others) {
			const check = checkOf(result.id);
			const detail = result.detail ? ` (${safe(result.detail)})` : "";
			lines.push(
				result.status === "capped"
					? `  – ${check.id}  ${check.title} · capped`
					: `  ✗ ${check.id}  ${check.title}${detail} · tier ${check.tier} · ${orgs(check)}`,
			);
		}
	}

	if (report.scan_errors.length > 0) {
		lines.push("", "Could not read");
		for (const error of report.scan_errors) {
			lines.push(`  ! ${safe(error.path)}: ${safe(error.message)}`);
		}
	}
	return `${lines.join("\n")}\n`;
}

/** Prints a check's description and sources for `--explain`. */
export function renderExplain(check: RubricCheck): string {
	const lines = [
		`${check.id}  ${check.title}`,
		`Dimension ${check.dimension} · tier ${check.tier} · supported by ${check.supported_by.join(", ")}`,
		`Fix: ${check.fix_hint}`,
		"",
		"Sources",
	];
	for (const source of check.sources) {
		lines.push(
			`  ${source.org} · ${source.url} · checked ${source.checked}`,
			`    "${source.recommendation}"`,
		);
	}
	return `${lines.join("\n")}\n`;
}

/**
 * Escapes control characters (C0 including newlines, DEL, C1) in text that comes from the
 * scanned repository, so it cannot move the cursor, rewrite the screen, or forge lines.
 */
function safe(text: string): string {
	return text.replace(
		/\p{Cc}/gu,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

/** "(D1 + D2) or F1" */
function group(requirement: Exclude<Requirement, string>): string {
	const [members, joiner] =
		"any_of" in requirement
			? [requirement.any_of, " or "]
			: [requirement.all_of, " + "];
	return members
		.map((member) =>
			typeof member === "string" ? member : `(${group(member)})`,
		)
		.join(joiner);
}

function idsIn(requirement: Requirement): string[] {
	if (typeof requirement === "string") return [requirement];
	const members =
		"any_of" in requirement ? requirement.any_of : requirement.all_of;
	return members.flatMap(idsIn);
}

function orgs(check: RubricCheck): string {
	return [...new Set(check.sources.map((source) => source.org))].join(", ");
}
