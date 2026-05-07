# Workflow - Secure SDLC Pipeline Execution Guide

This document provides detailed instructions for executing the 5-gate SDLC pipeline.

## Prerequisites

Before starting the pipeline:
1. Ensure .impeccable.md, PRODUCT.md, and DESIGN.md are up to date
2. Verify the codebase is in a clean state (no uncommitted changes that conflict)
3. Confirm test infrastructure is working (test commands run successfully)

## Pipeline Execution

### Step 0: Receive User Request

Parse the user's feature request into:
- **Goal**: What the user wants to accomplish
- **Constraints**: Technical, design, or business constraints mentioned
- **Implicit requirements**: What the user needs but didn't ask for

### Step 1: Dispatch Planner

``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/planner.md] + [user request]
}
``

Planner delivers:
- Implementation plan with phases
- File scope (which files to create/modify per phase)
- Privacy & accessibility constraints
- Edge cases to handle

### Step 2: Gate 1 - Security & Privacy Review

``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/security-privacy-guard.md] + [Planner output]
}
``

Expected output: Verdict (Pass/Pass with conditions/Block)

If **Pass**: proceed to Gate 2
If **Block or conditions**: return findings to Planner, revise, re-submit

### Step 3: Gate 2 - Implementation

For each phase in the approved plan:

**If UI/UX work:**
``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/designer.md] + [approved plan + file scope]
}
``

**After Designer completes:**
``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/coder.md] + [approved plan + Designer output + file scope]
}
``

**If no UI work:**
``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/coder.md] + [approved plan + file scope]
}
``

Wait for all phases to complete before proceeding.

### Step 4: Gates 3 + 4 - Security Audit & QA (PARALLEL)

Dispatch both simultaneously:

``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/security-privacy-guard.md] + [completed code + approved plan]
}
``

``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/qa-tester.md] + [completed code + approved plan]
}
``

Both must APPROVE. If either rejects:
1. Pass findings to Coder
2. Coder fixes issues
3. Re-run BOTH gates (not just the rejecting one)

### Step 5: Gate 5 - Final Review

``
task {
  subagent_type: general,
  prompt: [full content of .opencode/plans/reviewer.md] + [completed code + Gate 3 report + Gate 4 report]
}
``

If approved: DONE
If not approved: pass findings to Coder, fix, re-run from Gate 3

## Conflict Resolution

### Technical Deadlocks

When two agents disagree:
1. Capture both positions with their reasoning
2. Dispatch Reviewer with both positions
3. Reviewer makes final decision
4. Resume pipeline from the conflict point

### Max Retry Escalation

If any gate fails 3 times consecutively:
1. HALT the pipeline
2. Summarize the failing findings
3. Present to human user with:
   - What was attempted
   - Why it keeps failing
   - Specific blockers
4. Wait for human intervention

## Output Format

After each gate, produce a status report:

``
## Gate [N] Status: [APPROVED | REJECTED]
- Agent: [Agent Name]
- Verdict: [Pass/Block/Pass with conditions]
- Findings: [Summary of key findings]
- Next: [Proceed to Gate N+1 / Return to previous agent / Escalate]
``

After Gate 5 approval, produce the final report:

``
## Feature Complete

### What was built
[Summary of implemented features]

### Security findings
[Security issues found and how they were resolved]

### Test coverage
[Test types run and results]

### Accessibility highlights
[A11y checks performed and compliance status]
``

## Tips

- Keep context concise: prefer file paths and diffs over full file dumps
- Track which files each agent reads vs modifies to avoid conflicts
- Use todolist for tracking multi-phase work
- Document any decisions made during conflict resolution
