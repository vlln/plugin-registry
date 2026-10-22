<h1 align="center">vlln 的 dsh 插件</h1>

<p align="center">
  <strong>我为 DeepSeek Harness（dsh）写的插件，发布成一个插件市场索引。</strong><br/>
  中文 | <a href="README.md">English</a>
</p>

索引就是一个 **format 1** 的 JSON 文件——dsh 自己读的格式——所以任何 dsh 0.2.1+ 都能直接浏览、直接装，中间不需要任何服务。

## 当成索引源用

1. **Plugins → Discover → 管理索引源**
2. 添加：

   ```
   https://raw.githubusercontent.com/vlln/plugin-registry/main/index.json
   ```

3. 搜索、选版本、安装。

也可以按索引里同样的 spec 手装：

```sh
dsh plugin --profile web add github:vlln/dsh-share-link
```

## 收录了什么

| 插件 | 作用 | 安装 |
|---|---|---|
| [**分享链接**](https://github.com/vlln/dsh-share-link) `@vlln/dsh-share-link` | 把一段对话或一个产物发布成只读公网链接，随时可撤销。 | `github:vlln/dsh-share-link` |
| [**视频转文案**](https://github.com/vlln/dsh-video2text) `dsh-video2text` | 视频链接转文案：侧栏播放器 + 逐字稿 + 导出，自带 `video2text` skill。 | `github:vlln/dsh-video2text` |
| [**盘查**](https://github.com/vlln/dsh-pancha) `dsh-pancha` | 把目录变成一张可审查、可批注、可执行的盘面——Agent 标注，你决定。 | `github:vlln/dsh-pancha` |
| [**定时循环**](https://github.com/vlln/dsh-loop) `@vlln/dsh-loop` | `/loop` 命令 + `loop` 工具 + 活动状态条，让任务按自己的节奏反复跑。 | `@vlln/dsh-loop` |
| [**自动分叉**](https://github.com/vlln/dsh-autofork) `@vlln/dsh-autofork` | Agent 忙时自动分叉会话：新指令立刻响应，旧会话跑完再回注。 | `github:vlln/dsh-autofork` |
| [**鲸鱼少女**](https://github.com/vlln/whale-girl) `whale-girl` | DSH Web GUI 里的桌面宠物。 | `whale-girl` |
| [**进化工程**](https://github.com/vlln/evo-engineering) `@vlln/evo-engineering` | 任意产物一轮轮改得更好：定标准、迭代、独立评审、可回滚。 | `github:vlln/evo-engineering` |
| [**PR 收件箱**](https://github.com/omdsh-dev/dsh-pr-inbox) `dsh-pr-inbox` | 侧栏里看与你相关的 GitHub PR：我提的 / 待我审 / 我合并的，复用本机 `gh` 登录。 | `github:omdsh-dev/dsh-pr-inbox` |
| [**Preset 检查器**](https://github.com/omdsh-dev/dsh-preset-inspector) `dsh-preset-inspector` | 看清一个 agent preset 的每一行来自哪层补丁、哪个包、什么配置。 | `github:omdsh-dev/dsh-preset-inspector` |

两个更早的插件已归档，因此**不在**索引里（仍可按包名安装，只是不再维护）：[`@vlln/dsh-navbar`](https://github.com/vlln/dsh-navbar)、[`@vlln/dsh-task-status`](https://github.com/vlln/dsh-task-status)。

## 这个仓库怎么运转

| 路径 | 作用 |
|---|---|
| `plugins/*.json` | 只写展示层：标题、描述、分类、关键词、图标 |
| `scripts/build-index.mjs` | 探测真实事实（npm 版本与发布时间，或默认分支 HEAD commit 及其 manifest），合并后用 `@deepseek-ai/dsh-plugin-market-index` 校验，写出 `index.json` |
| `index.json` | 生成物——客户端唯一读取的文件 |
| `.github/workflows/index.yml` | 每天重建一次；`index.json` 真变了才提交 |

版本以**实际发布**为准：发过 npm 的列 npm 版本，只在 git 上的列默认分支 HEAD commit。仓库比 npm 新时，索引仍给已发布版本；想追最新就按 git 装。

## 历史

这个仓库到 2026-10-03 为止是**薄控制台**（浏览器面板管理 profile 的插件安装状态）+ `make-dsh-plugin` skill 的副本。控制台的活被 DSH 自己的 Plugins 页接走，skill 迁到 [vlln/dsh-skills](https://github.com/vlln/dsh-skills)，2026-10-21 仓库改成现在这个索引。

## License

MIT
