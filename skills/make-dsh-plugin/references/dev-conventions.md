# 开发规范详情

让插件可维护的纪律。本文件是 SKILL.md 的深读材料，项目进入迭代期时读取。

## 门禁

- 机械检查 + 自证测试：每个门禁有用非法样例证明会拒绝的测试。
- 门禁清单权威在 `scripts/gates/run.mjs`；按改动面跑**最窄**证据，不默认跑全套。
- 常见门禁：md-links / decisions / assets / spec-states / config-sync / generated-freshness / unit-tests / gate-self-tests。

## 决策记录

- 每个非平凡改动随附决策记录（`decisions/implemented/...`）：
  `## Problem` → `## Decision` → `## Alternatives considered` → `## Consequences`。
- 决策分类封闭集合：feature / bug-fix / simplification / architecture / process / testing。
- 部分取代旧决策时两条保持活跃并互链。

## 生成物纪律

- `client.js` 由构建生成（`build-client.mjs --check` 守卫新鲜度），勿手改。
- 生成物不手改——改源码，重新构建。

## 环境行为沉淀

宿主/平台环境性行为首次复现即沉淀：如「宿主会清理/覆盖 CSS 注入样式」这类环境事实，第一次踩坑就写 bug-fix 决策记录标注「环境事实」，不等第 N 次再固化。

## 协作约束

- 一个 PR 一种性质 + 标签；独立改动拆开；缺陷在引入它的 PR 上修。
- 并行/在途改动保护：`git status` 有未暂存改动时禁用 `git add -A`——显式路径 add。
- 未被明确要求时不推送、不合并、不发布。
