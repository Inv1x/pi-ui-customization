import assert from "node:assert/strict";
import test from "node:test";
import { applyStatusOptions } from "../src/index.ts";

test("status producers can opt their selected footer color into preservation", () => {
	const keys = new Set<string>();
	assert.equal(
		applyStatusOptions(keys, {
			key: "pi-subagents",
			preserveSelectedColors: true,
		}),
		true,
	);
	assert.deepEqual([...keys], ["pi-subagents"]);

	assert.equal(
		applyStatusOptions(keys, {
			key: "pi-subagents",
			preserveSelectedColors: false,
		}),
		true,
	);
	assert.deepEqual([...keys], []);
	assert.equal(
		applyStatusOptions(keys, { key: "", preserveSelectedColors: true }),
		false,
	);
	assert.equal(applyStatusOptions(keys, { key: "other" }), false);
});
