import assert from "node:assert/strict";
import test from "node:test";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import {
	CURSOR_MARKER,
	type EditorComponent,
	type TUI,
} from "@earendil-works/pi-tui";
import {
	actionableStatusKeys,
	createFooterNavigationEditorFactory,
	type FooterEditorFactory,
	FooterNavigationState,
} from "../src/footer-navigation.ts";

function keybindings(): KeybindingsManager {
	return {
		matches: (data: string, binding: string) => {
			if (binding === "app.clear") return data === "ctrl+c";
			if (binding === "tui.editor.cursorDown") return data === "down";
			if (binding === "tui.select.up") return data === "up";
			if (binding === "tui.select.down") return data === "down";
			if (binding === "tui.select.confirm") return data === "enter";
			if (binding === "tui.select.cancel")
				return data === "escape" || data === "ctrl+c";
			return false;
		},
	} as unknown as KeybindingsManager;
}

test("actionable footer statuses use stable sorted extension keys", () => {
	assert.deepEqual(
		actionableStatusKeys(
			new Map([
				["pi-subagents", "agents"],
				["unrelated", "ignore"],
				["background-terminals", "terminals"],
			]),
		),
		["background-terminals", "pi-subagents"],
	);
});

test("Down enters footer from an empty draft and Up returns", () => {
	let text = "";
	const delegated: string[] = [];
	const activated: string[] = [];
	let renders = 0;
	const base: EditorComponent & {
		focused: boolean;
		actionHandlers: Map<string, () => void>;
	} = {
		focused: false,
		actionHandlers: new Map([["app.clear", () => {}]]),
		render: () => [
			base.focused
				? `draft${CURSOR_MARKER}\u001b[7mX\u001b[0m`
				: "draft\u001b[7mX\u001b[0m",
		],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => text,
		setText: (value: string) => {
			text = value;
		},
	};
	const previous = (() => base) as FooterEditorFactory;
	const state = new FooterNavigationState();
	let keys = ["background-terminals", "pi-subagents"];
	const factory = createFooterNavigationEditorFactory(previous, state, {
		getStatusKeys: () => keys,
		activate: (key) => activated.push(key),
		boundaryNavigationEnabled: true,
	});
	const component = factory(
		{
			requestRender: () => {
				renders++;
			},
		} as unknown as TUI,
		{} as never,
		keybindings(),
	);

	(component as EditorComponent & { focused: boolean }).focused = true;
	assert.ok(component.render(80)[0]?.includes(CURSOR_MARKER));
	assert.equal(base.focused, true);

	component.handleInput("down");
	const selectedEditor = component.render(80)[0] ?? "";
	assert.equal(state.selectedKey, "background-terminals");
	assert.equal(selectedEditor.includes(CURSOR_MARKER), false);
	assert.equal(selectedEditor.includes("\u001b[7m"), false);
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents", "selection clamps at bottom");
	component.handleInput("up");
	assert.equal(state.selectedKey, "background-terminals");
	component.handleInput("up");
	const returnedEditor = component.render(80)[0] ?? "";
	assert.equal(state.selectedKey, undefined, "Up from the first row unfocuses");
	assert.ok(returnedEditor.includes(CURSOR_MARKER));
	assert.equal(base.focused, true, "returning restores draft cursor focus");

	component.handleInput("down");
	component.handleInput("down");
	component.handleInput("enter");
	assert.deepEqual(activated, ["pi-subagents"]);
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, []);

	component.handleInput("enter");
	assert.deepEqual(delegated, ["enter"]);
	component.handleInput("down");
	component.handleInput("escape");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter"]);

	component.handleInput("down");
	component.handleInput("ctrl+c");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter", "ctrl+c"]);

	component.handleInput("down");
	keys = ["pi-subagents"];
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	keys = [];
	assert.ok(component.render(80)[0]?.includes(CURSOR_MARKER));
	assert.equal(
		state.selectedKey,
		undefined,
		"render reconciles removed statuses",
	);
	keys = ["pi-subagents"];

	text = "first\nsecond";
	component.handleInput("x");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter", "ctrl+c", "x"]);
	component.handleInput("down");
	assert.equal(state.selectedKey, undefined, "non-empty drafts keep Down");
	assert.deepEqual(delegated, ["enter", "ctrl+c", "x", "down"]);

	text = "";
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	component.handleInput("x");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter", "ctrl+c", "x", "down", "x"]);
	assert.ok(renders >= 10);
});

test("autocomplete and extension shortcuts keep first ownership of navigation keys", () => {
	let autocomplete = true;
	let shortcutEnabled = false;
	const delegated: string[] = [];
	const shortcuts: string[] = [];
	const base = {
		render: () => ["editor"],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => "",
		setText: () => {},
		isShowingAutocomplete: () => autocomplete,
		onExtensionShortcut: (data: string) => {
			shortcuts.push(data);
			return shortcutEnabled;
		},
	};
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => assert.fail("navigation should not activate"),
			boundaryNavigationEnabled: true,
		},
	)({ requestRender: () => {} } as unknown as TUI, {} as never, keybindings());

	component.handleInput("down");
	assert.deepEqual(delegated, ["down"]);
	assert.deepEqual(shortcuts, []);
	assert.equal(state.selectedKey, undefined);

	autocomplete = false;
	shortcutEnabled = true;
	component.handleInput("down");
	assert.deepEqual(shortcuts, ["down"]);
	assert.deepEqual(delegated, ["down"]);
	assert.equal(state.selectedKey, undefined);

	shortcutEnabled = false;
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	autocomplete = true;
	component.render(80);
	assert.equal(
		state.selectedKey,
		undefined,
		"autocomplete appearing clears footer selection",
	);
});

