import { agentsMd } from "./adapters/agents-md.js";
import { claudeCode } from "./adapters/claude-code.js";
import type { Agent } from "./agent.js";
import type { Repo } from "./walk.js";

/** Detected agents, always in this fixed order so reports never depend on detection order. */
export function detect(repo: Repo): Agent[] {
	return [claudeCode(repo), agentsMd(repo)].filter(
		(agent): agent is Agent => agent !== undefined,
	);
}
