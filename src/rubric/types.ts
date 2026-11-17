export type EvidenceTier = "A" | "B" | "C";

export type Requirement =
	| string
	| { any_of: Requirement[] }
	| { all_of: Requirement[] };

export interface RubricSource {
	org: string;
	url: string;
	recommendation: string;
	checked: string;
}

export interface RubricCheck {
	id: string;
	dimension: string;
	title: string;
	tier: EvidenceTier;
	check: string;
	params?: Record<string, unknown>;
	applies_when?: string;
	supported_by: string[];
	sources: RubricSource[];
	fix_hint: string;
}

export interface Rubric {
	version: string;
	sources_version: string;
	evidence_tiers: Record<EvidenceTier, { min_orgs: number; weight: number }>;
	levels: Partial<Record<`L${0 | 1 | 2 | 3 | 4}`, { requires: Requirement[] }>>;
	checks: RubricCheck[];
}
