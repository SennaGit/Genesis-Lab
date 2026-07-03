export const codegenGuardPrompt = `
只有在满足全部约束时才生成代码：

- 兼容 TypeScript strict mode
- 兼容 Next.js App Router
- 不违反跨 feature 依赖边界
- ui/* 中不得发起 API 调用
- 可替换 UI 组件中不得持有业务状态

如果无法满足某项约束，停止并报告问题。
`;
