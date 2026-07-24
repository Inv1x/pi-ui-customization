import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
} from "@earendil-works/pi-coding-agent";
import {
	actionableStatusKeys,
	createFooterNavigationEditorFactory,
	type FooterEditorFactory,
	FooterNavigationState,
	STATUS_ACTIVATION_EVENT,
} from "./footer-navigation.ts";
import { loadGitInfo } from "./git.ts";
import {
	EMPTY_GIT_INFO,
	EMPTY_MODEL_INFO,
	formatDirectory,
	type GitInfo,
	type ModelInfo,
	renderFooter,
	renderHeader,
} from "./view.ts";

const GIT_REFRESH_MS = 3_000;
const CHARS_PER_ESTIMATED_TOKEN = 4;
const LIVE_UPDATE_INTERVAL_MS = 200;

interface RenderableNode {
	children?: RenderableNode[];
	invalidate(): void;
	render(width: number): string[];
}

interface DashboardTui extends RenderableNode {
	requestRender(force?: boolean): void;
}

// Strip styling before matching startup resource section labels.
const ANSI_PATTERN =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape matcher
	/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

function renderedText(component: RenderableNode): string {
	try {
		return component.render(200).join("\n").replace(ANSI_PATTERN, "");
	} catch {
		return "";
	}
}

function hideThemesSection(component: RenderableNode): boolean {
	if (!Array.isArray(component.children)) return false;
	for (let index = 0; index < component.children.length; index++) {
		const child = component.children[index];
		if (!child) continue;
		const firstLine = renderedText(child)
			.split("\n")
			.find((line) => line.trim())
			?.trim();
		if (firstLine === "[Themes]") {
			const next = component.children[index + 1];
			const removeCount = next && renderedText(next).trim() === "" ? 2 : 1;
			component.children.splice(index, removeCount);
			component.invalidate();
			return true;
		}
		if (hideThemesSection(child)) return true;
	}
	return false;
}

function sessionCost(ctx: ExtensionContext): number {
	let total = 0;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "message" && entry.message.role === "assistant") {
			total += entry.message.usage.cost.total;
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
	let activeTui: DashboardTui | undefined;
	let footerDataProvider: ReadonlyFooterDataProvider | undefined;
	let previousEditorFactory: FooterEditorFactory | undefined;
	let installedEditorFactory: FooterEditorFactory | undefined;
	const footerNavigation = new FooterNavigationState();
	let gitTimer: ReturnType<typeof setInterval> | undefined;
	let themeRemovalTimers: Array<ReturnType<typeof setTimeout>> = [];
	let generation = 0;
	let refreshingGit = false;
	let pendingGitRefresh = false;

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
			thinking: model?.reasoning ? pi.getThinkingLevel() : "off",
			contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
			contextPercent: usage?.percent ?? null,
			cost: sessionCost(ctx),
		};
		requestRender?.();
	}

	async function refreshGit(ctx = currentContext): Promise<void> {
		if (ctx?.mode !== "tui") return;
		currentContext = ctx;
		if (refreshingGit) {
			pendingGitRefresh = true;
			return;
		}
		refreshingGit = true;
		const refreshGeneration = generation;
		try {
			const nextGitInfo = await loadGitInfo(ctx.cwd);
			if (refreshGeneration === generation && currentContext?.cwd === ctx.cwd) {
				gitInfo = nextGitInfo;
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
				void refreshGit();
			}
		}
	}

	function scheduleThemeRemoval(tui: DashboardTui): void {
		for (const timer of themeRemovalTimers) clearTimeout(timer);
		themeRemovalTimers = [];
		for (const delay of [0, 50, 250, 1_000]) {
			const timer = setTimeout(() => {
				if (hideThemesSection(tui)) tui.requestRender(true);
			}, delay);
			timer.unref?.();
			themeRemovalTimers.push(timer);
		}
	}

	function install(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		const directory = formatDirectory(ctx.cwd);
		ctx.ui.setHeader((tui) => {
			activeTui = tui as DashboardTui;
			requestRender = () => tui.requestRender();
			scheduleThemeRemoval(activeTui);
			return {
				render: (width: number) => renderHeader(directory, width),
				invalidate() {},
			};
		});
		ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
			footerDataProvider = footerData;
			requestRender = () => tui.requestRender();
			return {
				render: (width: number) => {
					const statuses = footerData.getExtensionStatuses();
					footerNavigation.reconcile(actionableStatusKeys(statuses));
					return renderFooter({
						width,
						directory,
						model: modelInfo,
						git: gitInfo,
						statuses,
						selectedStatusKey: footerNavigation.selectedKey,
						theme,
					});
				},
				invalidate() {},
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
		ctx.ui.setTitle(`pi · ${directory}`);
	}

	pi.on("session_start", (_event, ctx) => {
		generation += 1;
		if (gitTimer) clearInterval(gitTimer);
		currentContext = ctx;
		modelInfo = { ...EMPTY_MODEL_INFO };
		gitInfo = { ...EMPTY_GIT_INFO };
		runContentTokens = 0;
		runContentStreamMs = 0;
		resetMessageTracking();
		install(ctx);
		refreshModel(ctx);
		void refreshGit(ctx);
		if (ctx.mode === "tui") {
			gitTimer = setInterval(() => void refreshGit(), GIT_REFRESH_MS);
			gitTimer.unref?.();
		}
	});

	pi.on("resources_discover", () => {
		if (activeTui) scheduleThemeRemoval(activeTui);
	});
	pi.on("model_select", (_event, ctx) => refreshModel(ctx));
	pi.on("thinking_level_select", (_event, ctx) => refreshModel(ctx));
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
		void refreshGit(ctx);
	});
	pi.on("agent_settled", (_event, ctx) => refreshModel(ctx));
	pi.on("input", (_event, ctx) => {
		void refreshGit(ctx);
		return { action: "continue" };
	});
	pi.on("tool_execution_end", (_event, ctx) => void refreshGit(ctx));

	pi.on("session_shutdown", (_event, ctx) => {
		generation += 1;
		if (gitTimer) clearInterval(gitTimer);
		gitTimer = undefined;
		for (const timer of themeRemovalTimers) clearTimeout(timer);
		themeRemovalTimers = [];
		pendingGitRefresh = false;
		currentContext = undefined;
		activeTui = undefined;
		footerDataProvider = undefined;
		requestRender = undefined;
		footerNavigation.clear();
		if (ctx.mode === "tui") {
			ctx.ui.setHeader(undefined);
			ctx.ui.setFooter(undefined);
			if (ctx.ui.getEditorComponent() === installedEditorFactory)
				ctx.ui.setEditorComponent(previousEditorFactory);
		}
		previousEditorFactory = undefined;
		installedEditorFactory = undefined;
	});
}
