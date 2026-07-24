import assert from "node:assert/strict";
import test from "node:test";
import type { KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorComponent, TUI } from "@earendil-works/pi-tui";
import {
	actionableStatusKeys,
	createFooterNavigationEditorFactory,
	type FooterEditorFactory,
	FooterNavigationState,
} from "../src/footer-navigation.ts";

function keybindings(): KeybindingsManager {
	return {
		matches: (data: string, binding: string) => {
			if (binding === "tui.select.up") return data === "up";
			if (binding === "tui.select.down") return data === "down";
			if (binding === "tui.select.confirm") return data === "enter";
			if (binding === "tui.select.cancel") return data === "escape";
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

test("empty-editor arrows select footer rows and Enter activates without submitting", () => {
	let text = "";
	const delegated: string[] = [];
	const activated: string[] = [];
	let renders = 0;
	const base = {
		render: () => ["editor"],
		invalidate: () => {},
		handleInput: (data: string) => delegated.push(data),
		getText: () => text,
		setText: (value: string) => {
			text = value;
		},
	} satisfies EditorComponent;
	const previous = (() => base) as FooterEditorFactory;
	const state = new FooterNavigationState();
	let keys = ["background-terminals", "pi-subagents"];
	const factory = createFooterNavigationEditorFactory(previous, state, {
		getStatusKeys: () => keys,
		activate: (key) => activated.push(key),
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

	component.handleInput("down");
	assert.equal(state.selectedKey, "background-terminals");
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");
	component.handleInput("down");
	assert.equal(state.selectedKey, "background-terminals");
	component.handleInput("up");
	assert.equal(state.selectedKey, "pi-subagents");
	component.handleInput("enter");
	assert.deepEqual(activated, ["pi-subagents"]);
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, []);

	component.handleInput("enter");
	assert.deepEqual(delegated, ["enter"]);
	component.handleInput("up");
	assert.equal(state.selectedKey, "pi-subagents");
	component.handleInput("escape");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter"]);

	component.handleInput("down");
	keys = ["pi-subagents"];
	component.handleInput("down");
	assert.equal(state.selectedKey, "pi-subagents");

	text = "draft";
	component.handleInput("down");
	assert.equal(state.selectedKey, undefined);
	assert.deepEqual(delegated, ["enter", "down"]);
	assert.ok(renders >= 8);
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
});
