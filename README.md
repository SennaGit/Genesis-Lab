# Genesis Lab

Genesis Lab 是一个面向科研的 AI 工作流实验室原型。它将自然语言研究问题编译为可执行的 DAG，运行科研代理与工具，记录证据链，并生成结构化 Markdown 研究报告。

## 默认语言约定

所有面向用户的默认输出、生成报告、导出文件、前端展示文案和项目说明默认使用中文。API 字段名、内部枚举值、包名、命令和代码标识符可以保留英文，以保证工程兼容性。

## 当前状态

仓库已包含可运行的后端核心和前端工作台：

- Python 后端核心：任务编译、DAG 构建、本地代理运行、证据映射和 Markdown 报告生成。
- FastAPI 入口：实现规划中的主要 HTTP API。
- Next.js/React 工作台：展示任务 DAG、执行日志、报告和证据面板。
- 标准库单元测试和 API smoke test：覆盖核心端到端流程。

当前文献代理和代码代理使用确定性的本地适配器，因此不依赖外部 API key 或网络即可运行。后续可以替换为 PubMed/arXiv、Weaviate、LangGraph 和容器沙箱。

## 目录结构

```text
backend/
  app/
    main.py              # FastAPI HTTP API
    core/                # 编译器、DAG、代理、运行时、存储
  tests/                 # unittest 测试套件
frontend/
  app/                   # Next.js 页面入口
  features/              # 研究工作台功能
  services/              # API 客户端
  ui/                    # UI 组件与布局
doc/
  bg.md                  # 项目背景文档
```

## 后端运行

安装运行依赖：

```bash
python -m pip install -r backend/requirements.txt
```

启动 API：

```bash
uvicorn app.main:app --reload --app-dir backend
```

安装测试依赖：

```bash
python -m pip install -r backend/requirements-dev.txt
```

运行测试：

```bash
cd backend
python -m unittest discover -s tests
```

## API

- `POST /api/research/compile`：编译研究问题。
- `POST /api/runs`：创建并执行研究流。
- `GET /api/runs/{runId}`：查询运行状态。
- `GET /api/runs/{runId}/evidence`：查询证据。
- `GET /api/runs/{runId}/report`：导出 Markdown 报告。

## 前端运行

安装依赖并启动：

```bash
cd frontend
pnpm install
pnpm run dev
```

前端默认连接 `http://localhost:8000`。如需修改后端地址，设置 `NEXT_PUBLIC_API_BASE`。
