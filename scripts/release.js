import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const args = process.argv.slice(2);
const usage = `Usage: node scripts/release.js <patch|minor|major|<semver>> [--dry-run]

Examples:
  node scripts/release.js patch     # 0.2.1 -> 0.2.2
  node scripts/release.js minor     # 0.2.1 -> 0.3.0
  node scripts/release.js major     # 0.2.1 -> 1.0.0
  node scripts/release.js 0.3.0     # explicit version
`;

if (!args.length || args[0] === "--help") {
  console.log(usage);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const bump = args.find((a) => !a.startsWith("--"));

const pkgPath = new URL("../package.json", import.meta.url);
const tauriPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);

const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const tauri = JSON.parse(readFileSync(tauriPath, "utf-8"));

const current = pkg.version;
if (tauri.version !== current) {
  console.error(`[ERROR] Version mismatch: package.json (${current}) != tauri.conf.json (${tauri.version})`);
  console.error("       Fix them first, then run this script.");
  process.exit(1);
}

let next;
if (/^\d+\.\d+\.\d+$/.test(bump)) {
  next = bump;
} else {
  const [major, minor, patch] = current.split(".").map(Number);
  if (bump === "major") next = `${major + 1}.0.0`;
  else if (bump === "minor") next = `${major}.${minor + 1}.0`;
  else if (bump === "patch") next = `${major}.${minor}.${patch + 1}`;
  else {
    console.error(`[ERROR] Unknown bump type: "${bump}". Use patch, minor, major, or a semver like "0.3.0".`);
    process.exit(1);
  }
}

console.log(`  ${current}  →  ${next}`);
if (dryRun) {
  console.log("[DRY RUN] No changes written.");
  process.exit(0);
}

pkg.version = next;
tauri.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

execSync("git add package.json src-tauri/tauri.conf.json", { stdio: "inherit" });
execSync(`git commit -m "chore: bump to v${next}"`, { stdio: "inherit" });
execSync(`git tag v${next}`, { stdio: "inherit" });
execSync("git push origin master", { stdio: "inherit" });
execSync("git push origin v" + next, { stdio: "inherit" });
execSync("git push github master", { stdio: "inherit" });
execSync("git push github v" + next, { stdio: "inherit" });

console.log(`\n✔ v${next} released and pushed to GitHub + Gitee.`);
