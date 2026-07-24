import assert from "node:assert/strict";
import test from "node:test";
import { countChangedFiles, type GitRunner, loadGitInfo } from "../src/git.ts";

function runner(
	outputs: Record<string, { code: number; stdout: string }>,
): GitRunner {
	return async (_cwd, args) =>
		outputs[args.join(" ")] ?? { code: 1, stdout: "" };
}

test("changed file count includes tracked and untracked porcelain rows", () => {
	assert.equal(countChangedFiles(""), 0);
	assert.equal(countChangedFiles(" M src/a.ts\n?? src/b.ts\n"), 2);
});

test("git state reports branch and changed files", async () => {
	const state = await loadGitInfo(
		"/repo",
		runner({
			"branch --show-current": { code: 0, stdout: "feature/ui\n" },
			"rev-parse --short HEAD": { code: 0, stdout: "abc1234\n" },
			"status --porcelain=v1 --untracked-files=all": {
				code: 0,
				stdout: " M src/index.ts\n?? test/new.test.ts\n",
			},
		}),
	);
	assert.deepEqual(state, { branch: "feature/ui", changedFiles: 2 });
});

test("git state handles detached heads and non-repositories", async () => {
	const detached = await loadGitInfo(
		"/repo",
		runner({
			"branch --show-current": { code: 0, stdout: "" },
			"rev-parse --short HEAD": { code: 0, stdout: "deadbee\n" },
			"status --porcelain=v1 --untracked-files=all": { code: 0, stdout: "" },
		}),
	);
	assert.deepEqual(detached, { branch: "detached@deadbee", changedFiles: 0 });
	assert.deepEqual(await loadGitInfo("/tmp", runner({})), { changedFiles: 0 });
});
