# Footer Git Branch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Match candy's Git indicator beside the footer folder.

**Architecture:** Change only footer presentation, consuming existing reactive branch and changed-file count. Use ANSI 32/31 colors for exact candy green/red.

**Tech Stack:** TypeScript, Node test runner, Pi TUI.

**Spec:** `docs/superpowers/specs/2026-06-22-footer-git-branch-design.md`

## Global Constraints
- Preserve existing uncommitted changes; no automatic commit.
- No new dependencies or Git polling; header/title unchanged.
- Green `[branch]`, or green `[branch ` plus red `*` plus green `]`.
- No branch means no indicator or changed-file label.

## Review Focus
- Clean repository has no dirty marker.
- Dirty repository colors only the star red.
- Missing branch has no empty brackets or added whitespace.
- Untrusted branch strings cannot inject terminal controls.
- Long/Unicode branch labels fit narrow terminal widths.

### Task 1: Render and verify candy-style branch indicator

**Files:** Modify `src/view.ts`, `test/view.test.ts`, relevant branch assertions in `test/lifecycle.test.ts`, and `README.md`; create `.changeset/candy-footer-branch.md`.

**Interfaces:** Existing `renderFooter(options): string[]`, `GitInfo`, and reactive footer data remain unchanged.

- [x] Add failing renderer tests for clean/dirty/missing branches, exact ANSI green/red sequences, singular/plural counts without duplicated branch, malicious labels, and long Unicode labels at widths 1, 12, 80, 160. Update existing second-line expectation.
- [x] Run `node --import jiti/register --test test/view.test.ts`; confirm failures concern the requested presentation.
- [x] Update `renderFooter` in `src/view.ts`: sanitize branch, append candy indicator after theme-colored directory, and retain only changed-file count on line two. ANSI resets must not bleed color into padding or model text.
- [x] Update lifecycle assertions only if they depend on the old combined branch/count label; preserve branch-change coverage. Document the presentation in README and add a patch changeset.
- [x] Run `npm run validate`; require formatting, types and all tests to pass.
- [x] Obtain read-only review of task diff and resolve material findings. Do not commit unrelated existing changes.

## Execution record

- Tests first: four expected presentation failures; renderer implementation then passed all 13 view tests.
- Final verification: `git diff --check` and `npm run validate` passed; 41/41 tests, Biome and TypeScript clean.
- Independent read-only review completed. Reviewer suggested retaining the count without a branch; retained existing no-branch hiding behavior instead, as the plan explicitly requires, and clarified README wording. This does not change detached-HEAD/no-branch behavior.
- Worked in the existing checkout to preserve the user's baseline work; no commits, branch switches, publishing, or dependency changes performed.
