import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	SessionEntry,
} from "@earendil-works/pi-coding-agent";
import {
	STATUS_ACTIVATION_EVENT,
	STATUS_OPTIONS_EVENT,
	type StatusOptionsEvent,
} from "./contracts.ts";
import {
	actionableStatusKeys,
	createFooterNavigationEditorFactory,
	type FooterEditorFactory,
	FooterNavigationState,
} from "./footer-navigation.ts";
import { loadChangedFileCount } from "./git.ts";
import {
	EMPTY_GIT_INFO,
	EMPTY_MODEL_INFO,
	formatDirectory,
	type GitInfo,
	type ModelInfo,
	renderFooter,
	renderHeader,
	sanitizeTerminalLabel,
} from "./view.ts";

const GIT_REFRESH_MS = 3_000;
const CHARS_PER_ESTIMATED_TOKEN = 4;
const LIVE_UPDATE_INTERVAL_MS = 200;

export type {
	StatusActivationEvent,
	StatusOptionsEvent,
	UiCustomizationEventMap,
} from "./contracts.ts";
export {
	STATUS_ACTIVATION_EVENT,
	STATUS_OPTIONS_EVENT,
} from "./contracts.ts";

export function applyStatusOptions(
	preserveSelectedStatusColorKeys: Set<string>,
	data: unknown,
): boolean {
	const options = data as Partial<StatusOptionsEvent> | undefined;
	if (
		typeof options?.key !== "string" ||
		!options.key ||
		typeof options.preserveSelectedColors !== "boolean"
	)
		return false;
	if (options.preserveSelectedColors)
		preserveSelectedStatusColorKeys.add(options.key);
	else preserveSelectedStatusColorKeys.delete(options.key);
	return true;
}

