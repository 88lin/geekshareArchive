# Contributing

感谢你改进 GeekShare Archive。提交贡献即表示你同意所提交内容按本仓库的 MIT License 发布。

## 开始之前

- 安装 Node.js 20.9 或更高版本，推荐 Node.js 22。
- 仓库维护者默认先快进同步本地 `main`，完成检查后直接推送到 `origin/main`；外部贡献或明确需要评审的改动从 `main` 创建短生命周期分支并提交 Pull Request。
- 不要提交真实 Token、管理员邮箱、Cloudflare 资源 ID、生产 `wrangler.jsonc`、频道历史或媒体文件。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。

## 本地检查

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run assets:verify
npx wrangler deploy --dry-run --config wrangler.example.jsonc
npm audit --audit-level=high
```

## 提交与 Pull Request

维护者直推前必须执行 `git pull --ff-only origin main`，运行上述检查，并且只暂存当前任务的文件；远端已经前进或历史分叉时应先安全同步，禁止 force-push。

外部贡献或明确需要评审的改动使用 Pull Request：

1. 清楚说明问题、解决方式和验证结果。
2. 行为变化应更新测试和文档；界面变化请附截图。
3. 避免无关格式化、生成文件和大版本依赖迁移。
4. 等待 `verify` 检查通过，并根据评审意见更新分支。

无论采用哪种提交方式，`main` 推送都会触发完整 CI 和生产部署；只有流水线及生产端点验证成功后，发布才算稳定。
