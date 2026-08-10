import { homedir } from "node:os";
import { relative } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type Rgb = [number, number, number];
export type DashboardTheme = ExtensionContext["ui"]["theme"];

export interface ModelInfo {
	provider: string;
	modelId: string;
	thinking: string;
	contextWindow: number;
	contextPercent: number | null;
	cost: number;
	tokensPerSecond: number | null;
}

export interface GitInfo {
	branch?: string;
	changedFiles: number;
}

export const EMPTY_MODEL_INFO: ModelInfo = {
	provider: "",
	modelId: "no-model",
	thinking: "off",
	contextWindow: 0,
	contextPercent: null,
	cost: 0,
	tokensPerSecond: null,
};

export const EMPTY_GIT_INFO: GitInfo = { changedFiles: 0 };

const RESET = "\u001b[0m";
const COLOR_RESET = "\u001b[39;49m";
const BOLD = "\u001b[1m";
const PALETTE: Rgb[] = [
	[22, 83, 189],
	[48, 129, 247],
	[93, 171, 255],
	[151, 205, 255],
	[93, 171, 255],
	[48, 129, 247],
];

export const TITLE_LINES = [
	"  ██████╗  ██╗ ",
	"  ██╔══██╗ ██║ ",
	"  ██████╔╝ ██║ ",
	"  ██╔═══╝  ██║ ",
	"  ██║      ██║ ",
	"  ╚═╝      ╚═╝ ",
];

// Terminal labels are untrusted when a path or branch is controlled by another process.
const OSC_PATTERN =
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strips OSC escape sequences
	/(?:\u001b\]|\u009d)(?:[^\u0007\u001b\u009c]|\u001b(?!\\))*(?:\u0007|\u001b\\|\u009c)/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: discard an unterminated OSC and its payload
