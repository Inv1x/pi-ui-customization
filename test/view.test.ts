import assert from "node:assert/strict";
import test from "node:test";
import {
	type Terminal,
	TuiAltScreen,
	TuiMainScreen,
	visibleWidth,
} from "@earendil-works/pi-tui";
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
	sanitizeTerminalColors,
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

test("selected status color sanitization preserves only color SGR", () => {
	assert.equal(
		sanitizeTerminalColors(
			"\u001b]0;forged-title\u0007\u001b[1;38;2;90;128;128mteal\u001b[0m\u001b[2J!",
		),
		"\u001b[38;2;90;128;128mteal\u001b[39;49m!\u001b[39;49m",
	);
	assert.equal(
		sanitizeTerminalColors(
			"\u001b[31mred\u001b[39m \u001b[48;5;24mblue\u001b[49m",
		),
		"\u001b[31mred\u001b[39m \u001b[48;5;24mblue\u001b[49m\u001b[39;49m",
	);
	assert.equal(
		sanitizeTerminalColors("\u001b[31munclosed"),
		"\u001b[31munclosed\u001b[39;49m",
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

test("header and footer render in regular and fullscreen TUI implementations", () => {
	const terminal = {
		columns: 100,
		rows: 30,
		kittyProtocolActive: false,
		start() {},
		stop() {},
		async drainInput() {},
		write() {},
		moveBy() {},
		hideCursor() {},
		showCursor() {},
		clearLine() {},
		clearFromCursor() {},
		clearScreen() {},
		setTitle() {},
		setProgress() {},
	} as Terminal;
	for (const tui of [new TuiMainScreen(terminal), new TuiAltScreen(terminal)]) {
		tui.addChild({
			render: (width) => [
				...renderHeader("~/work/app", width),
				...renderFooter({
					width,
					directory: "~/work/app",
					model: { ...EMPTY_MODEL_INFO },
					git: { branch: "main", changedFiles: 0 },
					statuses: new Map(),
					theme,
				}),
			],
			invalidate() {},
		});
		for (const width of [1, 12, 80, 160]) {
			assert.ok(
				tui.render(width).every((line) => visibleWidth(line) <= width),
				tui.mode,
			);
		}
	}
});

test("footer preserves opted-in selected status colors", () => {
	const coloredStatus =
		"\u001b[38;2;90;128;128m1 agent running · $2.63 · /subagents-fleet\u001b[39m";
	const lines = renderFooter({
		width: 80,
		directory: "~/work/app",
		model: { ...EMPTY_MODEL_INFO },
		git: { ...EMPTY_GIT_INFO },
		statuses: new Map([["pi-subagents", coloredStatus]]),
		selectedStatusKey: "pi-subagents",
		preserveSelectedStatusColorKeys: new Set(["pi-subagents"]),
		theme,
	});
	assert.equal(lines[2], `[inverse]${coloredStatus}\u001b[39;49m[/inverse]`);
});
