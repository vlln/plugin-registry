// vlln/turn-fold 的 client bundle 产物（手写等价物，同 navbar/greeter 模式）。
// 契约：window.__ModuleLoader__.load({ id, factory })，factory(require) 返回
// Cordis 插件导出面；id 必须等于插件 id。
// 功能：0807 官方 conversation.chat.turnTail 链槽——每个完成的 turn 末尾
// 渲染可折叠的「工具活动」摘要头（默认收起，展开显示工具调用列表）。
window.__ModuleLoader__.load({
  id: "vlln/turn-fold",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");
    var slots = require("@deepseek-ai/dsh-client-ui-slots");
    module.exports = {
      name: "turn-fold-client",
      apply: function (ctx) {
        // locale 字典（zh/en）。
        var NS = "turn-fold";
        var zh = {
          "fold.tools": "{count} 个工具调用",
          "fold.steps": "{count} 步",
          "fold.errors": "{count} 个失败",
          "fold.expand": "展开工具活动",
          "fold.collapse": "收起",
          "fold.empty": "（无工具调用）",
          "fold.tool": "调用 {name}",
          "fold.errored": "失败"
        };
        var en = {
          "fold.tools": "{count} tool call(s)",
          "fold.steps": "{count} step(s)",
          "fold.errors": "{count} failed",
          "fold.expand": "Expand tool activity",
          "fold.collapse": "Collapse",
          "fold.empty": "(no tool calls)",
          "fold.tool": "called {name}",
          "fold.errored": "failed"
        };
        ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, "turn-fold: dictionaries");

        // 派生 closing assistant（seq）所在 turn 的活动摘要。分组规则与
        // 官方 ui-deliverables producedForClosing 同构：user 消息重置、
        // 不同 turn 号重置、遇到 closing seq 返回。
        function activityForClosing(nodes, seq) {
          var tools = [];
          var toolCount = 0, errorCount = 0, stepCount = 0, turn;
          function reset() { tools.length = 0; toolCount = 0; errorCount = 0; stepCount = 0; }
          for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            if (node.kind === "user") { turn = undefined; reset(); continue; }
            if ("turn" in node && node.kind !== "tool-result") {
              if (turn !== undefined && node.turn !== turn) reset();
              turn = node.turn;
              if (node.kind === "assistant") stepCount += 1;
            }
            if (node.kind === "tool-result") {
              toolCount += 1;
              if (node.isError) errorCount += 1;
              tools.push({ name: node.call ? node.call.name : node.callId, isError: node.isError });
            }
            if (node.kind === "assistant" && node.seq === seq) {
              return { toolCount: toolCount, errorCount: errorCount, stepCount: stepCount, tools: tools };
            }
          }
          return { toolCount: toolCount, errorCount: errorCount, stepCount: stepCount, tools: tools };
        }

        // chain 槽选择器：该 turn 有活动才挂载（null 谢绝）。
        function selectTurnActivity(owner) {
          var activity = activityForClosing(owner.nodes, owner.seq);
          if (activity.toolCount === 0 && activity.stepCount === 0) return null;
          return activity;
        }

        // 折叠头组件：默认收起（「🔧 N 工具 · M 步」），展开显示工具列表。
        function TurnFold(props) {
          var matched = props.matched;
          var t = props.t;
          var open = react.useState(false);
          var isOpen = open[0];
          var setOpen = open[1];
          var parts = [];
          if (matched.toolCount > 0) parts.push(t("fold.tools", { count: String(matched.toolCount) }));
          if (matched.stepCount > 0) parts.push(t("fold.steps", { count: String(matched.stepCount) }));
          if (matched.errorCount > 0) parts.push(t("fold.errors", { count: String(matched.errorCount) }));
          var summary = parts.length > 0 ? parts.join(" · ") : t("fold.empty");
          return react.createElement("div", { style: {
            display: "flex", flexDirection: "column", width: "100%", minWidth: 0,
            fontSize: 12, color: "var(--dsw-alias-label-tertiary)"
          } },
            react.createElement("button", { type: "button", onClick: function () { setOpen(!isOpen); },
              "aria-expanded": isOpen,
              "aria-label": t(isOpen ? "fold.collapse" : "fold.expand"),
              style: {
                display: "flex", alignItems: "center", height: 24, gap: 6,
                padding: "0 4px", border: "none", background: "none", cursor: "pointer",
                font: "inherit", color: "inherit", textAlign: "left"
              } },
              react.createElement("span", { style: {
                display: "inline-flex", width: 16, height: 16, alignItems: "center",
                justifyContent: "center", transition: "transform .18s ease",
                transform: isOpen ? "rotate(90deg)" : "none"
              } }, "▶"),
              react.createElement("span", { style: { fontSize: 13, lineHeight: "24px" } }, "🔧 " + summary)
            ),
            isOpen ? react.createElement("ul", { style: { margin: "2px 0 4px", padding: "0 0 0 26px", listStyle: "none" } },
              matched.tools.map(function (tool) {
                return react.createElement("li", { key: tool.name + ":" + tool.isError, style: { lineHeight: "20px" } },
                  react.createElement("span", { style: { opacity: tool.isError ? 0.6 : 1 } },
                    (tool.isError ? "✗ " : "· ") + tool.name + (tool.isError ? "（" + t("fold.errored") + "）" : "")));
              }).concat(matched.tools.length === 0
                ? [react.createElement("li", { key: "empty", style: { lineHeight: "20px" } }, t("fold.empty"))]
                : [])
            ) : null
          );
        }

        // 0806+ slots 契约：注册走 ctx.slots.inject（等待槽声明、随声明
        // 坍缩自动移除、重声明后重跑）。
        ctx.slots.inject("conversation.chat.turnTail", function () {
          return ctx.slots.register({
            name: "conversation.chat.turnTail",
            select: selectTurnActivity,
            locale: NS
          }, TurnFold);
        });
      }
    };
    return module.exports;
  }
});
