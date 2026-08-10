import { execFile } from "node:child_process";

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

/**
 * Refresh only the data Pi's reactive footer provider does not expose.
 * Branch state comes from footerData.getGitBranch()/onBranchChange().
 */
export async function loadChangedFileCount(
	cwd: string,
	runner: GitRunner = runGit,
): Promise<number> {
	const result = await runner(cwd, [
		"status",
		"--porcelain=v1",
		"--untracked-files=all",
	]);
	return result.code === 0 ? countChangedFiles(result.stdout) : 0;
}
