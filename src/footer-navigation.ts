import {
	CustomEditor,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteProvider,
	EditorComponent,
} from "@earendil-works/pi-tui";

export const STATUS_ACTIVATION_EVENT = "pi-ui-customization:activate-status";

export type FooterEditorFactory = NonNullable<
	ReturnType<ExtensionContext["ui"]["getEditorComponent"]>
>;

const ACTIONABLE_STATUS_KEYS = new Set([
	"background-terminals",
	"pi-subagents",
]);

export interface StatusActivation {
	key: string;
	sessionId: string;
}

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
				: 0;
		const next = (current + direction + keys.length) % keys.length;
		this.selectedKey = keys[next];
		return this.selectedKey;
	}

	clear(): void {
		this.selectedKey = undefined;
	}
}

type ComposableEditor = EditorComponent & {
	focused?: boolean;
	dispose?: () => void;
	actionHandlers?: Map<string, () => void>;
	onEscape?: () => void;
	onCtrlD?: () => void;
	onPasteImage?: () => void;
	onExtensionShortcut?: (data: string) => boolean | undefined;
	isShowingAutocomplete?: () => boolean;
};

class FooterNavigationEditor implements EditorComponent {
	constructor(
		private readonly base: ComposableEditor,
		private readonly keybindings: KeybindingsManager,
		private readonly state: FooterNavigationState,
		private readonly getStatusKeys: () => string[],
		private readonly activate: (key: string) => void,
		private readonly requestRender: () => void,
	) {}

	get focused(): boolean {
		return this.base.focused ?? false;
	}
	set focused(value: boolean) {
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
		return this.base.render(width);
	}

	invalidate(): void {
		this.base.invalidate();
	}

	handleInput(data: string): void {
		const keys = this.getStatusKeys();
		this.state.reconcile(keys);
		if (this.base.isShowingAutocomplete?.()) {
			if (this.state.selectedKey) {
				this.state.clear();
				this.requestRender();
			}
			this.base.handleInput(data);
			return;
		}
		if (this.base.getText().length > 0 || keys.length === 0) {
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
		const willHandle =
			isUp ||
			isDown ||
			(Boolean(this.state.selectedKey) && (isConfirm || isCancel));
		if (willHandle && this.base.onExtensionShortcut?.(data)) return;

		if (this.state.selectedKey) {
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
		}

		if (isUp) {
			this.state.move(keys, -1);
			this.requestRender();
			return;
		}
		if (isDown) {
			this.state.move(keys, 1);
			this.requestRender();
			return;
		}

		if (this.state.selectedKey) {
			this.state.clear();
			this.requestRender();
		}
		this.base.handleInput(data);
	}

	getText(): string {
		return this.base.getText();
	}
	setText(text: string): void {
		this.base.setText(text);
	}
	getExpandedText(): string {
		return this.base.getExpandedText?.() ?? this.base.getText();
	}
	addToHistory(text: string): void {
		this.base.addToHistory?.(text);
	}
	insertTextAtCursor(text: string): void {
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
		this.base.dispose?.();
	}
}

export function createFooterNavigationEditorFactory(
	previous: FooterEditorFactory | undefined,
	state: FooterNavigationState,
	options: {
		getStatusKeys: () => string[];
		activate: (key: string) => void;
	},
): FooterEditorFactory {
	return (tui, theme, keybindings) => {
		const base =
			previous?.(tui, theme, keybindings) ??
			new CustomEditor(tui, theme, keybindings);
		return new FooterNavigationEditor(
			base,
			keybindings,
			state,
			options.getStatusKeys,
			options.activate,
			() => tui.requestRender(),
		);
	};
}
