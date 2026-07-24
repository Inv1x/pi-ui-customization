import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
	columns,
	type DashboardTheme,
	EMPTY_GIT_INFO,
	EMPTY_MODEL_INFO,
	formatDirectory,
	formatTokens,
	gradientText,
	renderFooter,
	renderHeader,
	sanitizeTerminalLabel,
} from "../src/view.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	inverse: (text: string) => `[inverse]${text}[/inverse]`,
} as DashboardTheme;

test("folder labels are compact and strip terminal escapes", () => {
	assert.equal(
		formatDirectory("/Users/alice/work/app", "/Users/alice"),
		"~/work/app",
	);
	assert.equal(formatDirectory("/Users/alice", "/Users/alice"), "~");
	assert.equal(
		sanitizeTerminalLabel("safe\u001b[31m-red\u001b[0m\u0007"),
		"safe-red",
	);
	assert.equal(
		sanitizeTerminalLabel("branch\u001b]0;forged-title\u0007-name"),
		"branch-name",
	);
});

test("token and column formatting stays compact at narrow widths", () => {
	assert.equal(formatTokens(999), "999");
	assert.equal(formatTokens(10_500), "11k");
	assert.equal(formatTokens(1_250_000), "1.3m");
	for (const width of [12, 24, 80]) {
		assert.ok(
			visibleWidth(columns("a very long left", "a long right", width)) <= width,
		);
	}
});

test("header renders centered RGB-gradient logo and folder", () => {
	const header = renderHeader("~/work/app", 60);
	assert.equal(header.length, 9);
	assert.ok((header[1] ?? "").includes("\u001b[38;2;"));
	assert.match(sanitizeTerminalLabel(header[7] ?? ""), /~\/work\/app/);
	assert.ok(header.every((line) => visibleWidth(line) <= 60));
	assert.match(gradientText("Pi", 0), /38;2;22;83;189mP/);
});

test("footer keeps extension statuses sorted below its two information lines", () => {
	const lines = renderFooter({
		width: 100,
		directory: "~/work/app",
		model: {
			provider: "openai",
			modelId: "gpt-test",
			thinking: "high",
			contextWindow: 128_000,
			contextPercent: 12.6,
			cost: 1.234,
			tokensPerSecond: 42.4,
		},
		git: { branch: "main", changedFiles: 1 },
		statuses: new Map([
			["z-extension", "last"],
			["a-extension", "first\nsecond"],
		]),
		theme,
	});
	assert.match(lines[0] ?? "", /^~\/work\/app.*openai\/gpt-test · high$/);
	assert.match(
		lines[1] ?? "",
		/^13%\/128k · \$1\.23 · 42 tok\/s.*main · 1 file changed$/,
	);
	assert.deepEqual(lines.slice(2), ["first", "second", "last"]);
});

test("footer inverts only the selected status text", () => {
	const lines = renderFooter({
		width: 80,
		directory: "~/work/app",
		model: { ...EMPTY_MODEL_INFO },
		git: { ...EMPTY_GIT_INFO },
		statuses: new Map([
			["background-terminals", "1 terminal running · /ps"],
			[
				"pi-subagents",
				"\u001b[31m1 agent running\u001b[39m · $2.63 · /subagents-fleet",
			],
		]),
		selectedStatusKey: "pi-subagents",
		theme,
	});
	assert.equal(lines[2], "1 terminal running · /ps");
	assert.equal(
		lines[3],
		"[inverse]1 agent running · $2.63 · /subagents-fleet[/inverse]",
	);
	assert.equal((lines[3] ?? "").includes("\u001b"), false);
	assert.ok(
		visibleWidth((lines[3] ?? "").replace(/\[(?:\/)?inverse\]/g, "")) < 80,
	);
});
