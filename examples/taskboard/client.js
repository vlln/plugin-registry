window.__ModuleLoader__.load({
	id: "vlln/taskboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/taskboard.tsx
		const NS = "taskboard";
		const zh = { "panel.trigger": "Task Board" };
		const en = { "panel.trigger": "Task Board" };
		/** sidebar.panel 入口按钮（宽行态）。 */
		function TaskBoardTrigger(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: {
					width: "100%",
					padding: "6px 10px",
					border: "none",
					background: "transparent",
					color: "inherit",
					textAlign: "left",
					cursor: "pointer",
					fontSize: 13
				},
				children: t("panel.trigger")
			});
		}
		/** 需要此插件声明的服务：slots + locale。 */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "taskboard: dictionaries");
			ctx.effect(() => {
				const deferred = (0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "sidebar.panel", TaskBoardTrigger, () => ctx.slots.register({
					name: "sidebar.panel",
					id: "taskboard",
					locale: NS
				}, TaskBoardTrigger));
				return () => {
					deferred.dispose();
				};
			}, "taskboard: registrations");
		}
		//#endregion
		//#region src/client/index.ts
		const name = "taskboard";
		//#endregion
		exports.TaskBoardTrigger = TaskBoardTrigger;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map