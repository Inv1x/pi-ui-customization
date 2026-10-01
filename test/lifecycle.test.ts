import assert from "node:assert/strict";
import test from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	type EditorComponent,
	visibleWidth,
} from "@earendil-works/pi-tui";
import type { FooterEditorFactory } from "../src/footer-navigation.ts";
import uiCustomization, { STATUS_OPTIONS_EVENT } from "../src/index.ts";
import { formatDirectory } from "../src/view.ts";

const theme = {
	fg: (_color: string, text: string) => text,
	inverse: (text: string) => text,
} as ExtensionContext["ui"]["theme"];

function harness() {
	const handlers = new Map<
		string,
		Array<(event: unknown, ctx: ExtensionContext) => unknown>
	>();
	const busListeners = new Map<string, Set<(data: unknown) => void>>();
	const titles: string[] = [];
	let headerFactory: Parameters<ExtensionContext["ui"]["setHeader"]>[0];
	let footerFactory: Parameters<ExtensionContext["ui"]["setFooter"]>[0];
	let header: (Component & { dispose?(): void }) | undefined;
	let footer: (Component & { dispose?(): void }) | undefined;
	let editorFactory: FooterEditorFactory | undefined;
	let branch = "main";
	let contextUsage = {
		tokens: 10,
		contextWindow: 128_000,
		percent: 1,
	};
	let sessionBranch: SessionEntry[] = [];
	let branchCallback: (() => void) | undefined;
	let branchUnsubscribes = 0;
	let renders = 0;
	const statuses = new Map([["pi-subagents", "1 agent"]]);
	const tui = { requestRender: () => renders++ };
	const footerData: ReadonlyFooterDataProvider = {
		getGitBranch: () => branch,
		getExtensionStatuses: () => statuses,
		getAvailableProviderCount: () => 1,
		onBranchChange: (callback) => {
			branchCallback = callback;
			return () => {
				branchUnsubscribes++;
				if (branchCallback === callback) branchCallback = undefined;
			};
		},
	};
	const baseEditor = {
		render: () => ["editor"],
		invalidate() {},
		handleInput() {},
		getText: () => "",
		setText() {},
	} as EditorComponent;
	const previousEditor = (() => baseEditor) as FooterEditorFactory;
	editorFactory = previousEditor;

	const ui = {
		theme,
		setHeader(factory: typeof headerFactory) {
			header?.dispose?.();
			headerFactory = factory;
			header = factory?.(tui as never, theme);
		},
		setFooter(factory: typeof footerFactory) {
			footer?.dispose?.();
			footerFactory = factory;
			footer = factory?.(tui as never, theme, footerData);
		},
		getEditorComponent: () => editorFactory,
		setEditorComponent: (factory: FooterEditorFactory | undefined) => {
			editorFactory = factory;
		},
		setTitle: (title: string) => titles.push(title),
	} as unknown as ExtensionContext["ui"];
	const ctx = {
		mode: "tui",
		cwd: process.cwd(),
		ui,
		model: {
			provider: "test",
			id: "model",
			reasoning: true,
			contextWindow: 128_000,
		},
		thinkingLevel: "high",
		getContextUsage: () => contextUsage,
		sessionManager: {
			getBranch: () => sessionBranch,
			getSessionId: () => "session-id",
		},
	} as unknown as ExtensionContext;
	const pi = {
		on(
			name: string,
			handler: (event: unknown, ctx: ExtensionContext) => unknown,
		) {
			const current = handlers.get(name) ?? [];
			current.push(handler);
			handlers.set(name, current);
		},
		events: {
			on(name: string, listener: (data: unknown) => void) {
				const current = busListeners.get(name) ?? new Set();
				current.add(listener);
				busListeners.set(name, current);
				return () => current.delete(listener);
			},
			emit(name: string, data: unknown) {
				for (const listener of busListeners.get(name) ?? []) listener(data);
			},
		},
	} as unknown as ExtensionAPI;
	uiCustomization(pi);

	return {
		ctx,
		emit: async (
			name: string,
			event: unknown = {},
			eventContext = { ...ctx },
		) => {
			for (const handler of handlers.get(name) ?? [])
				await handler(event, eventContext);
		},
		get header() {
			return header;
		},
		get footer() {
			return footer;
		},
		get editorFactory() {
			return editorFactory;
		},
		previousEditor,
		titles,
		get branchUnsubscribes() {
			return branchUnsubscribes;
		},
		changeBranch(next: string) {
			branch = next;
			branchCallback?.();
		},
		mutateBranch(next: string) {
			branch = next;
		},
		setContextUsage(percent: number, contextWindow: number) {
			contextUsage = { tokens: 10, contextWindow, percent };
		},
		setSessionBranch(entries: SessionEntry[]) {
			sessionBranch = entries;
		},
		get renders() {
			return renders;
		},
		statusListenerCount: () =>
			busListeners.get(STATUS_OPTIONS_EVENT)?.size ?? 0,
	};
}

