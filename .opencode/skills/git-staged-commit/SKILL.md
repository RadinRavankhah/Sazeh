---
name: git-staged-commit
description: Split currently-staged changes into small, logical commits. Use when the user asks to commit staged changes, group and commit changes, make several commits from the staged changes, or write commit messages matching previous commits.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: git-committing
---

## IMPORTANT

This is not an optimization problem. Do not search for the 'best' grouping. Pick the first grouping that satisfies the rules and commit it.

## What I do

I turn all currently-staged changes into a small set of focused commits, grouped by similarity or dependency. I do not over-analyze. I decide fast and commit.

## When to use me

Use me when the user says something like:

- "commit these changes"
- "group and commit the changes"
- "make commits from the staged changes"
- "commit with proper messages like previous commits"

## Hard rules (do not violate)

1. **Maximum 5 commit groups.** If needed, merge small groups into "misc" rather than exceed 5.
2. **Decide grouping in under 3 reasoning steps.** Do not explore alternatives. Pick the first reasonable grouping.
3. **Never ask the user how to group.** If unclear, use the fallback grouping below.
4. **Look at the actual diff** with `git diff --cached --stat` and `git diff --cached --name-only`.
5. **Only touch the index, never the working tree.** Unstaging is fine; use `git reset` (mixed) only. Never use `git reset --hard`, `git checkout --`, or `git restore` in a way that discards changes.
6. **Each commit must leave the repo in a buildable/testable state if possible.** If not possible, note it in the commit body.

## Fast grouping algorithm

Follow this in order. Stop as soon as you have a valid grouping.

1. **By dependency / feature:** Changes that implement one user-facing feature or fix one bug.
   - Example: `auth/login.ts`, `auth/login.test.ts`, `api/login/route.ts` → one commit: "add login flow"
2. **By layer:** Group files by what layer they touch.
   - Examples: "ui", "api", "db/schema", "tests", "config", "docs"
3. **By file type:** If layers are mixed and no feature boundary is obvious, group by extension or directory.
4. **Fallback:** If fewer than 5 files are staged, make a single commit with a descriptive message.

## Commit message style

Inspect recent commits first:

```bash
git log --oneline -15
```

Match their style. If in doubt, use:

```text
<type>(<scope>): <short imperative summary>

<body: optional, wrap at 72 chars>
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`.

Examples:

- `feat: add password reset token generation`
- `fix: handle null user in session loader`
- `refactor: extract validation helpers from auth routes`
- `test: add cases for expired tokens`

## Step-by-step execution

```bash
# 1. Inspect what we are working with
git status --short
git diff --cached --stat
git diff --cached --name-only
git log --oneline -15

# 2. Pick groups. Maximum 5. Record the file list for each group before committing.

# 3. Unstage everything so groups can be committed one at a time.
#    This is safe: a mixed reset keeps all working-tree changes intact.
git reset

# 4. For each group, add only that group's files and commit it.
git add <files in group>
git diff --cached --stat   # verify the group looks right
git commit -m "<type>(<scope>): <description>"
# Use git commit without -m if a multi-line message is needed.

# 5. Repeat until all previously-staged changes are committed.

# 6. Final check:
git status --short
git log --oneline -5
```

## What not to do

- Do not rewrite unrelated files.
- Do not run tests or builds unless the user explicitly asked.
- Do not create new branches.
- Do not push.
- Do not use `git reset --hard`, `git checkout --`, or `git restore` in a way that discards changes.
- Do not write a long plan before acting. Inspect, group, commit.

## Response format

After committing, report:

- Number of commits made
- One-line summary of each commit with its SHA
- Any unstaged or untracked files still remaining
