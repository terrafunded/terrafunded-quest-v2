# Agent rules

Production is **`v2`**. Live is whatever `v2` last deployed. A `cursor/` branch that is not on `v2` is invisible to production.

## Branching (hard)

1. **Before creating any branch:**

   ```bash
   git fetch origin && git checkout v2 && git pull
   ```

   Branch from that freshly pulled `v2`. Never from another `cursor/` branch. Never from a stale local `v2`.

2. **When a task is finished and its tests pass:** merge it back into `v2` and push, **or** open a PR against `v2` and say so explicitly in the final message.

   A branch that is pushed but not integrated is **not done work**. It is invisible work.

3. **Never assume another run's changes are present.** If a task depends on something from a previous task, verify it exists on `v2` first and say so. If it is missing, **stop and report**. Do not reimplement it.

4. **Before finishing, run:**

   ```bash
   git log --oneline origin/v2 -5
   ```

   Confirm in the final message whether the work is **on `v2`** or **waiting in a branch**.

5. **Never force-push to `v2` or to `main`.**
