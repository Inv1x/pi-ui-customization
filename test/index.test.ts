import assert from "node:assert/strict";
import test from "node:test";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import {
	applyStatusOptions,
	STATUS_ACTIVATION_EVENT,
	STATUS_OPTIONS_EVENT,
	sessionCost,
} from "../src/index.ts";

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

test("public inspector contracts use stable event names", () => {
	assert.equal(STATUS_OPTIONS_EVENT, "pi-ui-customization:status-options");
	assert.equal(STATUS_ACTIVATION_EVENT, "pi-ui-customization:activate-status");
});

test("session cost includes all persisted model usage on the branch", () => {
	const usage = (total: number) => ({ cost: { total } });
	const entries = [
		{
			type: "message",
			message: { role: "assistant", usage: usage(1.25) },
		},
		{
			type: "message",
			message: { role: "toolResult", usage: usage(0.5) },
		},
		{ type: "compaction", usage: usage(0.2) },
		{ type: "branch_summary", usage: usage(0.3) },
		{ type: "usage", kind: "cache_warm", usage: usage(0.25) },
		{ type: "usage", kind: "future_kind", usage: usage(0.5) },
		{
			type: "custom_message",
			customType: "usage-notice",
			details: { usage: usage(0.25) },
		},
		{ type: "context_edit", targetId: "assistant", replacement: null },
		{ type: "message", message: { role: "user" } },
	] as unknown as SessionEntry[];
	assert.equal(sessionCost(entries), 3);
	assert.equal(
		sessionCost([
			{ type: "usage", usage: usage(Number.NaN) },
		] as unknown as SessionEntry[]),
		0,
	);
});
