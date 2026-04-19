# Claude Desktop Adapter Smoke Test (Research Q1 Resolution)

**When to run:** Once at Phase 2 exit gate (Wave 4). Resolves the open
research question (Q1 in 02-RESEARCH.md): does Claude Code Desktop pick
up a fresh SKILL.md dropped into `~/.claude/scheduled-tasks/<slug>/`
without any user action in the Schedule tab?

**Prerequisites:**
- Claude Code Desktop is installed and has been launched at least once
- `~/.claude/` directory exists
- Repo checked out at `$REPO_ROOT`

**Steps:**

1. **Set REPO_ROOT and create a synthetic timestamp-writer routine:**
   ```bash
   export REPO_ROOT="/Users/$(whoami)/Desktop/Projects/sleepwalker"
   ```

2. **Deploy via adapter (writes SKILL.md to ~/.claude/scheduled-tasks/desktop-smoke-xyz/):**
   ```bash
   cd "$REPO_ROOT/dashboard"
   node -e '
     import("./lib/runtime-adapters/claude-desktop.ts").then(({ claudeDesktopAdapter }) => {
       return claudeDesktopAdapter.deploy({
         slug: "desktop-smoke-xyz",
         runtime: "claude-desktop",
         name: "Desktop Smoke Test",
         prompt: "[sleepwalker:claude-desktop/desktop-smoke-xyz]\n\nWrite the current ISO timestamp to /tmp/sleepwalker-desktop-smoke.txt then exit.",
         schedule: null,
         reversibility: "yellow",
         budget: 1000,
         bundlePath: "/tmp/desktop-smoke-xyz",
       });
     }).then(r => console.log(JSON.stringify(r, null, 2)));
   '
   ```
   Adapter should return `{ok:true, artifact:"<path>/SKILL.md", handoffUrl:"claude://scheduled-tasks?slug=desktop-smoke-xyz"}`.

3. **Verify SKILL.md was written:**
   ```bash
   ls -l ~/.claude/scheduled-tasks/desktop-smoke-xyz/SKILL.md
   cat ~/.claude/scheduled-tasks/desktop-smoke-xyz/SKILL.md
   ```
   Expect: file exists, mode 0644, content matches the prompt above.

4. **Open Claude Desktop. Navigate to the Schedule tab.**

5. **Observe whether `desktop-smoke-xyz` appears in the Schedule list.** Record one of:
   - **YES** — Desktop picked up the dropped SKILL.md without further action. Q1 resolved positively; the browser-handoff flow is even simpler than expected.
   - **NO, but visible after manual refresh** — Desktop requires a Schedule-tab visit (which is what the deeplink in `handoffUrl` triggers). Q1 resolved: the safe path requires opening the URL.
   - **NO, never visible without manual add** — Desktop doesn't watch the directory. Q1 resolved: the user must use Desktop's "Add Scheduled Task" UI; deploying is just a hint. (This is the most-conservative outcome and informs Phase 6 docs.)

6. **Manually trigger the routine via Desktop's Schedule tab UI** (click "Run now" or wait for scheduled fire if you set one).

7. **Confirm the output file appeared:**
   ```bash
   cat /tmp/sleepwalker-desktop-smoke.txt
   ```
   Expect: an ISO timestamp written by the routine.

8. **Undeploy via adapter:**
   ```bash
   cd "$REPO_ROOT/dashboard"
   node -e '
     import("./lib/runtime-adapters/claude-desktop.ts").then(({ claudeDesktopAdapter }) => {
       return claudeDesktopAdapter.undeploy({
         slug: "desktop-smoke-xyz", runtime: "claude-desktop", name: "x",
         prompt: "x", schedule: null, reversibility: "yellow", budget: 1000, bundlePath: "/tmp",
       });
     }).then(r => console.log(JSON.stringify(r)));
   '
   ```

9. **Verify cleanup:**
   ```bash
   ls ~/.claude/scheduled-tasks/desktop-smoke-xyz 2>&1 | grep -i "no such"
   rm -f /tmp/sleepwalker-desktop-smoke.txt
   ```
   Expect: directory gone.

**Q1 outcome to record in 02-SUMMARY.md:**
- Which of the three outcomes from Step 5 occurred
- macOS version
- Claude Desktop version
- Whether the routine actually executed when triggered (Step 7)
- Recommendation for Phase 6 docs (e.g. "AUTHORING.md must say: after deploy, click the handoff link" vs "no extra step required")
