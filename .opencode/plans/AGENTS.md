# Agents - Venshield Secure SDLC Pipeline

This project uses a **5-gate Secure SDLC pipeline** coordinated by specialized agents. All agent definitions are in .opencode/agents/.

## Quick Start

The **Orchestrator** is set as your default agent in opencode.json. When you start opencode in this project, the orchestrator will automatically coordinate the full pipeline.

## Agent Registry

| Agent | File | Mode | Role | Gate |
|-------|------|------|------|------|
| Orchestrator | .opencode/agents/orchestrator.md | primary | Pipeline manager | All gates |
| Planner | .opencode/agents/planner.md | subagent | Implementation planning | Pre-Gate 1 |
| Security & Privacy Guard | .opencode/agents/security-privacy-guard.md | subagent | Security/privacy review | Gate 1, Gate 3 |
| Designer | .opencode/agents/designer.md | subagent | UX/UI design | Gate 2 (design first) |
| Coder | .opencode/agents/coder.md | subagent | Code implementation | Gate 2 (code second) |
| QA Tester | .opencode/agents/qa-tester.md | subagent | Testing & verification | Gate 4 |
| Reviewer | .opencode/agents/reviewer.md | subagent | Final quality gate | Gate 5 |

## Pipeline Flow

User Request -> [Planner] -> [Gate 1: Security] -> [Gate 2: Designer + Coder] -> [Gate 3: Security + Gate 4: QA (parallel)] -> [Gate 5: Reviewer] -> DONE

## How to Use

### Default: Full Pipeline
Just start a conversation. The orchestrator will automatically:
1. Dispatch Planner to create an implementation plan
2. Run Gate 1 (Security & Privacy review of plan)
3. Run Gate 2 (Designer then Coder for implementation)
4. Run Gates 3+4 in parallel (Security audit + QA testing)
5. Run Gate 5 (Final review)
6. Report completion

### Individual Agents
Switch agents using Tab key or specify with --agent flag:
- opencode run --agent planner "Plan a feature"
- opencode run --agent coder "Implement this"

## Gate Definitions

### Gate 1 - Plan Security & Privacy Review
Planner creates the plan, Security & Privacy Guard reviews for data handling, auth, and privacy.

### Gate 2 - Implementation
Designer creates UI/UX specs first (if UI work), then Coder implements functionality.

### Gate 3 + Gate 4 - Security Audit & QA (PARALLEL)
Security & Privacy Guard reviews code, QA Tester runs tests. Both must approve.

### Gate 5 - Final Review
Reviewer performs final quality assessment. Must approve before feature is done.

## Rules

- No gate may be skipped
- No partial approvals allowed
- Max 3 retries per gate before escalation to human
- Technical deadlocks are resolved by Reviewer
- Parallel agents must not share file targets

## Related Files

- .impeccable.md - Design context and brand guidelines
- PRODUCT.md - Product requirements
- DESIGN.md - Design documentation
- .vibe/agents/ - Alternative agent configuration (TOML format)