function usageCost(usage: { cost: { total: number } } | undefined): number {
	const total = usage?.cost.total;
	return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

/** Sum every persisted model usage record on the active session branch. */
export function sessionCost(entries: readonly SessionEntry[]): number {
	let total = 0;
	for (const entry of entries) {
		if (entry.type === "message") {
			if (entry.message.role === "assistant")
				total += usageCost(entry.message.usage);
			else if (entry.message.role === "toolResult")
				total += usageCost(entry.message.usage);
		} else if (
			entry.type === "usage" ||
			entry.type === "compaction" ||
			entry.type === "branch_summary"
		) {
			total += usageCost(entry.usage);
		}
	}
	return total;
}

function estimateContentTokens(characters: number): number {
	return Math.ceil(characters / CHARS_PER_ESTIMATED_TOKEN);
}

export default function uiCustomization(pi: ExtensionAPI): void {
	let currentContext: ExtensionContext | undefined;
	let modelInfo: ModelInfo = { ...EMPTY_MODEL_INFO };
	let gitInfo: GitInfo = { ...EMPTY_GIT_INFO };
	let requestRender: (() => void) | undefined;
	let footerDataProvider: ReadonlyFooterDataProvider | undefined;
	let previousEditorFactory: FooterEditorFactory | undefined;
	let installedEditorFactory: FooterEditorFactory | undefined;
	const footerNavigation = new FooterNavigationState();
	let gitTimer: ReturnType<typeof setInterval> | undefined;
	let generation = 0;
	let refreshingGit = false;
	let pendingGitRefresh = false;
	let waitingPromptDepth = 0;
	let currentDirectory = "";
	const preserveSelectedStatusColorKeys = new Set<string>();
	const subscribeStatusOptions = () =>
		pi.events.on(STATUS_OPTIONS_EVENT, (data) => {
			if (applyStatusOptions(preserveSelectedStatusColorKeys, data))
				requestRender?.();
		});
	let uninstallStatusOptions: (() => void) | undefined =
		subscribeStatusOptions();

	let contentStreamStart: number | null = null;
	let lastContentDeltaAt: number | null = null;
	let contentCharacters = 0;
	let firstContentDeltaCharacters = 0;
	let contentDeltaCount = 0;
	let sawToolCall = false;
	let runContentTokens = 0;
	let runContentStreamMs = 0;
	let lastLiveUpdate = 0;

	function resetMessageTracking(): void {
		contentStreamStart = null;
		lastContentDeltaAt = null;
		contentCharacters = 0;
		firstContentDeltaCharacters = 0;
		contentDeltaCount = 0;
		sawToolCall = false;
		lastLiveUpdate = 0;
	}

	function refreshModel(ctx: ExtensionContext): void {
		currentContext = ctx;
		const model = ctx.model;
		const usage = ctx.getContextUsage();
		modelInfo = {
			...modelInfo,
			provider: model?.provider ?? "",
			modelId: model?.id ?? "no-model",
			thinking: model?.reasoning ? (ctx.thinkingLevel ?? "off") : "off",
			contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
			contextPercent: usage?.percent ?? null,
			cost: sessionCost(ctx.sessionManager.getBranch()),
		};
		requestRender?.();
	}

	async function refreshChangedFiles(ctx = currentContext): Promise<void> {
		if (ctx?.mode !== "tui") return;
		currentContext = ctx;
		if (refreshingGit) {
			pendingGitRefresh = true;
			return;
		}
		refreshingGit = true;
		const refreshGeneration = generation;
		try {
			const changedFiles = await loadChangedFileCount(ctx.cwd);
			if (refreshGeneration === generation && currentContext?.cwd === ctx.cwd) {
				gitInfo = { changedFiles };
				requestRender?.();
			}
		} catch {
			if (refreshGeneration === generation) {
				gitInfo = { ...EMPTY_GIT_INFO };
				requestRender?.();
			}
		} finally {
			refreshingGit = false;
			if (pendingGitRefresh) {
				pendingGitRefresh = false;
				void refreshChangedFiles();
			}
		}
	}

	function updateTitle(ctx = currentContext): void {
		if (ctx?.mode !== "tui") return;
		ctx.ui.setTitle(
			`pi · ${currentDirectory}${waitingPromptDepth > 0 ? " · waiting for user" : ""}`,
		);
	}

	function install(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		const directory = formatDirectory(ctx.cwd);
		currentDirectory = directory;
		ctx.ui.setHeader((tui) => {
			requestRender = () => tui.requestRender();
			return {
				render: (width: number) => renderHeader(directory, width),
				invalidate() {},
			};
		});
		ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
			footerDataProvider = footerData;
			requestRender = () => tui.requestRender();
			const unsubscribeBranch = footerData.onBranchChange(() =>
				tui.requestRender(),
			);
			return {
				render: (width: number) => {
					const statuses = footerData.getExtensionStatuses();
					const branch = sanitizeTerminalLabel(footerData.getGitBranch() ?? "");
					footerNavigation.reconcile(actionableStatusKeys(statuses));
					return renderFooter({
						width,
						directory,
						model: modelInfo,
						git: { ...gitInfo, branch: branch || undefined },
						statuses,
						selectedStatusKey: footerNavigation.selectedKey,
						preserveSelectedStatusColorKeys,
						waitingForUser: waitingPromptDepth > 0,
						theme,
					});
				},
				invalidate() {},
				dispose() {
					unsubscribeBranch();
					if (footerDataProvider === footerData) footerDataProvider = undefined;
				},
			};
		});
		previousEditorFactory = ctx.ui.getEditorComponent();
		installedEditorFactory = createFooterNavigationEditorFactory(
			previousEditorFactory,
			footerNavigation,
			{
				getStatusKeys: () =>
					actionableStatusKeys(
						footerDataProvider?.getExtensionStatuses() ?? new Map(),
					),
				activate: (key) => {
					const sessionId = currentContext?.sessionManager.getSessionId();
					if (!sessionId) return;
					pi.events.emit(STATUS_ACTIVATION_EVENT, { key, sessionId });
				},
			},
		);
		ctx.ui.setEditorComponent(installedEditorFactory);
		updateTitle(ctx);
	}

	pi.on("session_start", (_event, ctx) => {
		generation += 1;
		if (gitTimer) clearInterval(gitTimer);
		currentContext = ctx;
		modelInfo = { ...EMPTY_MODEL_INFO };
		gitInfo = { ...EMPTY_GIT_INFO };
		waitingPromptDepth = 0;
		currentDirectory = "";
		uninstallStatusOptions ??= subscribeStatusOptions();
		runContentTokens = 0;
		runContentStreamMs = 0;
		resetMessageTracking();
		install(ctx);
		refreshModel(ctx);
		void refreshChangedFiles(ctx);
		if (ctx.mode === "tui") {
			gitTimer = setInterval(() => {
				refreshModel(ctx);
				void refreshChangedFiles();
			}, GIT_REFRESH_MS);
			gitTimer.unref?.();
		}
	});

	pi.on("ui_prompt_start", (_event, ctx) => {
		if (
			!currentContext ||
			currentContext.sessionManager.getSessionId() !==
				ctx.sessionManager.getSessionId()
		)
			return;
		waitingPromptDepth += 1;
		updateTitle(ctx);
		requestRender?.();
	});
	pi.on("ui_prompt_end", (_event, ctx) => {
		if (
			!currentContext ||
			currentContext.sessionManager.getSessionId() !==
				ctx.sessionManager.getSessionId()
		)
			return;
		waitingPromptDepth = Math.max(0, waitingPromptDepth - 1);
		updateTitle(ctx);
		requestRender?.();
	});

	pi.on("model_select", (_event, ctx) => refreshModel(ctx));
	pi.on("thinking_level_select", (_event, ctx) => refreshModel(ctx));
	pi.on("session_tree", (_event, ctx) => refreshModel(ctx));
	pi.on("session_compact", (_event, ctx) => refreshModel(ctx));
	pi.on("agent_start", (_event, ctx) => {
		runContentTokens = 0;
		runContentStreamMs = 0;
		modelInfo = { ...modelInfo, tokensPerSecond: null };
		resetMessageTracking();
		refreshModel(ctx);
	});
	pi.on("message_start", (event) => {
		if (event.message.role === "assistant") resetMessageTracking();
	});
	pi.on("message_update", (event) => {
		if (event.message.role !== "assistant") return;
		const streamEvent = event.assistantMessageEvent;
		if (streamEvent.type === "toolcall_delta") {
			sawToolCall = true;
			return;
		}
		if (
			streamEvent.type !== "text_delta" &&
			streamEvent.type !== "thinking_delta"
		) {
			return;
		}
		if (!streamEvent.delta) return;

		const now = Date.now();
		if (contentStreamStart === null) {
			contentStreamStart = now;
			firstContentDeltaCharacters = streamEvent.delta.length;
		}
		lastContentDeltaAt = now;
		contentCharacters += streamEvent.delta.length;
		contentDeltaCount += 1;
		const elapsedMs = now - contentStreamStart;
		const streamedCharacters = contentCharacters - firstContentDeltaCharacters;
		if (
			contentDeltaCount < 2 ||
			elapsedMs <= 0 ||
			streamedCharacters <= 0 ||
			now - lastLiveUpdate < LIVE_UPDATE_INTERVAL_MS
		) {
			return;
		}
		lastLiveUpdate = now;
		modelInfo = {
			...modelInfo,
			tokensPerSecond:
				estimateContentTokens(streamedCharacters) / (elapsedMs / 1_000),
		};
		requestRender?.();
	});
	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return;
		sawToolCall ||= event.message.content.some(
			(block) => block.type === "toolCall",
		);
		if (contentStreamStart !== null && contentCharacters > 0) {
			const streamEnd = lastContentDeltaAt ?? contentStreamStart;
			const streamMs = streamEnd - contentStreamStart;
			const firstDeltaTokens = estimateContentTokens(
				firstContentDeltaCharacters,
			);
			const streamedTokens = !sawToolCall
				? Math.max(0, event.message.usage.output - firstDeltaTokens)
				: Math.max(
						0,
						estimateContentTokens(contentCharacters) - firstDeltaTokens,
					);
			if (contentDeltaCount >= 2 && streamMs >= 50 && streamedTokens > 0) {
				runContentTokens += streamedTokens;
				runContentStreamMs += streamMs;
				modelInfo = {
					...modelInfo,
					tokensPerSecond: runContentTokens / (runContentStreamMs / 1_000),
				};
			}
		}
		resetMessageTracking();
		refreshModel(ctx);
	});
	pi.on("turn_end", (_event, ctx) => {
		refreshModel(ctx);
		void refreshChangedFiles(ctx);
	});
	pi.on("agent_settled", (_event, ctx) => refreshModel(ctx));
	pi.on("input", (_event, ctx) => {
		void refreshChangedFiles(ctx);
		return { action: "continue" };
	});
	pi.on("tool_execution_end", (_event, ctx) => void refreshChangedFiles(ctx));

	pi.on("session_shutdown", (_event, ctx) => {
		generation += 1;
		if (gitTimer) clearInterval(gitTimer);
		gitTimer = undefined;
		pendingGitRefresh = false;
		currentContext = undefined;
		footerDataProvider = undefined;
		requestRender = undefined;
		waitingPromptDepth = 0;
		currentDirectory = "";
		footerNavigation.clear();
		if (ctx.mode === "tui") {
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			if (ctx.ui.getEditorComponent() === installedEditorFactory)
				ctx.ui.setEditorComponent(previousEditorFactory);
			ctx.ui.setTitle("pi");
		}
		previousEditorFactory = undefined;
		installedEditorFactory = undefined;
		uninstallStatusOptions?.();
		uninstallStatusOptions = undefined;
		preserveSelectedStatusColorKeys.clear();
	});
}
