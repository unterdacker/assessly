import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();

function parseDotEnv(content) {
  return content.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      return accumulator;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    accumulator[key] = rawValue.replace(/^['\"]|['\"]$/g, "");
    return accumulator;
  }, {});
}

async function loadEnvFile() {
  const envPath = path.join(projectRoot, ".env");

  try {
    const content = await fs.readFile(envPath, "utf8");
    return {
      exists: true,
      values: parseDotEnv(content),
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        exists: false,
        values: {},
      };
    }

    throw error;
  }
}

async function verifyWritableDirectory(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  await fs.mkdir(absolutePath, { recursive: true });

  const probeFile = path.join(absolutePath, `.ready-check-${process.pid}.tmp`);
  await fs.writeFile(probeFile, "ok", "utf8");
  await fs.rm(probeFile, { force: true });
}

async function verifyTcpConnection(host, port) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 4000 });

    socket.once("connect", () => {
      socket.end();
      resolve(undefined);
    });

    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out while connecting to ${host}:${port}.`));
    });

    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

async function verifyDatabase(databaseUrl) {
  const parsed = new URL(databaseUrl);

  if (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") {
    await verifyTcpConnection(parsed.hostname, Number(parsed.port || 5432));
    return;
  }

  if (parsed.protocol === "file:") {
    const normalizedPathname =
      process.platform === "win32"
        ? parsed.pathname.replace(/^\/(\w:)/, "$1")
        : parsed.pathname;
    const databaseFilePath = path.resolve(projectRoot, normalizedPathname);
    await fs.mkdir(path.dirname(databaseFilePath), { recursive: true });
    return;
  }

  throw new Error(`Unsupported DATABASE_URL protocol: ${parsed.protocol}`);
}

async function main() {
  const envFile = await loadEnvFile();
  const env = {
    ...envFile.values,
    ...process.env,
  };

  if (!envFile.exists && !env.DATABASE_URL) {
    throw new Error("Missing .env file and DATABASE_URL environment variable.");
  }

  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (env.NEXT_PUBLIC_APP_URL) {
    new URL(env.NEXT_PUBLIC_APP_URL);
  }

  await verifyDatabase(env.DATABASE_URL);
  await verifyWritableDirectory(".next");
  await verifyWritableDirectory("prisma");

  console.log(`[ready-check] .env ${envFile.exists ? "found" : "provided via environment"}.`);
  console.log("[ready-check] Database endpoint is reachable.");
  console.log("[ready-check] Build folders are writable.");
}

main().catch((error) => {
  console.error("[ready-check] Failed.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});