import { agentsMd } from "./adapters/agents-md.ts";
import { claudeCode } from "./adapters/claude-code.ts";
import type { Agent } from "./agent.ts";
import type { Repo } from "./walk.ts";

/** Detected agents, always in this fixed order so reports never depend on detection order. */
export function detect(repo: Repo): Agent[] {
	return [claudeCode(repo), agentsMd(repo)].filter(
		(agent): agent is Agent => agent !== undefined,
	);
}
