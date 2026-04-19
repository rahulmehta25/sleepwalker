# Codex Adapter Smoke Test

**When to run:** Once at Phase 2 exit gate (Wave 4). Run on a real Mac with `codex` installed.

**Prerequisites:**
- `codex --version` reports 0.118.0 or later
- `launchctl` available (macOS built-in)
- Repo checked out at `$REPO_ROOT`
- `~/.sleepwalker/` directory exists (v0.1 install.sh already run)

**Steps:**

1. **Set REPO_ROOT to the absolute path of this repo:**
   ```bash
   export REPO_ROOT="/Users/$(whoami)/Desktop/Projects/sleepwalker"
   cd "$REPO_ROOT"
   ```

2. **Create a fixture bundle:**
   ```bash
   mkdir -p "$REPO_ROOT/routines-codex/smoke-test-abc123"
   cat > "$REPO_ROOT/routines-codex/smoke-test-abc123/prompt.md" <<'EOF'
   [sleepwalker:codex/smoke-test-abc123]
   Reply with the single word: SMOKE_OK
   EOF
   cat > "$REPO_ROOT/routines-codex/smoke-test-abc123/config.json" <<'EOF'
   {"name":"smoke-test","reversibility":"green","budget":1000}
   EOF
   ```

3. **Deploy via adapter using a one-off Node invocation:**
   ```bash
   cd "$REPO_ROOT/dashboard"
   node --experimental-vm-modules -e '
     import("./lib/runtime-adapters/codex.ts").then(({ codexAdapter }) => {
       return codexAdapter.deploy({
         slug: "smoke-test-abc123",
         runtime: "codex",
         name: "smoke-test",
         prompt: "",
         schedule: "*/5 * * * *",
         reversibility: "green",
         budget: 1000,
         bundlePath: process.env.REPO_ROOT + "/routines-codex/smoke-test-abc123",
       });
     }).then(r => console.log(JSON.stringify(r, null, 2)));
   '
   ```
   (If TypeScript module loading fails in Node, alternative: write a small `.mjs` wrapper or use `pnpm tsx` if available.)

4. **Verify launchctl loaded the job:**
   ```bash
   launchctl print "gui/$UID/com.sleepwalker.codex.smoke-test-abc123" | head -30
   ```
   Expect: a printed state block (not "Could not find specified service").

5. **Verify plist file exists:**
   ```bash
   ls -l ~/Library/LaunchAgents/com.sleepwalker.codex.smoke-test-abc123.plist
   ```
   Expect: file exists, mode `-rw-r--r--` (0644).

6. **Verify plutil -lint passes:**
   ```bash
   plutil -lint ~/Library/LaunchAgents/com.sleepwalker.codex.smoke-test-abc123.plist
   ```
   Expect: `... OK`.

7. **Trigger an immediate run:**
   ```bash
   launchctl kickstart -k "gui/$UID/com.sleepwalker.codex.smoke-test-abc123"
   ```
   Wait ~30 seconds (codex CLI takes time to respond).

8. **Check audit.jsonl for started + completed events:**
   ```bash
   tail -5 ~/.sleepwalker/audit.jsonl | grep smoke-test-abc123
   ```
   Expect: at least one `"event":"started"` line and one `"event":"completed"` line. The completed event's `preview` field should contain `SMOKE_OK`.

9. **Check stdout log:**
   ```bash
   cat ~/.sleepwalker/logs/com.sleepwalker.codex.smoke-test-abc123.out
   ```
   Expect: contains `SMOKE_OK`.

10. **Undeploy via adapter:**
    ```bash
    cd "$REPO_ROOT/dashboard"
    node -e '
      import("./lib/runtime-adapters/codex.ts").then(({ codexAdapter }) => {
        return codexAdapter.undeploy({
          slug: "smoke-test-abc123", runtime: "codex", name: "smoke-test",
          prompt: "", schedule: null, reversibility: "green", budget: 1000,
          bundlePath: process.env.REPO_ROOT + "/routines-codex/smoke-test-abc123",
        });
      }).then(r => console.log(JSON.stringify(r)));
    '
    ```

11. **Verify cleanup:**
    ```bash
    launchctl print "gui/$UID/com.sleepwalker.codex.smoke-test-abc123" 2>&1 | grep -i "could not"
    ls ~/Library/LaunchAgents/com.sleepwalker.codex.smoke-test-abc123.plist 2>&1 | grep -i "no such"
    rm -rf "$REPO_ROOT/routines-codex/smoke-test-abc123"
    ```
    Expect: launchctl reports could-not-find (job unloaded), plist file is gone, fixture bundle removed.

**Pass criteria:**
- Steps 4, 5, 6, 8, 9, 11 all match the documented expectations
- No `"event":"failed"` or `"event":"budget_exceeded"` events appear in audit.jsonl for this slug

**Record in 02-SUMMARY.md:**
- Timestamp of smoke test run
- macOS version (`sw_vers -productVersion`)
- codex version (`codex --version`)
- Pass/fail checkbox per step
- Any deviations / issues encountered
