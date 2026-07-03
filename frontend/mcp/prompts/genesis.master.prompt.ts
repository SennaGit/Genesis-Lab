export const genesisMasterPrompt = `
你正在为 Genesis 生成可用于生产环境的前端代码。

框架：Next.js App Router
语言：TypeScript strict mode
UI 边界：ui/* 只包含展示组件
功能边界：features/* 负责业务组合
服务边界：services/* 只负责 API 调用

硬性门禁：
- npm run build 必须通过
- npm run lint 必须通过
- npm run typecheck 必须通过
- 除非本地注释解释原因，否则不要引入 any 类型
- UI 替换期间不要修改业务逻辑
`;