for (const reason of ["reload", "new", "resume", "fork", "quit"] as const) {
	test(`${reason} shutdown restores owned UI and releases subscriptions`, async () => {
		const app = harness();
		await app.emit("session_start", { reason: "startup" });
		assert.ok(app.header);
		assert.ok(app.footer);
		assert.notEqual(app.editorFactory, app.previousEditor);
		assert.equal(app.statusListenerCount(), 1);
		assert.equal(app.titles.at(-1), `pi · ${formatDirectory(process.cwd())}`);

		await app.emit("session_shutdown", { reason });
		assert.equal(app.header, undefined);
		assert.equal(app.footer, undefined);
		assert.equal(app.editorFactory, app.previousEditor);
		assert.equal(app.branchUnsubscribes, 1);
		assert.equal(app.statusListenerCount(), 0);
		assert.equal(app.titles.at(-1), "pi");
	});
}

test("footer reacts to branch changes and both TUI renderer width regimes", async () => {
	const app = harness();
	await app.emit("session_start", { reason: "startup" });
	for (const width of [1, 12, 80, 160]) {
		assert.ok(
			app.header?.render(width).every((line) => visibleWidth(line) <= width),
		);
		const lines = app.footer?.render(width) ?? [];
		assert.ok(lines.every((line) => visibleWidth(line) <= width));
	}
	assert.match(
		(app.footer?.render(160) ?? []).join("\n"),
		/test\/model · high/,
	);
	const renders = app.renders;
	app.changeBranch("feature/fullscreen");
	assert.equal(app.renders, renders + 1);
	assert.match(
		(app.footer?.render(160) ?? []).join("\n"),
		/feature\/fullscreen/,
	);
	await app.emit("session_shutdown", { reason: "quit" });
});

test("session tree and compaction refresh mutable branch and model state", async () => {
	const app = harness();
	await app.emit("session_start", { reason: "startup" });
	const assistantUsage = {
		type: "message",
		message: { role: "assistant", usage: { cost: { total: 1.25 } } },
	} as unknown as SessionEntry;
	app.mutateBranch("feature/tree");
	app.setContextUsage(42, 64_000);
	app.setSessionBranch([assistantUsage]);
	const treeRenders = app.renders;
	await app.emit("session_tree", { newLeafId: "leaf" });
	assert.ok(app.renders > treeRenders);
	assert.match(
		(app.footer?.render(160) ?? []).join("\n"),
		/42%\/64k · \$1\.25.*feature\/tree/,
	);

	const compactionUsage = {
		type: "compaction",
		usage: { cost: { total: 0.5 } },
	} as unknown as SessionEntry;
	app.mutateBranch("feature/compacted");
	app.setContextUsage(7, 32_000);
	app.setSessionBranch([assistantUsage, compactionUsage]);
	const compactRenders = app.renders;
	await app.emit("session_compact", { compactionEntry: compactionUsage });
	assert.ok(app.renders > compactRenders);
	assert.match(
		(app.footer?.render(160) ?? []).join("\n"),
		/7%\/32k · \$1\.75.*feature\/compacted/,
	);
	await app.emit("session_shutdown", { reason: "quit" });
});

test("prompt wait state follows the session, not ephemeral context identity", async () => {
	const app = harness();
	await app.emit("session_start");
	await app.emit("ui_prompt_start");
	await app.emit("ui_prompt_start");
	assert.match(app.titles.at(-1) ?? "", /waiting for user/);
	assert.match((app.footer?.render(160) ?? []).join("\n"), /waiting for user/);
	await app.emit("ui_prompt_end");
	assert.match(app.titles.at(-1) ?? "", /waiting for user/);
	await app.emit("ui_prompt_end");
	await app.emit("ui_prompt_end");
	assert.doesNotMatch(app.titles.at(-1) ?? "", /waiting for user/);
	await app.emit("ui_prompt_start");
	await app.emit("session_shutdown", { reason: "new" });
	await app.emit("session_start", { reason: "new" });
	assert.equal(app.statusListenerCount(), 1);
	assert.doesNotMatch(
		(app.footer?.render(160) ?? []).join("\n"),
		/waiting for user/,
	);
	await app.emit(
		"ui_prompt_start",
		{},
		{
			...app.ctx,
			sessionManager: {
				...app.ctx.sessionManager,
				getSessionId: () => "other-session",
			},
		},
	);
	assert.doesNotMatch(app.titles.at(-1) ?? "", /waiting for user/);
	await app.emit("session_shutdown", { reason: "quit" });
});

test("idle usage entries refresh cost without an assistant event", async (t) => {
	t.mock.timers.enable({ apis: ["setInterval"] });
	const app = harness();
	await app.emit("session_start");
	app.setSessionBranch([
		{ type: "usage", kind: "cache_warm", usage: { cost: { total: 0.5 } } },
	] as unknown as SessionEntry[]);
	t.mock.timers.tick(3_000);
	assert.match((app.footer?.render(160) ?? []).join("\n"), /\$0\.50/);
	await app.emit("session_shutdown", { reason: "quit" });
});

test("non-TUI sessions leave component and title APIs untouched", async () => {
	const app = harness();
	(app.ctx as { mode: string }).mode = "print";
	await app.emit("session_start", { reason: "startup" });
	assert.equal(app.header, undefined);
	assert.equal(app.footer, undefined);
	assert.equal(app.editorFactory, app.previousEditor);
	assert.deepEqual(app.titles, []);
	await app.emit("session_shutdown", { reason: "quit" });
});
