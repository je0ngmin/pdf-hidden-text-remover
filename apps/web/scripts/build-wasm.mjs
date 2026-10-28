import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] === "release" ? "release" : "dev";
const executableName = process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack";
const pathCandidates = (process.env.PATH ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map((directory) => join(directory, executableName));

const cargoHome = process.env.CARGO_HOME || join(homedir(), ".cargo");
const candidates = [
  ...pathCandidates,
  join(cargoHome, "bin", executableName),
];

const wasmPack = candidates.find(existsSync);

if (!wasmPack) {
  console.error("wasm-pack을 찾을 수 없습니다.");
  console.error("다음 명령으로 설치한 뒤 다시 실행하세요: cargo install wasm-pack --locked");
  process.exit(1);
}

const args = [
  "build",
  "../../crates/pdf-hidden-text-remover-wasm",
  "--target",
  "web",
  "--out-dir",
  "../../apps/web/src/generated/wasm",
  mode === "release" ? "--release" : "--dev",
];

const childPath = [join(cargoHome, "bin"), process.env.PATH ?? ""].join(delimiter);
let cargoAvailable = childPath
  .split(delimiter)
  .filter(Boolean)
  .some((directory) => existsSync(join(directory, process.platform === "win32" ? "cargo.exe" : "cargo")));

let resolvedPath = childPath;
if (!cargoAvailable) {
  const rustupCandidates = [
    ...pathCandidates.map((candidate) => candidate.replace(executableName, process.platform === "win32" ? "rustup.exe" : "rustup")),
    "/opt/homebrew/bin/rustup",
    "/usr/local/bin/rustup",
  ];
  const rustup = rustupCandidates.find(existsSync);
  if (rustup) {
    const located = spawnSync(rustup, ["which", "cargo"], { encoding: "utf8" });
    const cargoPath = located.status === 0 ? located.stdout.trim() : "";
    if (cargoPath && existsSync(cargoPath)) {
      resolvedPath = [dirname(cargoPath), childPath].join(delimiter);
      cargoAvailable = true;
    }
  }
}

if (!cargoAvailable) {
  console.error("cargo를 찾을 수 없습니다. Rust stable 툴체인을 먼저 설치하세요: https://rustup.rs");
  process.exit(1);
}

const result = spawnSync(wasmPack, args, {
  cwd: process.cwd(),
  env: { ...process.env, PATH: resolvedPath },
  stdio: "inherit",
});

if (result.error) {
  console.error(`wasm-pack 실행에 실패했습니다: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
