import {
	CustomEditor,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	type AutocompleteProvider,
	CURSOR_MARKER,
	type EditorComponent,
} from "@earendil-works/pi-tui";

export type { StatusActivationEvent as StatusActivation } from "./contracts.ts";
export { STATUS_ACTIVATION_EVENT } from "./contracts.ts";

export type FooterEditorFactory = NonNullable<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>;

const ACTIONABLE_STATUS_KEYS = new Set([
	"background-terminals",
	"pi-subagents",
]);

export function actionableStatusKeys(
	statuses: ReadonlyMap<string, string>,
): string[] {
	return [...statuses.keys()]
		.filter((key) => ACTIONABLE_STATUS_KEYS.has(key))
		.sort((left, right) => left.localeCompare(right));
}

export class FooterNavigationState {
	selectedKey: string | undefined;

	reconcile(keys: readonly string[]): void {
		if (this.selectedKey && !keys.includes(this.selectedKey))
			this.selectedKey = undefined;
	}

	move(keys: readonly string[], direction: -1 | 1): string | undefined {
		this.reconcile(keys);
		if (!keys.length) return undefined;
		const current = this.selectedKey
			? keys.indexOf(this.selectedKey)
			: direction > 0
				? -1
				: keys.length;
		const next = Math.max(0, Math.min(keys.length - 1, current + direction));
		this.selectedKey = keys[next];
		return this.selectedKey;
	}

	clear(): void {
		this.selectedKey = undefined;
	}
}

type WorkingStatusIndicator = Parameters<
	CustomEditor["setWorkingStatusIndicator"]
>[0];

type ComposableEditor = EditorComponent & {
	focused?: boolean;
	dispose?: () => void;
	readonly embedWorkingStatus?: boolean;
	setWorkingStatusIndicator?: (indicator: WorkingStatusIndicator) => void;
	actionHandlers?: Map<string, () => void>;
	onEscape?: () => void;
	onCtrlD?: () => void;
	onPasteImage?: () => void;
	onExtensionShortcut?: (data: string) => boolean | undefined;
	isShowingAutocomplete?: () => boolean;
};

class FooterNavigationEditor implements EditorComponent {
	private editorFocused = false;
	private cursorAtFooterBoundary = false;
	readonly embedWorkingStatus: boolean;

	constructor(
		private readonly base: ComposableEditor,
		private readonly keybindings: KeybindingsManager,
		private readonly state: FooterNavigationState,
		private readonly getStatusKeys: () => string[],
		private readonly activate: (key: string) => void,
		private readonly requestRender: () => void,
		private readonly boundaryNavigationEnabled: boolean,
	) {
		this.embedWorkingStatus =
			base.embedWorkingStatus === true &&
			typeof base.setWorkingStatusIndicator === "function";
	}

	setWorkingStatusIndicator(indicator: WorkingStatusIndicator): void {
		this.base.setWorkingStatusIndicator?.(indicator);
	}

	get focused(): boolean {
		return this.editorFocused;
	}
	set focused(value: boolean) {
		this.editorFocused = value;
		if (!value && this.state.selectedKey) {
			this.state.clear();
			this.requestRender();
		}
		if ("focused" in this.base) this.base.focused = value;
	}

	get wantsKeyRelease(): boolean | undefined {
		return this.base.wantsKeyRelease;
	}

	get actionHandlers(): Map<string, () => void> | undefined {
		return this.base.actionHandlers;
	}
	get onEscape(): (() => void) | undefined {
		return this.base.onEscape;
	}
	set onEscape(value: (() => void) | undefined) {
		this.base.onEscape = value;
	}
	get onCtrlD(): (() => void) | undefined {
		return this.base.onCtrlD;
	}
	set onCtrlD(value: (() => void) | undefined) {
		this.base.onCtrlD = value;
	}
	get onPasteImage(): (() => void) | undefined {
		return this.base.onPasteImage;
	}
	set onPasteImage(value: (() => void) | undefined) {
		this.base.onPasteImage = value;
	}
	get onExtensionShortcut():
		| ((data: string) => boolean | undefined)
		| undefined {
		return this.base.onExtensionShortcut;
	}
	set onExtensionShortcut(value:
		| ((data: string) => boolean | undefined)
		| undefined,) {
		this.base.onExtensionShortcut = value;
	}

