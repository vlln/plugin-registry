window.__ModuleLoader__.load({
	id: "vlln/turn-fold",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/turn-fold.tsx
		const NS = "turn-fold";
		const zh = {
			"fold.label": "已折叠第 {count} 轮执行过程",
			"fold.expand": "展开"
		};
		const en = {
			"fold.label": "Turn {count} execution folded",
			"fold.expand": "Expand"
		};
		/**
		* 折叠已结束 turn 的"执行过程"的渲染器：工具调用组 + 中间文本（非 Answer）。
		* select 是 owner 纯函数，用 owner 携带的 turn 上下文判别：
		* - tool-group：所属 turn 已结束 → 折叠
		* - assistant：非 Answer（不在 answerSeqs）且所属 turn 已结束 → 折叠（中间文本）
		* - Answer / user / 未结束 turn 的 item → 未命中走官方渲染
		*/
		function TurnFoldRow(props) {
			const { t, matched } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "6px 10px",
					margin: "2px 0",
					fontSize: 13,
					background: "var(--dsw-alias-bg-layer-2, #141414)",
					border: "1px solid var(--dsw-alias-border-l2, #333)",
					borderRadius: 6,
					color: "var(--dsw-alias-text-muted, #999)"
				},
				children: t("fold.label", { count: matched.turn })
			});
		}
		/** 判别式：折叠"已结束 turn 的执行过程"（工具组 + 中间文本），Answer 与未结束 turn 走官方。 */
		function select(owner) {
			const { item, turnEnds, answerSeqs } = owner;
			if (item.kind === "tool-group") return turnEnds.has(item.turn) ? {
				folded: true,
				turn: item.turn
			} : null;
			const node = item.node;
			if (node.kind === "assistant") {
				if (answerSeqs.has(node.seq)) return null;
				return turnEnds.has(node.turn) ? {
					folded: true,
					turn: node.turn
				} : null;
			}
			return null;
		}
		/** 需要此插件声明的服务：slots + locale。 */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "turn-fold: dictionaries");
			ctx.effect(() => {
				const row = (0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "conversation.chat.item", TurnFoldRow, () => ctx.slots.register({
					name: "conversation.chat.item",
					priority: 1,
					locale: NS,
					select
				}, TurnFoldRow));
				return () => {
					row.dispose();
				};
			}, "turn-fold: registration");
		}
		//#endregion
		//#region src/client/index.ts
		const name = "turn-fold";
		//#endregion
		exports.TurnFoldRow = TurnFoldRow;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		exports.select = select;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map