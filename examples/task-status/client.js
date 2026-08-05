window.__ModuleLoader__.load({
	id: "vlln/task-status",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/task-status.tsx
		const NS = "task-status";
		const zh = {
			"status.running": "{count} 个后台任务运行中",
			"status.idle": "无后台任务",
			"status.finished": "{count} 已完成"
		};
		const en = {
			"status.running": "{count} background task(s) running",
			"status.idle": "No background tasks",
			"status.finished": "{count} finished"
		};
		/**
		* 对话页对话框上方的后台任务状态条：`useTasks` 渲染该会话的后台任务
		* （running 计数高亮，已结算任务数附注）——与 queue/todo 同 strip 姿势。
		*/
		function TaskStatusBar(props) {
			const { t, useTasks } = props;
			const tasks = useTasks((s) => s);
			const running = tasks.filter((task) => task.status === "running").length;
			const finished = tasks.length - running;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-task-status-bar": "",
				style: {
					padding: "4px 12px",
					fontSize: 12,
					color: running > 0 ? "var(--dsw-alias-text-accent, #4c9aff)" : "var(--dsw-alias-text-muted, #999)"
				},
				children: [running > 0 ? t("status.running", { count: running }) : t("status.idle"), finished > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						marginLeft: 8,
						color: "var(--dsw-alias-text-muted, #999)"
					},
					children: ["· ", t("status.finished", { count: finished })]
				})]
			});
		}
		/** 需要此插件声明的服务：slots + locale。 */
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "task-status: dictionaries");
			ctx.effect(() => {
				const bar = (0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "conversation.input.dock", TaskStatusBar, () => ctx.slots.register({
					name: "conversation.input.dock",
					id: "task-status",
					order: 10,
					locale: NS
				}, TaskStatusBar));
				return () => {
					bar.dispose();
				};
			}, "task-status: registration");
		}
		//#endregion
		//#region src/client/index.ts
		const name = "task-status";
		//#endregion
		exports.TaskStatusBar = TaskStatusBar;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map