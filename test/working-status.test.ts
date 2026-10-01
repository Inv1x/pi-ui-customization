import assert from "node:assert/strict";
import test from "node:test";
import {
	type CustomEditor,
	getSelectListTheme,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	type TUI,
	TUI_KEYBINDINGS,
	KeybindingsManager as TuiKeybindingsManager,
} from "@earendil-works/pi-tui";
import {
	createFooterNavigationEditorFactory,
	type FooterEditorFactory,
	FooterNavigationState,
} from "../src/footer-navigation.ts";

type Indicator = Parameters<CustomEditor["setWorkingStatusIndicator"]>[0];
type EmbeddedEditor = {
	embedWorkingStatus: boolean;
	setWorkingStatusIndicator(value: Indicator): void;
};
const tui = { requestRender() {} } as unknown as TUI;
const keys = new TuiKeybindingsManager(
	TUI_KEYBINDINGS,
	{},
) as unknown as KeybindingsManager;
const getEditorTheme = () => ({
	borderColor: (text: string) => text,
	selectList: getSelectListTheme(),
});
const options = { getStatusKeys: () => [], activate() {} };

test("fallback editor opts into embedded working and recovery indicators", () => {
	const editor = createFooterNavigationEditorFactory(
		undefined,
		new FooterNavigationState(),
		options,
	)(tui, getEditorTheme(), keys);
	const embedded = editor as typeof editor & EmbeddedEditor;
	assert.equal(embedded.embedWorkingStatus, true);
	assert.equal(typeof embedded.setWorkingStatusIndicator, "function");
	embedded.setWorkingStatusIndicator(undefined);
});

test("composed editor forwards indicator updates and clears with correct receiver", () => {
	const seen: Indicator[] = [];
	const base = {
		embedWorkingStatus: true,
		render: () => [],
		invalidate() {},
		handleInput() {},
		getText: () => "",
		setText() {},
		setWorkingStatusIndicator(value: Indicator) {
			assert.equal(this, base);
			seen.push(value);
		},
	};
	const editor = createFooterNavigationEditorFactory(
		(() => base) as FooterEditorFactory,
		new FooterNavigationState(),
		options,
	)(tui, getEditorTheme(), keys) as unknown as EmbeddedEditor;
	assert.equal(editor.embedWorkingStatus, true);
	editor.setWorkingStatusIndicator(undefined);
	assert.deepEqual(seen, [undefined]);
});

test("composition does not opt incompatible or explicitly standalone editors in", () => {
	for (const status of [
		{},
		{ embedWorkingStatus: true },
		{ embedWorkingStatus: false, setWorkingStatusIndicator() {} },
	]) {
		const base = {
			render: () => [],
			invalidate() {},
			handleInput() {},
			getText: () => "",
			setText() {},
			...status,
		};
		const editor = createFooterNavigationEditorFactory(
			(() => base) as FooterEditorFactory,
			new FooterNavigationState(),
			options,
		)(tui, getEditorTheme(), keys) as unknown as EmbeddedEditor;
		assert.equal(editor.embedWorkingStatus, false);
	}
});
