# AGENTS.md — 开发约定（提瓦特交通联合）

本文件是所有开发工作（包括 AI 编码代理）的**最高优先级章程**。开始任何改动之前，先读完本文件。

## 🚨 铁律（新功能必须遵守，不可违反）

1. **git 提交并推送**：完成任何功能，必须 `git add -A && git commit -m "..."`，并 **`git push`** 到远程。不允许把改动只留在本地不推送。
2. **必须写测试例**：每个新功能都要有对应的自动化测试（Node 内置 `node --test`），测试必须真实运行、**全部通过**，确认无误后才算交付。
3. **测试通过是交付前提**：`npm test` 只要有失败 → 该项视为**未完成**，不能交付。
4. 未提交、未推送、测试未通过的代码，一律视为**未完成**。

## 开发流程（每个新功能按此顺序）

1. 先同步：`git pull`
2. 建分支：`git checkout -b feat/<功能名>`（如 `feat/order-refund`）
3. 写代码（后端 `server/`，前端 `client/`）
4. 写/更新测试：`server/test/*.test.js`
5. 本地跑测试：`cd server && npm test` → **必须全绿**
6. 若改了前端：`npm run build` 必须通过（前端用构建 + 冒烟兜底）
7. 提交：`git add -A && git commit -m "feat(scope): ..."`
8. 推送：`git push -u origin feat/<功能名>`
9. 交付说明（如已合并到主分支，再 `git push` 一次）

## 测试约定

- 用 **Node 内置 test runner**（`node --test`，Node ≥ 18），**不新增测试框架依赖**，契合项目零依赖风格。
- 测试文件放在 `server/test/*.test.js`，按模块命名（如 `auth.test.js`）。
- 每个功能至少覆盖三类：**正常路径**、**边界**、**异常/非法输入**。
- 优先测纯函数：密码哈希、JWT、计价、数据库工具等；**不要**为测试去连网络、启动服务或改写真实的 `server/data/db.json`。
- 测试必须**真跑真断言**，禁止 `test.skip`、空的 `test(...)` 或不执行的脚本。

## 提交信息规范

- 格式：`<type>(<scope>): <subject>`
- `type`：`feat` / `fix` / `refactor` / `test` / `docs` / `chore`
- `scope`：`server` / `client` / `deploy` / `ops`
- 示例：`feat(server): 增加订单退票接口`、`test(server): 补退票计价测试`

## 目录结构速览

- `server/`：后端（Express，数据存 `server/data/db.json`）
- `client/`：前端（React + Vite，构建产物 `client/dist`）
- `deploy/`：部署工具（HTTPS / Nginx / pm2）
- `HTTPS.md` / `DEPLOY.md`：部署与 HTTPS 说明

## 完成自查清单（交付前逐项打勾）

- [ ] `cd server && npm test` 全部通过
- [ ] 改过前端则 `npm run build` 通过
- [ ] 已 `git commit` 且 `git push`
- [ ] 提交信息符合 `<type>(<scope>): <subject>` 规范
