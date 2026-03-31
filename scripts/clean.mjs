import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { rimraf } from "rimraf";

const mode = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--mode="))
  ?.split("=")[1] ?? "all";

const projectRoot = process.cwd();
const devPort = 3000;

const cleanTargets = {
  dev: [".next", ".turbo"],
  build: [
    ".next",
    ".turbo",
    "node_modules/.cache",
    "node_modules/.prisma/client/query_engine-windows.dll.node.tmp*",
  ],
  all: [
    ".next",
    ".turbo",
    "node_modules/.cache",
    "node_modules/.prisma/client/query_engine-windows.dll.node.tmp*",
  ],
};

function unique(values) {
  return [...new Set(values)];
}

function findPortPidsOnWindows(port) {
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return [];
  }

  return unique(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter((parts) => parts.length >= 5)
      .filter((parts) => {
        const localAddress = parts[1];
        const state = parts[3];
        return localAddress.endsWith(`:${port}`) && state === "LISTENING";
      })
      .map((parts) => parts[4])
      .filter(Boolean),
  );
}

function findPortPidsOnPosix(port) {
  const lsofResult = spawnSync("lsof", ["-ti", `tcp:${port}`], {
    encoding: "utf8",
  });

  if (lsofResult.status === 0 || lsofResult.stdout) {
    return unique(
      lsofResult.stdout
        .split(/\r?\n/)
        .map((pid) => pid.trim())
        .filter(Boolean),
    );
  }

  const ssResult = spawnSync("ss", ["-ltnp"], {
    encoding: "utf8",
  });

  if (ssResult.status !== 0 || !ssResult.stdout) {
    return [];
  }

  return unique(
    ssResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.includes(`:${port}`) && line.includes("pid="))
      .map((line) => line.match(/pid=(\d+)/)?.[1] ?? "")
      .filter(Boolean),
  );
}

function killPid(pid) {
  if (process.platform === "win32") {
    return spawnSync("taskkill", ["/PID", pid, "/F"], { encoding: "utf8" });
  }

  return spawnSync("kill", ["-9", pid], { encoding: "utf8" });
}

function killPort(port) {
  const pids =
    process.platform === "win32"
      ? findPortPidsOnWindows(port)
      : findPortPidsOnPosix(port);

  if (pids.length === 0) {
    console.log(`[clean] No process is listening on port ${port}.`);
    return;
  }

  for (const pid of pids) {
    const result = killPid(pid);
    if (result.status === 0) {
      console.log(`[clean] Terminated process ${pid} on port ${port}.`);
      continue;
    }

    const stderr = result.stderr?.trim();
    console.warn(`[clean] Failed to terminate process ${pid}: ${stderr || "unknown error"}`);
  }
}

async function removeTargets(targets) {
  for (const target of targets) {
    await rimraf(path.join(projectRoot, target), { glob: true });
    console.log(`[clean] Removed ${target}`);
  }
}

async function main() {
  const targets = cleanTargets[mode] ?? cleanTargets.all;

  killPort(devPort);

  await removeTargets(targets);
  console.log(`[clean] Completed in ${mode} mode.`);
}

main().catch((error) => {
  console.error("[clean] Failed.", error);
  process.exitCode = 1;
});