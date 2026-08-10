import assert from "node:assert/strict";
import test from "node:test";
import {
	countChangedFiles,
	type GitRunner,
	loadChangedFileCount,
} from "../src/git.ts";

function runner(
	outputs: Record<string, { code: number; stdout: string }>,
	calls: string[] = [],
): GitRunner {
	return async (_cwd, args) => {
		calls.push(args.join(" "));
		return outputs[args.join(" ")] ?? { code: 1, stdout: "" };
	};
}

test("changed file count includes tracked and untracked porcelain rows", () => {
	assert.equal(countChangedFiles(""), 0);
	assert.equal(countChangedFiles(" M src/a.ts\n?? src/b.ts\n"), 2);
});

test("changed-file refresh runs only git status", async () => {
	const calls: string[] = [];
	const count = await loadChangedFileCount(
		"/repo",
		runner(
			{
				"status --porcelain=v1 --untracked-files=all": {
					code: 0,
					stdout: " M src/index.ts\n?? test/new.test.ts\n",
				},
			},
			calls,
		),
	);
	assert.equal(count, 2);
	assert.deepEqual(calls, ["status --porcelain=v1 --untracked-files=all"]);
});

test("changed-file refresh quietly handles non-repositories", async () => {
	assert.equal(await loadChangedFileCount("/tmp", runner({})), 0);
});
