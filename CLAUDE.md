# Auto Coding Agent - Project Instructions

## Project Context

> Note: Detailed project requirements will be added to task.json as they are defined.

---

## MANDATORY: Agent Workflow

Every new agent session MUST follow this workflow:

### Step 1: Initialize Environment

```bash
./init.sh
```

**DO NOT skip this step.** Ensure the environment is ready before proceeding.

### Step 2: Select Next Task

Read `task.json` and select ONE task to work on.

Selection criteria (in order of priority):
1. Choose a task where `passes: false`
2. Consider dependencies - fundamental features should be done first
3. Pick the highest-priority incomplete task

### Step 3: Implement the Task

- Read the task description and steps carefully
- Implement the functionality to satisfy all steps
- Follow existing code patterns and conventions

### Step 4: Test Thoroughly

After implementation, verify ALL steps in the task:

1. **UI changes** (new pages, rewriting components, modifying core interactions):
   - **Must test in browser!** Use MCP Playwright tools
   - Verify pages load and render correctly
   - Verify form submissions, button clicks, and other interactions
   - Take screenshots to confirm UI displays correctly

2. **Small code changes** (bug fixes, style adjustments, helper functions):
   - Can use unit tests or lint/build to verify
   - If in doubt, still recommend browser testing

3. **All changes must pass**:
   - `npm run lint` with no errors
   - `npm run build` succeeds
   - Browser/unit tests verify functionality

### Step 5: Update Progress

Write your work to `progress.txt`:

```
## [Date] - Task: [task description]

### What was done:
- [specific changes made]

### Testing:
- [how it was tested]

### Notes:
- [any relevant notes for future agents]
```

### Step 6: Commit Changes

**IMPORTANT: All changes must be committed in a single commit, including the task.json update!**

1. Update `task.json`, change the task's `passes` from `false` to `true`
2. Update `progress.txt` with your work
3. Commit all changes at once:

```bash
git add .
git commit -m "[task description] - completed"
```

**Rules:**
- Only mark `passes: true` after all steps are verified
- Never delete or modify task descriptions
- Never remove tasks from the list
- **All artifacts for a task (code, progress.txt, task.json) must be in the same commit**

---

## Blocking Issues

**If a task cannot be completed or requires human intervention, follow these rules:**

### When to stop and ask for help:

1. **Missing environment config**: .env.local needs real API keys, external services need setup
2. **External dependencies unavailable**: Third-party API down, OAuth requires manual auth, paid service needed
3. **Testing impossible**: Requires real user accounts, depends on undeployed external systems

### When blocked:

**DO NOT:**
- Commit changes
- Mark task.json passes as true
- Pretend the task is complete

**DO:**
- Record progress and blocking reason in progress.txt
- Output clear blocking info explaining what human action is needed
- Stop the task and wait for human intervention

---

## Project Structure

```
/
├── CLAUDE.md          # This file - workflow instructions
├── task.json          # Task definitions (source of truth)
├── progress.txt       # Progress log from each session
├── init.sh            # Initialization script
└── <project-dir>/     # Your application (to be created)
```

## Key Rules

1. **One task per session** - Focus on completing one task well
2. **Test before marking complete** - All steps must pass
3. **Browser testing for UI changes** - New or heavily modified pages must be browser tested
4. **Document in progress.txt** - Help future agents understand your work
5. **One commit per task** - All changes (code, progress.txt, task.json) must be in the same commit
6. **Never remove tasks** - Only flip `passes: false` to `true`
7. **Stop if blocked** - Don't commit, output blocking info and stop
