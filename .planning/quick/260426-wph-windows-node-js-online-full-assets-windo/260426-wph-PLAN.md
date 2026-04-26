---
phase: quick
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - .github/workflows/release.yml
autonomous: true
must_haves:
  truths:
    - "Windows online 版本在 Node.js 下载或 MSI 安装失败时返回可诊断的中文错误，而不是空白或不可定位失败信息"
    - "Windows full 版本启动后，install_node_env 会优先从 resource_dir 可达位置发现内置 Node.js MSI 并执行安装"
    - "Release workflow 会把 assets-windows 中的 Node.js MSI 复制到与运行时扫描逻辑一致的 bundle resources 路径"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      contains: "bundled Node.js candidate discovery + detailed online install diagnostics"
    - path: ".github/workflows/release.yml"
      contains: "single-source Windows full MSI copy/bundle path"
  key_links:
    - from: "src-tauri/src/lib.rs"
      to: "resource_dir / resources node MSI"
      via: "shared candidate path scan before online download"
    - from: ".github/workflows/release.yml"
      to: "src-tauri/src/lib.rs"
      via: "copied MSI path matches runtime resource scan contract"
---

# Quick Task 260426-wph Plan

## Goal

修复 Windows 打包应用中的 Node.js 安装链路：online 版本在下载或执行 MSI
安装失败时要返回可诊断错误；full 版本要把
`src-tauri/assets-windows` 下的 Node.js MSI 正确打入安装包，并且运行时能从
`resource_dir` 检测到并优先使用该内置资源。

## Context

- `src-tauri/src/lib.rs` 当前 `install_node_env` 已尝试扫描
  `resource_dir/nodejs`，但 full 包的实际资源布局可能与该单一路径不完全一致，
  导致内置 MSI 已打包却无法发现，随后错误地回退到 online 下载。
- online 分支当前对 `reqwest` 响应状态、下载源 URL、`msiexec` 退出码、
  `stdout/stderr` 的诊断信息不足，Windows 失败时不利于定位是下载源、权限、
  安装器还是资源缺失问题。
- `.github/workflows/release.yml` 已为 Windows full 版本复制 MSI 并通过
  `TAURI_CONFIG` 注入 resources，但复制源、目标路径、打包路径三者需要形成同一
  契约，避免 workflow 与运行时扫描路径漂移。

## Tasks

### Task 1
- files: `src-tauri/src/lib.rs`
- action: 为 Windows Node.js 安装抽取统一的“内置 MSI 候选路径发现”逻辑，供 `install_node_env` 使用。扫描并记录 `resource_dir` 下与 full 打包结果兼容的候选位置（至少覆盖当前 `resource_dir/nodejs/*.msi`，并兼容资源直接落在 `resource_dir` 或保留 `resources/nodejs` 层级的情况），命中内置 MSI 时优先复制到 `tools` 目录后执行安装，不再直接回退 online 下载。错误信息里要带上已扫描的候选目录/文件，便于诊断“包里没有资源”还是“路径不匹配”。不要改动非 Node.js 安装相关命令。
- verify: `cargo check --manifest-path src-tauri/Cargo.toml`
- done: full 包运行时只要 MSI 被打进 resource bundle 的约定位置之一，就会被发现并优先安装；未发现时错误信息明确列出扫描路径。

### Task 2
- files: `src-tauri/src/lib.rs`
- action: 强化 Windows online 安装失败诊断。对下载阶段显式校验 HTTP 状态码，并在失败时返回包含下载 URL、HTTP status、目标文件路径的中文错误；对 `msiexec` 执行失败补充退出码、`stdout`、`stderr`，若是 spawn 失败则保留系统错误。保持现有进度事件，但不要把敏感环境变量或无关噪音塞进错误文案。若 full 包内置 MSI 安装失败，也沿用同一套诊断格式。
- verify: `cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml --lib`
- done: online/full 两条 Windows 安装路径在失败时都返回可执行、可定位的中文错误，至少能区分下载失败、资源缺失、MSI 执行失败三类问题。

### Task 3
- files: `.github/workflows/release.yml`, `src-tauri/src/lib.rs`
- action: 收敛 Windows full 打包契约。把 workflow 中 Node.js MSI 文件名定义为单一来源，构建前先校验 `src-tauri/assets-windows` 中对应 MSI 存在，再复制到运行时扫描逻辑约定的 resources 路径，并让 `TAURI_CONFIG.bundle.resources` 与 Task 1 的扫描路径保持一致。运行时代码不要硬编码具体版本号文件名，只按 `.msi` 扫描；workflow 则负责把正确资产放到正确目录。不要引入额外下载步骤。
- verify: `node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/release.yml','utf8');if(!y.includes('assets-windows')||!y.includes('resources/nodejs'))process.exit(1);" && cargo check --manifest-path src-tauri/Cargo.toml`
- done: Windows full CI 若缺少 MSI 会显式失败；存在 MSI 时会复制并打包到与运行时扫描一致的位置，避免“包内有文件但 app 找不到”。

## Threat model

### Trust boundaries

| Boundary | Description |
|----------|-------------|
| GitHub Actions workspace → Tauri bundle resources | 构建产物把本地 MSI 复制进安装包，路径不一致会导致运行时使用错误来源 |
| Internet download → local installer execution | online 版本会下载 MSI 并交给 `msiexec` 执行，失败诊断必须可区分网络与安装器问题 |

### STRIDE threat register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | T | Windows bundled MSI discovery | mitigate | 只扫描约定资源目录中的 `.msi` 文件，优先使用 bundle 内资源，并在错误中输出已扫描位置，防止因路径漂移误判资源缺失 |
| T-quick-02 | D | Windows online installer flow | mitigate | 对 HTTP 状态和 `msiexec` 退出结果做显式诊断，避免 silent failure 导致安装链路不可恢复 |

## Success criteria

- full 版本的 Node.js MSI 从 `assets-windows` 到 bundle resources 再到 `resource_dir`
  检测链路一致。
- online 版本安装失败时，错误能直接指出失败阶段与诊断线索。
- 改动仅限 Windows Node.js 安装与 full 打包契约，不扩散到无关 UI/业务逻辑。

## Output

After completion, create `.planning/quick/260426-wph-windows-node-js-online-full-assets-windo/260426-wph-SUMMARY.md`