	get onSubmit(): ((text: string) => void) | undefined {
		return this.base.onSubmit;
	}
	set onSubmit(value: ((text: string) => void) | undefined) {
		this.base.onSubmit = value;
	}
	get onChange(): ((text: string) => void) | undefined {
		return this.base.onChange;
	}
	set onChange(value: ((text: string) => void) | undefined) {
		this.base.onChange = value;
	}
	get borderColor(): ((text: string) => string) | undefined {
		return this.base.borderColor;
	}
	set borderColor(value: ((text: string) => string) | undefined) {
		this.base.borderColor = value;
	}

	render(width: number): string[] {
		this.state.reconcile(this.getStatusKeys());
		if (this.state.selectedKey && this.base.isShowingAutocomplete?.())
			this.state.clear();
		if ("focused" in this.base) this.base.focused = this.editorFocused;
		const lines = this.base.render(width);
		this.cursorAtFooterBoundary = this.isCursorAtFooterBoundary(lines);
		return this.state.selectedKey
			? lines.map((line) => this.hideDraftCursor(line))
			: lines;
	}

	invalidate(): void {
		this.base.invalidate();
	}

	handleInput(data: string): void {
		const keys = this.getStatusKeys();
		this.state.reconcile(keys);
		if (this.base.isShowingAutocomplete?.() || keys.length === 0) {
			if (this.state.selectedKey) {
				this.state.clear();
				this.requestRender();
			}
			this.base.handleInput(data);
			return;
		}

		const isUp = this.keybindings.matches(data, "tui.select.up");
		const isDown = this.keybindings.matches(data, "tui.select.down");
		const isConfirm = this.keybindings.matches(data, "tui.select.confirm");
		const isCancel = this.keybindings.matches(data, "tui.select.cancel");

		if (this.state.selectedKey) {
			const willHandle = isUp || isDown || isConfirm || isCancel;
			const checkedShortcut =
				willHandle && Boolean(this.base.onExtensionShortcut);
			if (willHandle && this.base.onExtensionShortcut?.(data)) return;
			if (willHandle && this.matchesDelegatedAppAction(data, !isCancel)) {
				this.state.clear();
				this.requestRender();
				this.delegateInput(data, checkedShortcut);
				return;
			}
			if (isCancel) {
				this.state.clear();
				this.requestRender();
				return;
			}
			if (isConfirm) {
				const selected = this.state.selectedKey;
				this.state.clear();
				this.requestRender();
				this.activate(selected);
				return;
			}
			if (isUp) {
				const selectedIndex = keys.indexOf(this.state.selectedKey);
				if (selectedIndex <= 0) this.state.clear();
				else this.state.move(keys, -1);
				this.requestRender();
				return;
			}
			if (isDown) {
				this.state.move(keys, 1);
				this.requestRender();
				return;
			}
			this.state.clear();
			this.requestRender();
			this.base.handleInput(data);
			return;
		}

		const isEditorDown = this.keybindings.matches(
			data,
			"tui.editor.cursorDown",
		);
		if (
			this.boundaryNavigationEnabled &&
			isEditorDown &&
			(this.base.getText().length === 0 || this.cursorAtFooterBoundary)
		) {
			const checkedShortcut = Boolean(this.base.onExtensionShortcut);
			if (this.base.onExtensionShortcut?.(data)) return;
			if (this.matchesDelegatedAppAction(data, true)) {
				this.delegateInput(data, checkedShortcut);
				return;
			}
			this.state.move(keys, 1);
			this.requestRender();
			return;
		}
		this.base.handleInput(data);
	}

	private isCursorAtFooterBoundary(lines: readonly string[]): boolean {
		if (!this.boundaryNavigationEnabled || this.base.isShowingAutocomplete?.())
			return false;
		const cursorLine = lines.findIndex((line) => line.includes(CURSOR_MARKER));
		if (cursorLine < 0 || cursorLine !== lines.length - 2) return false;
		return !lines.at(-1)?.includes("↓");
	}

