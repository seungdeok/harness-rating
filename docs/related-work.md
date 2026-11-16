# Related work

Not normative. Nothing here is used as evidence for a check.

## Tools

| Tool | Approach | Relationship |
| --- | --- | --- |
| [harness-score](https://github.com/paladini/harness-score) | Static scan, L0–L4, CI gate | Closest tool. Only the idea of levels and a CI gate is shared; no code, check lists, or level names are used |
| [harness-eval](https://github.com/whchoi98/harness-eval) | Static plus agent review | Uses an LLM to judge quality. This project is deterministic only |
| [agentbench](https://socket.dev/npm/package/agentbench/overview/1.0.0) | Execution-based | Grades real tasks. Overlaps with validity checking |

## Papers

- [The AI Codebase Maturity Model (arXiv 2604.09388)](https://arxiv.org/abs/2604.09388): maturity stages based on feedback-loop structure
- [OpenSSF Scorecard (arXiv 2208.03412)](https://arxiv.org/html/2208.03412v4): defines the tier weights reused by the reference score
