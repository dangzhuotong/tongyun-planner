# 发版

正式包只来自 GitHub Release。用户在应用里 **设置 → 系统与语言 → 检查更新**，或等启动后的更新提示。维护者不要在 Mac 上用当前开发 tip 重装给用户。

合进 `main` 不会发版。不推 tag，`latest.json` 就不会变，检查更新会停在上一个 Release。

## 怎么发

1. 把要发布的提交合进默认分支。
2. 让下面三处版本号相同，并且等于即将推送的 tag（去掉前缀 `v`）：
   - `package.json` 的 `version`
   - `src-tauri/tauri.conf.json` 的 `version`（更新器比较的就是这个）
   - `src-tauri/Cargo.toml` 的 `version`
3. 在这份提交上推送 tag：

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   例：三个文件都是 `1.1.1` 时，tag 必须是 `v1.1.1`。tag 指向的提交里版本仍是 `1.1.0` 时，发布出去的 `latest.json` 也是 `1.1.0`，已安装 1.1.0 的用户不会看到更新。

4. [`.github/workflows/release.yml`](../.github/workflows/release.yml) 在 tag `v*` 上触发 `tauri-action`：
   - 创建非 draft 的 GitHub Release
   - 用 GitHub Secrets `TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 做 **minisign** 签名（更新器校验包没有被换掉）
   - 上传安装包、`.sig` 和 `latest.json`
   - 更新地址已写在 `tauri.conf.json`：`https://github.com/dangzhuotong/tongyun-planner/releases/latest/download/latest.json`

5. 用户侧：打开 **设置 → 系统与语言**，看清「当前版本」，点 **检查更新**。有新版会下载并重启；已经是最新会提示「已是最新版本」。启动约 3 秒后也会静默检查，有新版同样弹窗。

`workflow_dispatch`（Actions 里手动跑 Release）只构建并上传 artifact，**不**创建 Release，也**不**写入 `latest.json`。冒烟必须推 tag。

`npm run release`（`scripts/release.js`）会改 `package.json` 与 `tauri.conf.json`、提交、打 tag，并立刻 `git push`。它不改 `Cargo.toml`。日常发版用上面的手动对齐再推 tag。

## 签名与 Apple

| | 作用 | 现状 |
| :--- | :--- | :--- |
| minisign（`TAURI_SIGNING_*`） | 更新器确认安装包未被篡改 | 已在 CI。公钥在 `tauri.conf.json`，私钥只在 GitHub Secrets，不要写入仓库 |
| Apple Developer 签名与公证 | 去掉首次打开的「无法验证开发者」 | **未做**。不阻塞检查更新 |

首次从 dmg 安装时，macOS 仍可能提示无法验证。Release 说明和 [README](../README.md) 已写三种办法，其中一条是：

```bash
xattr -dr com.apple.quarantine /Applications/TongyunPlanner.app
```

已经装上、且版本 ≥ v1.1.0 的用户，用检查更新换的是 minisign 签过的 `.app.tar.gz`。v1.0.x 因更新公钥更换，不能应用内升到 v1.1，需要从 [Releases](https://github.com/dangzhuotong/tongyun-planner/releases/latest) 手动装一次。

## 阿装

只在这两件事上介入：

- **Release 工作流失败**（签名 Secret 缺失、某一端构建失败等）：看 Actions 里该 tag 的日志，修好后重跑。正式包仍以修好后的 GitHub Release 为准。
- **用户本机环境坏了**（装不上、隔离解不开）：按 Release 说明协助，仍把用户带回 GitHub Release 或应用内检查更新。

`main` 每次合并之后，不做例行本机打包和重装。
