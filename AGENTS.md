# AGENTS.md — 维护 vlln 的 dsh 插件索引

本仓库只做一件事：产出 **`index.json`**（插件市场索引 **format 1**），供 dsh 的
**Plugins → Discover** 读取。没有服务、没有面板、没有构建产物之外的代码。

- 索引地址（对外公布后不要改）：
  `https://raw.githubusercontent.com/vlln/plugin-registry/main/index.json`
- 上游格式定义：`@deepseek-ai/dsh-plugin-market-index`（dsh 安装包里自带这个包）
- 用户文档：README.md / README.zh.md；本文件只讲**怎么维护**

## 目录结构

```
index.json                 # 生成物，客户端唯一读取的文件；不要手改
plugins/<slug>.json        # 一个插件一个文件，只写展示层
icons/*.svg                # 图标，index 里的 icon 用相对路径引用
scripts/build-index.mjs    # 生成器：探测事实 → 合并 → 校验 → 写 index.json
package.json / lock        # 只为生成器的依赖（@deepseek-ai/dsh-plugin-market-index）
.github/workflows/index.yml# 每天 03:00 UTC 重建，index.json 真变了才提交
```

## 加一个插件

1. 新建 `plugins/<slug>.json`（字段见下）。
2. 跑生成器（会联网探测真实版本，并用官方校验器自检）：
   ```sh
   npm install            # 首次；沙箱挡 ~/.npm 时加 --cache /tmp/npm-cache
   GITHUB_TOKEN=$(gh auth token) node scripts/build-index.mjs
   ```
3. `git add plugins/<slug>.json icons/... index.json && git commit`。

### `plugins/*.json` 的字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | npm 包名。**必须和插件 package.json 里的 `name` 一致**（市场按包名匹配已装状态） |
| `repo` | 是 | `owner/name`，git 源探测 HEAD，也用作 `repository.url`。owner 可以是任何账号/组织（例如 `omdsh-dev/…`） |
| `source` | 是 | `"npm"`（发过 npm）或 `"git"`（只在仓库里） |
| `title` | 建议 | `{ "en": "...", "zh": "..." }`，**必须有 `en`** |
| `description` | 建议 | 同上；一句话说清「它能做什么」 |
| `icon` | 可选 | `icons/<slug>.svg`（相对路径，按 index URL 解析）；没有就让它空着 |
| `homepage` | 可选 | http(s) 绝对地址 |
| `author` | 可选 | 显示用 |
| `category` | 是 | 必须是生成器里 `CATEGORIES` 声明过的 id（`content` / `conversation` / `workspace` / `workflow` / `interface`）；要加新分类，改 `scripts/build-index.mjs` |
| `keywords` | 可选 | 字符串数组，供市场搜索 |

**不要写进这个文件的东西**（它们由生成器探测，手写会漂）：`version`、`publishTimestamp`、
`source.type/commit`、`engines`、`repository`。

## 下线 / 归档一个插件

- 只是不推荐了但还能装：把 `plugins/<slug>.json` 删掉，在 README 的「已归档」段落列一行包名。
  索引里只放**还能装、还有人管**的插件。
- 彻底不维护：从 README 表格里也删掉。

## 生成器做什么

- `source: "npm"`：读 registry，列出**所有**已发布版本（版本号 + 发布时间 + 该版本 manifest 的 `engines.dsh`）。
- `source: "git"`：取默认分支 HEAD 的 commit、committer 时间（秒），以及**该 commit 上**的 `package.json`
  拿 `version` / `engines.dsh`。
- 合并后调用 `parseMarketIndex(document, INDEX_URL)`；任何一条规则不过就抛错退出，**不写盘**。
- 输出顺序：插件按文件名、npm 版本按字符串倒序（客户端读的时候会自己按 SemVer 排序）。

**版本策略**：以「实际发布」为准。仓库比 npm 新时（如 `@vlln/dsh-loop` 仓库 0.4.3 / npm 0.4.1），
索引仍只给已发布版本——不要为了「最新」把 HEAD 塞进 `versions`，那会让默认安装指到未发布代码。

## 格式要点（踩过的）

- `LocalizedText` 是字符串或「小写语言 id → 字符串」对象，**必须含 `en`**。
- `versions` 非空；`version` 是精确 SemVer；`publishTimestamp` 是 **Unix 秒**；git 源 `commit` 是
  **40 位小写 sha**。
- `engines.dsh` 类型上可省，但官方格式说明要求每个版本都声明；省略 = 任何 dsh 都算兼容。
  生成器只照抄 manifest，缺就留空——所以插件仓库本身该补 `"engines": { "dsh": ">=0.2.0" }`。
- 设计文档里的 `dist-tags` **当前没实现**（校验器当未知成员丢掉）；默认版本由 reader 取
  「最高兼容且非 prerelease」。别指望它做 latest/next 通道。
- `icon` 可相对 index 解析；内联 `data:` 上限 32 KiB。
- 客户端拉取：只收 http(s)、**重定向即失败**、超时 15s、缓存 10min。

## CI

`.github/workflows/index.yml`：每天 03:00 UTC + 手动触发 → `npm ci` → 跑生成器 → `index.json` 变了才提交
（不变则是空跑）。生成器失败（网络 / 校验）会让 workflow 红，不会写出半截文件。

## 验收（改完生成器或格式后必做）

1. `GITHUB_TOKEN=$(gh auth token) node scripts/build-index.mjs` 应打印插件数与版本数，且连跑两次
   `index.json` 逐字节一致（确定性）。
2. 真机验收：
   ```sh
   # 仓库根起静态服务，dsh 只能读 http(s)，file:// 不行
   python3 -m http.server 6500
   # 隔离 home：市场 bundle 是 dsh 自带的 provided bundle，只加进 bundles、不要 npm 装
   DSH_HOME=/tmp/dsh-index-check dsh web --port 0 --no-open
   ```
   然后 Plugins → Discover → **Add index source** 填 `http://127.0.0.1:6500/index.json`：
   所有插件卡片出现、标题/描述/版本/日期/分类正确；点 Install 的确认框里 git 源显示 40 位 `Commit`。

## 已知坑

- **不要 `dsh plugin add @deepseek-ai/dsh-experimental-plugin-market-bundle`**：它是 dsh 安装包自带的
  provided bundle，从 npm 装会拉到与运行时版本不匹配的 alpha/rc，boot 报
  `disabling profile plugin row "plugin-market"`，Discover 只会显示 "Could not read the index sources."。
  正确做法：把包名加进隔离 profile 的 `dsh.profile.bundles`，不写 dependency。
- `gh auth token` 带尾部换行，直接塞进 fetch 头会抛裸 `fetch failed`（不是 401）——生成器里已 `.trim()`。
- Node `fetch` 打 `raw.githubusercontent.com` 在某些网络下会连到不通的 185.199.x IP 超时；生成器取
  manifest 走 `api.github.com/.../contents/package.json?ref=<sha>`，别换回 raw 域名。
- Discover **没有内置源**：索引地址要用户手动加。所以这是个「自家货架」，主流曝光仍靠上游目录。

## 边界

- **skill 不在这里**：`make-dsh-plugin`、`dsh-session-repair` 在 [vlln/dsh-skills](https://github.com/vlln/dsh-skills)。
- **不是插件市场客户端**：本仓库只提供数据；市场客户端由 dsh 自带，或社区的 `dsh-market`。
- 本仓库 2026-10-03 之前的「薄控制台」已移除（代码在 git 历史里），不要试图恢复它的构建/部署流程。