	private delegateInput(data: string, shortcutAlreadyChecked: boolean): void {
		if (!shortcutAlreadyChecked || !this.base.onExtensionShortcut) {
			this.base.handleInput(data);
			return;
		}
		const shortcut = this.base.onExtensionShortcut;
		this.base.onExtensionShortcut = undefined;
		try {
			this.base.handleInput(data);
		} finally {
			this.base.onExtensionShortcut = shortcut;
		}
	}

	private matchesDelegatedAppAction(
		data: string,
		includeInterrupt: boolean,
	): boolean {
		for (const action of this.base.actionHandlers?.keys() ?? []) {
			if (action === "app.interrupt" && !includeInterrupt) continue;
			if (
				this.keybindings.matches(
					data,
					action as Parameters<KeybindingsManager["matches"]>[1],
				)
			)
				return true;
		}
		if (this.base.onCtrlD && this.keybindings.matches(data, "app.exit"))
			return true;
		if (
			this.base.onPasteImage &&
			this.keybindings.matches(data, "app.clipboard.pasteImage")
		)
			return true;
		return Boolean(
			includeInterrupt &&
				this.base.onEscape &&
				this.keybindings.matches(data, "app.interrupt"),
		);
	}

	private hideDraftCursor(line: string): string {
		const markerIndex = line.indexOf(CURSOR_MARKER);
		if (markerIndex < 0) return line;
		const inverseStart = "\u001b[7m";
		const inverseEnd = "\u001b[0m";
		const cursorStart = line.indexOf(
			inverseStart,
			markerIndex + CURSOR_MARKER.length,
		);
		if (cursorStart < 0)
			return `${line.slice(0, markerIndex)}${line.slice(markerIndex + CURSOR_MARKER.length)}`;
		const cursorEnd = line.indexOf(
			inverseEnd,
			cursorStart + inverseStart.length,
		);
		if (cursorEnd < 0) return line.slice(0, markerIndex);
		const cursorText = line.slice(cursorStart + inverseStart.length, cursorEnd);
		return `${line.slice(0, markerIndex)}${cursorText}${line.slice(cursorEnd + inverseEnd.length)}`;
	}

	getText(): string {
		return this.base.getText();
	}
	setText(text: string): void {
		if (this.state.selectedKey) {
			this.state.clear();
			this.requestRender();
		}
		this.base.setText(text);
	}
	getExpandedText(): string {
		return this.base.getExpandedText?.() ?? this.base.getText();
	}
	addToHistory(text: string): void {
		this.base.addToHistory?.(text);
	}
	insertTextAtCursor(text: string): void {
		if (this.state.selectedKey) {
			this.state.clear();
			this.requestRender();
		}
		this.base.insertTextAtCursor?.(text);
	}
	setAutocompleteProvider(provider: AutocompleteProvider): void {
		this.base.setAutocompleteProvider?.(provider);
	}
	setPaddingX(padding: number): void {
		this.base.setPaddingX?.(padding);
	}
	setAutocompleteMaxVisible(maxVisible: number): void {
		this.base.setAutocompleteMaxVisible?.(maxVisible);
	}
	dispose(): void {
		this.state.clear();
		this.base.dispose?.();
	}
}

export function createFooterNavigationEditorFactory(
	previous: FooterEditorFactory | undefined,
	state: FooterNavigationState,
	options: {
		getStatusKeys: () => string[];
		activate: (key: string) => void;
		boundaryNavigationEnabled?: boolean;
	},
): FooterEditorFactory {
	return (tui, theme, keybindings) => {
		const base =
			previous?.(tui, theme, keybindings) ??
			new CustomEditor(tui, theme, keybindings, {
				embedWorkingStatus: true,
			});
		return new FooterNavigationEditor(
			base,
			keybindings,
			state,
			options.getStatusKeys,
			options.activate,
			() => tui.requestRender(),
			options.boundaryNavigationEnabled ?? previous === undefined,
		);
	};
}
