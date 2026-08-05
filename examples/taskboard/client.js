window.__ModuleLoader__.load({
	id: "vlln/taskboard",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/taskboard.tsx
		const NS = "taskboard";
		const zh = {
			"panel.trigger": "Task Board",
			"view.title": "Task Board",
			"view.empty": "暂无会话",
			"view.dispatch": "分派任务（占位）",
			"panel.overlayTitle": "Task Board",
			"status.running": "{count} 个后台任务运行中",
			"status.idle": "无后台任务"
		};
		const en = {
			"panel.trigger": "Task Board",
			"view.title": "Task Board",
			"view.empty": "No sessions",
			"view.dispatch": "Dispatch (placeholder)",
			"panel.overlayTitle": "Task Board",
			"status.running": "{count} background task(s) running",
			"status.idle": "No background tasks"
		};
		/** sidebar.panel 入口按钮：有当前会话则 setView 切视图，否则展开浮层。 */
		function TaskBoardTrigger(props) {
			const { t, sessions } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const go = () => {
				const current = sessions.list.getSnapshot().current;
				if (current !== void 0) {
					const conversation = sessions.scope(current)?.get("conversation");
					if (conversation === void 0) {
						console.error("taskboard: conversation service unavailable (needs setView channel)");
						setOpen(true);
						return;
					}
					conversation.setView("taskboard");
					return;
				}
				setOpen((v) => !v);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: go,
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
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					position: "fixed",
					right: 16,
					top: 16,
					zIndex: 900,
					width: 280,
					padding: 16,
					background: "var(--dsw-alias-bg-layer-1, #1e1e1e)",
					border: "1px solid var(--dsw-alias-border-l2, #444)",
					borderRadius: 8,
					fontFamily: "system-ui"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					style: {
						margin: "0 0 10px",
						fontSize: 14
					},
					children: t("panel.overlayTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: { fontSize: 13 },
					children: t("view.empty")
				})]
			})] });
		}
		/** conversation.view 视图：task board 内容（useTasks 投影真实任务 + 分派占位）。 */
		function TaskBoardView(props) {
			const { t } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					padding: 16,
					fontFamily: "system-ui"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: {
							margin: "0 0 12px",
							fontSize: 15
						},
						children: t("view.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: { fontSize: 13 },
						children: t("view.empty")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: {
							marginTop: 8,
							padding: "6px 12px",
							fontSize: 13
						},
						children: t("view.dispatch")
					})
				]
			});
		}
		/**
		* 对话页对话框（composer）上方的后台任务状态条（S2 正确 UI 位置）：
		* 经 `conversation.input.dock`（list 槽，输入上方 stacked strip）注册，
		* `useTasks` 渲染该会话的后台任务——与 queue/todo 同姿势。
		*/
		function TaskStatusBar(props) {
			const { t, useTasks } = props;
			const tasks = useTasks((s) => s);
			const running = tasks.filter((task) => task.status === "running").length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-task-status-bar": "",
				style: {
					padding: "4px 12px",
					fontSize: 12,
					color: running > 0 ? "var(--dsw-alias-text-accent, #4c9aff)" : "var(--dsw-alias-text-muted, #999)"
				},
				children: [running > 0 ? t("status.running", { count: running }) : t("status.idle"), tasks.filter((task) => task.status !== "running").length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					style: {
						marginLeft: 8,
						color: "var(--dsw-alias-text-muted, #999)"
					},
					children: [
						"· ",
						tasks.length - running,
						" 已完成"
					]
				})]
			});
		}
		/** 需要此插件声明的服务：slots + locale + sessions。 */
		const inject = [
			"slots",
			"locale",
			"sessions"
		];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "taskboard: dictionaries");
			ctx.effect(() => {
				const deferred = [];
				deferred.push((0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "sidebar.panel", TaskBoardTrigger, () => ctx.slots.register({
					name: "sidebar.panel",
					id: "taskboard",
					locale: NS,
					inject: () => ({ sessions: ctx.sessions })
				}, TaskBoardTrigger)));
				deferred.push((0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "conversation.view", TaskBoardView, () => ctx.slots.register({
					name: "conversation.view",
					id: "taskboard",
					label: "Task Board",
					locale: NS
				}, TaskBoardView)));
				deferred.push((0, _deepseek_ai_dsh_client_ui_slots.deferRegistration)(ctx.slots, "conversation.input.dock", TaskStatusBar, () => ctx.slots.register({
					name: "conversation.input.dock",
					id: "task-status",
					order: 10,
					locale: NS
				}, TaskStatusBar)));
				return () => {
					for (const entry of deferred) entry.dispose();
				};
			}, "taskboard: registrations");
		}
		//#endregion
		//#region src/client/index.ts
		const name = "taskboard";
		//#endregion
		exports.TaskBoardTrigger = TaskBoardTrigger;
		exports.TaskBoardView = TaskBoardView;
		exports.TaskStatusBar = TaskStatusBar;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map