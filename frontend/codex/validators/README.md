# Genesis Codex 校验说明

Codex 生成的前端变更在合入前必须通过以下校验：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

替换 UI 时应优先限定在 `ui/components`，并保持 `ui/contracts` 中的契约不变。
