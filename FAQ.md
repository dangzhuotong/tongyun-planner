# 常见问题解答 (FAQ)

## 安装和运行

### Q: 如何安装 TongYun Planner？
A: 一般用户请到 [Releases 最新版](https://github.com/dangzhuotong/tongyun-planner/releases/latest) 下载 Windows、macOS Universal 或 Linux 安装包。安装包未签名，Windows 可能需要「仍要运行」，macOS 请右键「打开」。

v1.0 用户请手动安装 v1.1：更新公钥已更换，应用内更新无法从 1.0 升到 1.1。

从源码运行：
1. 克隆项目：`git clone https://github.com/dangzhuotong/tongyun-planner.git`
2. 安装依赖：`npm install`
3. 启动开发服务器：`npm run tauri dev`

### Q: 运行时出现错误怎么办？
A: 请检查：
1. Node.js 版本是否为 18.0 或更高
2. npm 版本是否为 9.0 或更高
3. Rust 版本是否为 1.70 或更高
4. 系统依赖是否已安装（特别是 Linux 用户）

### Q: 如何构建生产版本？
A: 运行 `npm run tauri build`，构建完成后会在 `src-tauri/target/release/bundle/` 目录生成安装包。

## 功能使用

### Q: 如何创建任务？
A: 有以下几种方式：
1. 点击侧边栏的"+"按钮
2. 使用快捷键（可自定义）
3. 在小组件窗口中创建
4. 使用 AI 智能分类创建

### Q: 如何设置 AI 智能分类？
A: 在设置页面中：
1. 选择 AI 服务提供商（OpenAI 或 Anthropic）
2. 输入 API 密钥
3. 可选：自定义 API 端点和模型
4. 启用"自动分类"选项

### Q: 如何同步数据？
A: 在设置页面中配置 WebDAV：
1. 输入 WebDAV 服务器地址
2. 输入用户名和密码
3. 测试连接
4. 启用自动同步

### Q: 如何自定义主题？
A: 在设置页面中：
1. 选择主题颜色（蜜桃粉、抹茶绿等）
2. 选择卡片背景样式
3. 选择图钉样式
4. 选择字体
5. 选择界面风格

### Q: 如何使用番茄钟？
A: 在番茄钟视图中：
1. 点击开始按钮开始计时
2. 默认 25 分钟工作时间
3. 工作结束后休息 5 分钟
4. 每 4 个番茄钟后长休息 15 分钟

## 数据和存储

### Q: 数据存储在哪里？
A: 数据存储在本地：
- Windows：`%APPDATA%\com.tongyunplanner.app\`
- macOS：`~/Library/Application Support/com.tongyunplanner.app/`
- Linux：`~/.config/com.tongyunplanner.app/`

### Q: 如何备份数据？
A: 有以下几种方式：
1. 使用 WebDAV 同步
2. 手动复制数据目录
3. 在设置里导出 JSON 快照

### Q: 如何恢复数据？
A: 有以下几种方式：
1. 从 WebDAV 同步恢复
2. 手动恢复数据目录
3. 在设置里导入 JSON 快照

## 小组件

### Q: 如何使用桌面小组件？
A: 在设置页面中：
1. 启用"桌面小组件"
2. 小组件窗口会显示在桌面
3. 可以拖动到任意位置
4. 支持多种视图模式

### Q: 小组件窗口如何调整大小？
A: 小组件窗口目前不支持调整大小，固定为 300×400 像素。

## 性能和优化

### Q: 应用运行缓慢怎么办？
A: 尝试以下方法：
1. 关闭不必要的视图
2. 减少任务数量（归档已完成任务）
3. 关闭动画效果
4. 更新到最新版本

### Q: 如何减少内存使用？
A: 尝试以下方法：
1. 关闭小组件窗口
2. 减少同时打开的视图
3. 定期重启应用

## 跨平台

### Q: 支持哪些操作系统？
A: 官方安装包：
- Windows 10/11（x64 exe / msi）
- macOS Universal（Apple Silicon 与 Intel）
- Linux（AppImage / deb，基于 Ubuntu 22.04 构建）

### Q: 数据可以在不同平台间同步吗？
A: 可以，通过 WebDAV 同步功能实现跨平台数据同步。

## 开发相关

### Q: 如何参与开发？
A: 请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 文件。

### Q: 如何报告问题？
A: 使用 Issue 模板提交问题，包括：
1. 问题描述
2. 重现步骤
3. 期望行为
4. 实际行为
5. 截图或错误日志

### Q: 如何添加新功能？
A: 请按照以下步骤：
1. Fork 项目
2. 创建功能分支
3. 实现功能
4. 编写测试
5. 提交 Pull Request

## 其他问题

### Q: 如何联系开发者？
A: 请开 [GitHub Issue](https://github.com/dangzhuotong/tongyun-planner/issues)。目前没有官方邮箱或社群。

### Q: 是否支持多语言？
A: 目前支持中文和英文，计划添加更多语言支持。

### Q: 是否支持移动端？
A: 目前仅支持桌面平台，移动端支持在计划中。

### Q: 是否开源？
A: 是的，基于 MIT 许可证开源。

### Q: 是否免费？
A: 是的，完全免费使用。