test("losing editor focus clears footer selection", () => {
	const base = {
		focused: false,
		render: () => ["editor"],
		invalidate: () => {},
		handleInput: () => {},
		getText: () => "",
		setText: () => {},
	};
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => {},
			boundaryNavigationEnabled: true,
		},
	)(
		{ requestRender: () => {} } as unknown as TUI,
		{} as never,
		keybindings(),
	) as EditorComponent & {
		focused: boolean;
	};

	component.focused = true;
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	component.focused = false;
	assert.equal(state.selectedKey, undefined);
});

test("special app actions remapped to Down retain editor ownership", () => {
	for (const action of [
		"app.exit",
		"app.clipboard.pasteImage",
		"app.interrupt",
	] as const) {
		const delegated: string[] = [];
		const base = {
			onCtrlD: () => {},
			onPasteImage: () => {},
			onEscape: () => {},
			render: () => ["editor"],
			invalidate: () => {},
			handleInput: (data: string) => delegated.push(data),
			getText: () => "",
			setText: () => {},
		};
		const defaults = keybindings();
		const remapped = {
			matches: (data: string, binding: string) =>
				(binding === action && data === "down") ||
				defaults.matches(data, binding as never),
		} as unknown as KeybindingsManager;
		const state = new FooterNavigationState();
		const component = createFooterNavigationEditorFactory(
			(() => base) as FooterEditorFactory,
			state,
			{
				getStatusKeys: () => ["pi-subagents"],
				activate: () => {},
				boundaryNavigationEnabled: true,
			},
		)({ requestRender: () => {} } as unknown as TUI, {} as never, remapped);

		component.handleInput("down");
		assert.deepEqual(delegated, ["down"], action);
		assert.equal(state.selectedKey, undefined, action);
		state.selectedKey = "pi-subagents";
		component.handleInput("down");
		assert.deepEqual(delegated, ["down", "down"], action);
		assert.equal(state.selectedKey, undefined, action);
	}
});

test("Down enters footer from a non-empty draft at its visual boundary", () => {
	const delegated: string[] = [];
	let text = "draft text";
	const base = {
		render: () => [
			"────────",
			`draft text${CURSOR_MARKER}\u001b[7m \u001b[0m`,
			"────────",
		],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => text,
		setText: (value: string) => {
			text = value;
		},
	};
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => {},
			boundaryNavigationEnabled: true,
		},
	)({ requestRender: () => {} } as unknown as TUI, {} as never, keybindings());

	component.render(80);
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	assert.deepEqual(delegated, []);
	assert.equal(component.getText(), "draft text");
});

test("non-empty drafts retain Down above the final visible line", () => {
	const delegated: string[] = [];
	let bottomBorder = "────────";
	const base = {
		render: () => [
			"────────",
			`first${CURSOR_MARKER}\u001b[7m \u001b[0m`,
			"second",
			bottomBorder,
		],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => "first\nsecond",
		setText: () => {},
	};
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => {},
			boundaryNavigationEnabled: true,
		},
	)({ requestRender: () => {} } as unknown as TUI, {} as never, keybindings());

	component.render(80);
	component.handleInput("down");
	assert.deepEqual(delegated, ["down"]);
	assert.equal(state.selectedKey, undefined);

	bottomBorder = "──── ↓ 1 ────";
	base.render = () => [
		"────────",
		`second${CURSOR_MARKER}\u001b[7m \u001b[0m`,
		bottomBorder,
	];
	component.render(80);
	component.handleInput("down");
	assert.deepEqual(delegated, ["down", "down"]);
	assert.equal(state.selectedKey, undefined);
});

test("app actions remapped to Down retain ownership at the footer boundary", () => {
	const delegated: string[] = [];
	const base = {
		actionHandlers: new Map([["app.clear", () => {}]]),
		render: () => ["editor"],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => "",
		setText: () => {},
	};
	const defaults = keybindings();
	const remapped = {
		matches: (data: string, binding: string) =>
			(binding === "app.clear" && data === "down") ||
			defaults.matches(data, binding as never),
	} as unknown as KeybindingsManager;
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => {},
			boundaryNavigationEnabled: true,
		},
	)({ requestRender: () => {} } as unknown as TUI, {} as never, remapped);

	component.handleInput("down");
	assert.deepEqual(delegated, ["down"]);
	assert.equal(state.selectedKey, undefined);
});

test("a composed custom editor keeps ownership of boundary Down", () => {
	const delegated: string[] = [];
	const base = {
		render: () => ["custom editor"],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => "draft",
		setText: () => {},
	};
	const state = new FooterNavigationState();
	const component = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		state,
		{
			getStatusKeys: () => ["pi-subagents"],
			activate: () => {},
		},
	)({ requestRender: () => {} } as unknown as TUI, {} as never, keybindings());

	component.handleInput("down");
	assert.deepEqual(delegated, ["down"]);
	assert.equal(state.selectedKey, undefined);
});
