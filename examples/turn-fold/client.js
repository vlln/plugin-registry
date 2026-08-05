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
			"fold.label": "已折叠 {count} 个工具调用",
			"fold.expand": "展开"
		};
		const en = {
			"fold.label": "{count} tool call(s) folded",
			"fold.expand": "Expand"
		};
		/**
		* 折叠已完成工具组的渲染器。select 是 owner 的纯函数（只判 flow item）：
		* tool-group（工具调用组）接管折叠，其余 item 未命中走官方渲染。
		*/
		function TurnFoldRow(props) {
			const { t } = props;
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
				children: t("fold.label", { count: 0 })
			});
		}
		/** 判别式：只折叠工具调用组（已完成 = 全是 tool-result 的组）。 */
		function select(owner) {
			if (owner.item.kind !== "tool-group") return null;
			if ((owner.item.results ?? []).length === 0) return null;
			return { folded: true };
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