const UNTERMINATED_OSC_PATTERN = /(?:\u001b\]|\u009d)[\s\S]*$/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strips CSI escape sequences
const CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*[@-~]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: discard an unterminated CSI
const UNTERMINATED_CSI_PATTERN = /(?:\u001b\[|\u009b)[0-?]*[ -/]*$/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strips remaining escape sequences
const ESCAPE_PATTERN = /\u001b(?:[()][0-2A-Z]|[ -/]*[@-~])/g;
const FORMAT_PATTERN = /\p{Cf}/gu;

export function sanitizeTerminalLabel(text: string): string {
	return text
		.replace(OSC_PATTERN, "")
		.replace(UNTERMINATED_OSC_PATTERN, "")
		.replace(CSI_PATTERN, "")
		.replace(UNTERMINATED_CSI_PATTERN, "")
		.replace(ESCAPE_PATTERN, "")
		.replace(FORMAT_PATTERN, "")
		.replace(
			// biome-ignore lint/suspicious/noControlCharactersInRegex: terminal labels must not contain control characters
			/[\u0000-\u001f\u007f-\u009f]/g,
			"",
		);
}

function isColorCode(code: number): boolean {
	return (
		(code >= 30 && code <= 37) ||
		code === 39 ||
		(code >= 40 && code <= 47) ||
		code === 49 ||
		(code >= 90 && code <= 97) ||
		(code >= 100 && code <= 107)
	);
}

function retainedColorSgr(sequence: string): string {
	if (!sequence.endsWith("m")) return "";
	const introducerLength = sequence.startsWith("\u001b[")
		? 2
		: sequence.startsWith("\u009b")
			? 1
			: 0;
	if (!introducerLength) return "";
	const body = sequence.slice(introducerLength, -1);
	if (body.includes(":")) return "";
	const rawCodes = body ? body.split(";") : ["0"];
	if (rawCodes.some((code) => code !== "" && !/^\d+$/.test(code))) return "";
	const codes = rawCodes.map((code) => (code === "" ? 0 : Number(code)));
	const retained: string[] = [];
	for (let index = 0; index < codes.length; index++) {
		const code = codes[index];
		if (code === 0) {
			// Preserve the enclosing inverse selection while resetting supplied colors.
			retained.push("39;49");
			continue;
		}
		if (code !== undefined && isColorCode(code)) {
			retained.push(String(code));
			continue;
		}
		if (code !== 38 && code !== 48) continue;
		const mode = codes[index + 1];
		if (mode === 5) {
			const color = codes[index + 2];
			if (color !== undefined && color >= 0 && color <= 255) {
				retained.push(`${code};5;${color}`);
				index += 2;
			}
			continue;
		}
		if (mode === 2) {
			const red = codes[index + 2];
			const green = codes[index + 3];
			const blue = codes[index + 4];
			if (
				red !== undefined &&
				green !== undefined &&
				blue !== undefined &&
				[red, green, blue].every((value) => value >= 0 && value <= 255)
			) {
				retained.push(`${code};2;${red};${green};${blue}`);
				index += 4;
			}
		}
	}
	return retained.length ? `\u001b[${retained.join(";")}m` : "";
}

/** Keep only SGR foreground/background colors and strip other terminal controls. */
export function sanitizeTerminalColors(text: string): string {
	const withoutOsc = text.replace(OSC_PATTERN, "");
	let result = "";
	let retainedColor = false;
	let offset = 0;
	for (const match of withoutOsc.matchAll(CSI_PATTERN)) {
		const index = match.index;
		result += sanitizeTerminalLabel(withoutOsc.slice(offset, index));
		const color = retainedColorSgr(match[0]);
		if (color) retainedColor = true;
		result += color;
		offset = index + match[0].length;
	}
	result += sanitizeTerminalLabel(withoutOsc.slice(offset));
	if (retainedColor && !result.endsWith(COLOR_RESET)) result += COLOR_RESET;
	return result;
}

function mix(start: number, end: number, amount: number): number {
	return Math.round(start + (end - start) * amount);
}

export function sampleGradient(position: number): Rgb {
	const wrapped = ((position % 1) + 1) % 1;
	const scaled = wrapped * PALETTE.length;
	const index = Math.floor(scaled);
	const nextIndex = (index + 1) % PALETTE.length;
	const amount = scaled - index;
	const start = PALETTE[index] as Rgb;
	const end = PALETTE[nextIndex] as Rgb;
	return [
		mix(start[0], end[0], amount),
		mix(start[1], end[1], amount),
		mix(start[2], end[2], amount),
	];
}

function foreground([red, green, blue]: Rgb, text: string): string {
	return `\u001b[38;2;${red};${green};${blue}m${text}${RESET}`;
}

export function gradientText(text: string, phase: number): string {
	const characters = [...text];
	const span = Math.max(characters.length - 1, 1);
	return characters
		.map((character, index) =>
			character === " "
				? character
				: foreground(sampleGradient(index / span + phase), character),
		)
		.join("");
}

export function formatTokens(tokens: number): string {
	if (tokens < 1_000) return String(tokens);
	if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}k`;
	return `${(tokens / 1_000_000).toFixed(1)}m`;
}

export function formatDirectory(cwd: string, home = homedir()): string {
	if (cwd === home) return "~";
	const display = cwd.startsWith(`${home}/`) ? `~/${relative(home, cwd)}` : cwd;
	return sanitizeTerminalLabel(display);
}

export function center(text: string, width: number): string {
	const padding = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
	return truncateToWidth(`${" ".repeat(padding)}${text}`, width, "");
}

export function columns(left: string, right: string, width: number): string {
	if (!right) return truncateToWidth(left, width, "");
	const naturalGap = width - visibleWidth(left) - visibleWidth(right);
	if (naturalGap >= 1) return `${left}${" ".repeat(naturalGap)}${right}`;

	const leftWidth = Math.max(1, Math.floor(width * 0.45));
	const rightWidth = Math.max(1, width - leftWidth - 1);
	const fittedLeft = truncateToWidth(left, leftWidth, "");
	const fittedRight = truncateToWidth(right, rightWidth, "");
	const gap = Math.max(
		1,
		width - visibleWidth(fittedLeft) - visibleWidth(fittedRight),
	);
	return truncateToWidth(
		`${fittedLeft}${" ".repeat(gap)}${fittedRight}`,
		width,
		"",
	);
}

export function renderHeader(directory: string, width: number): string[] {
	const art = TITLE_LINES.map((line, row) =>
		center(gradientText(line, row * 0.045), width),
	);
	return [
		"",
		...art,
		center(`${BOLD}${gradientText(directory, 0.18)}${RESET}`, width),
		"",
	];
}

export function renderFooter(options: {
	width: number;
	directory: string;
	model: ModelInfo;
	git: GitInfo;
	statuses: ReadonlyMap<string, string>;
	selectedStatusKey?: string;
	preserveSelectedStatusColorKeys?: ReadonlySet<string>;
	theme: DashboardTheme;
}): string[] {
	const {
		width,
		directory,
		model,
		git,
		statuses,
		selectedStatusKey,
		preserveSelectedStatusColorKeys,
		theme,
	} = options;
	const contextPercent =
		model.contextPercent === null
			? "?"
			: String(Math.round(model.contextPercent));
	const contextWindow =
		model.contextWindow > 0 ? formatTokens(model.contextWindow) : "?";
	const speed =
		model.tokensPerSecond === null
			? "— tok/s"
			: `${Math.round(model.tokensPerSecond)} tok/s`;
	const usage = `${contextPercent}%/${contextWindow} · $${model.cost.toFixed(2)} · ${speed}`;
	const provider = sanitizeTerminalLabel(model.provider);
	const modelId = sanitizeTerminalLabel(model.modelId);
	const thinking = sanitizeTerminalLabel(model.thinking);
	const modelLabel = provider
		? `${provider}/${modelId} · ${thinking}`
		: modelId;
	const fileLabel = git.changedFiles === 1 ? "file" : "files";
	const gitLabel = git.branch
		? `${git.branch} · ${git.changedFiles} ${fileLabel} changed`
		: "";
	const lines = [
		columns(theme.fg("text", directory), theme.fg("muted", modelLabel), width),
		columns(theme.fg("muted", usage), theme.fg("muted", gitLabel), width),
	];

	for (const [key, status] of [...statuses].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		for (const line of status.split("\n")) {
			const selected = key === selectedStatusKey;
			const preserveSelectedColors =
				selected && preserveSelectedStatusColorKeys?.has(key);
			const sanitizeSelected = preserveSelectedColors
				? sanitizeTerminalColors
				: sanitizeTerminalLabel;
			const visibleLine = selected ? sanitizeSelected(line) : line;
			const rendered = truncateToWidth(
				visibleLine,
				width,
				theme.fg("dim", "..."),
			);
			const truncated = selected ? sanitizeSelected(rendered) : rendered;
			lines.push(selected ? theme.inverse(truncated) : truncated);
		}
	}
	return lines;
}
