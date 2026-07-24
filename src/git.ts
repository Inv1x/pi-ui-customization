import { execFile } from "node:child_process";
import type { GitInfo } from "./view.ts";
import { EMPTY_GIT_INFO, sanitizeTerminalLabel } from "./view.ts";

const GIT_TIMEOUT_MS = 2_500;

export interface CommandResult {
	code: number;
	stdout: string;
}

export type GitRunner = (
	cwd: string,
	args: readonly string[],
) => Promise<CommandResult>;

export function runGit(
	cwd: string,
	args: readonly string[],
): Promise<CommandResult> {
	return new Promise((resolve) => {
		execFile(
			"git",
			[...args],
			{
				cwd,
				encoding: "utf8",
				timeout: GIT_TIMEOUT_MS,
				maxBuffer: 1024 * 1024,
			},
			(error, stdout) => {
				resolve({
					code:
						typeof error?.code === "number"
							? error.code
							: error === null
								? 0
								: 1,
					stdout,
				});
			},
		);
	});
}

export function countChangedFiles(status: string): number {
	return status.split("\n").filter(Boolean).length;
}

export async function loadGitInfo(
	cwd: string,
	runner: GitRunner = runGit,
): Promise<GitInfo> {
	const [branchResult, headResult, statusResult] = await Promise.all([
		runner(cwd, ["branch", "--show-current"]),
		runner(cwd, ["rev-parse", "--short", "HEAD"]),
		runner(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
	]);
	if (branchResult.code !== 0 && headResult.code !== 0) {
		return { ...EMPTY_GIT_INFO };
	}

	const branchName = sanitizeTerminalLabel(branchResult.stdout.trim());
	const shortHead = sanitizeTerminalLabel(headResult.stdout.trim());
	const branch =
		branchName || (shortHead ? `detached@${shortHead}` : "detached");
	return {
		branch,
		changedFiles:
			statusResult.code === 0 ? countChangedFiles(statusResult.stdout) : 0,
	};
}
