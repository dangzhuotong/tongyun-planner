# 贡献指南

感谢您对 TongYun Planner 项目的关注！我们欢迎任何形式的贡献。

## 如何贡献

### 报告问题
1. 使用 [GitHub Issues](https://github.com/yibingzhi/tongyun-planner/issues/new) 提交问题
2. 清晰描述问题，包括重现步骤、期望行为和实际行为
3. 如果可能，提供截图或错误日志

### 提交代码
1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

### 代码规范
- 前端：遵循 TypeScript 严格模式，使用 `npm run typecheck` 做类型检查
- 后端：遵循 Rust 官方风格指南
- 提交信息：使用中文或英文，清晰描述变更内容

### 开发环境设置
1. 克隆项目：`git clone https://github.com/yibingzhi/tongyun-planner.git`
2. 安装依赖：`npm install`
3. 启动开发服务器：`npm run tauri dev`
4. 进行更改并测试
5. 提交 Pull Request

## 项目结构

```
tongyun-planner/
├── src/                    # 前端源码
│   ├── components/         # React 组件
│   ├── App.tsx             # 主应用组件
│   ├── types.ts            # TypeScript 类型定义
│   └── constants.ts        # 常量和配置
├── src-tauri/              # Tauri 后端
│   ├── src/                # Rust 源码
│   └── tauri.conf.json     # Tauri 配置
└── public/                 # 静态资源
```

## 提交信息规范

使用以下格式：
```
<type>(<scope>): <subject>

<body>

<footer>
```

类型（type）：
- `feat`: 新功能
- `fix`: 修复问题
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

## 行为准则

- 尊重他人
- 保持专业
- 建设性反馈
- 欢迎新手

## 许可证

贡献的代码将基于 MIT 许可证开源。
