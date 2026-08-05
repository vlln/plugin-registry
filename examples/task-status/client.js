window.__ModuleLoader__.load({
	id: "vlln/task-status",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/task-status.tsx
		const NS = "task-status";
		const zh = {
			"status.running": "{count} 个后台任务运行中",
			"status.finished": "{count} 已完成",
			"status.open": "展开",
			"status.close": "收起",
			"task.running": "运行中",
			"task.stopping": "停止中",
			"task.completed": "已完成",
			"task.killed": "已终止",
			"task.failed": "失败"
		};
		const en = {
			"status.running": "{count} background task(s) running",
			"status.finished": "{count} finished",
			"status.open": "Expand",
			"status.close": "Collapse",
			"task.running": "Running",
			"task.stopping": "Stopping",
			"task.completed": "Completed",
			"task.killed": "Killed",
			"task.failed": "Failed"
		};
		/** 布局变量对齐官方 dock 家族（ConversationRoot.module.css）。 */
		const SIDE_CLEARANCE = "var(--dsh-composer-side-clearance, 16px)";
		const DOCK_INSET = "var(--dsh-composer-dock-inset, 8px)";
		const CARD_MAX = "var(--dsh-composer-card-max-width, 780px)";
		/** 每状态视觉：token + glyph 字符（14px outline 家族近似）。 */
		const STATUS_META = {
			running: {
				color: "var(--dsw-alias-state-business-primary)",
				glyph: "●",
				label: "task.running"
			},
			stopping: {
				color: "var(--dsw-alias-state-warn-primary)",
				glyph: "◐",
				label: "task.stopping"
			},
			completed: {
				color: "var(--dsw-alias-state-success-primary)",
				glyph: "✓",
				label: "task.completed"
			},
			killed: {
				color: "var(--dsw-alias-label-caption)",
				glyph: "✕",
				label: "task.killed"
			},
			failed: {
				color: "var(--dsw-alias-state-error-primary)",
				glyph: "!",
				label: "task.failed"
			}
		};
		/**
		* 对话页对话框上方的后台任务状态条：仅 Chat 视图显示（`[data-chat-flow=""]`
		* 探针），`useTasks` 渲染该会话任务（running 高亮 + 展开逐条）。
		*/
		function TaskStatusBar(props) {
			const { t, useTasks } = props;
			const tasks = useTasks((s) => s);
			const [inChat, setInChat] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [expandedTask, setExpandedTask] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				const check = () => {
					setInChat(document.querySelector("[data-chat-flow=\"\"]") !== null);
				};
				check();
				const observer = new MutationObserver(check);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
				};
			}, []);
			if (!inChat) return null;
			const active = tasks.filter((task) => task.status === "running" || task.status === "stopping");
			const running = active.filter((task) => task.status === "running").length;
			if (active.length === 0) return null;
			const statusOf = (status) => STATUS_META[status] ?? {
				color: "var(--dsw-alias-label-caption)",
				glyph: "·",
				label: status
			};
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					height: 36,
					padding: "4px 5px 4px 12px",
					cursor: tasks.length > 1 ? "pointer" : "default"
				},
				onClick: active.length > 1 ? () => setOpen((v) => !v) : void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							width: 16,
							fontSize: 14,
							lineHeight: "16px",
							textAlign: "center",
							color: "var(--dsw-alias-label-tertiary)"
						},
						children: "⚙"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							flex: 1,
							fontSize: 13,
							lineHeight: "24px",
							fontWeight: 500,
							color: "var(--dsw-alias-label-primary)"
						},
						children: t("status.running", { count: running })
					}),
					active.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							padding: "0 8px",
							fontSize: 12,
							color: "var(--dsw-alias-label-caption)"
						},
						children: open ? t("status.close") : t("status.open")
					})
				]
			});
			const timeText = (task) => {
				const start = new Date(task.startedAt);
				const pad = (n) => String(n).padStart(2, "0");
				const time = `${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`;
				return task.finishedAt === void 0 ? `${time} 起` : `${time} → ${pad(new Date(task.finishedAt).getHours())}:${pad(new Date(task.finishedAt).getMinutes())}`;
			};
			const row = (task) => {
				const meta = statusOf(task.status);
				const expanded = expandedTask === task.id;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						height: 36,
						padding: "0 12px",
						borderRadius: 8,
						cursor: "pointer",
						background: expanded ? "var(--dsw-alias-interactive-bg-hover)" : void 0
					},
					onClick: () => setExpandedTask(expanded ? null : task.id),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								width: 16,
								fontSize: 14,
								lineHeight: "16px",
								textAlign: "center",
								color: meta.color
							},
							children: meta.glyph
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								flex: 1,
								fontSize: 13,
								lineHeight: "20px",
								color: "var(--dsw-alias-label-secondary)",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap"
							},
							children: task.label
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 12,
								color: "var(--dsw-alias-label-caption)",
								whiteSpace: "nowrap"
							},
							children: timeText(task)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: 12,
								color: meta.color,
								whiteSpace: "nowrap"
							},
							children: t(meta.label)
						})
					]
				}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						padding: "0 12px 8px 34px",
						fontSize: 12,
						lineHeight: "18px",
						color: "var(--dsw-alias-label-tertiary)",
						display: "flex",
						flexDirection: "column",
						gap: 2
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						"类型：",
						task.kind,
						" · ",
						timeText(task)
					] }), task.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["详情：", task.detail] })]
				})] }, task.id);
			};
			const card = (body) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-task-status-bar": "",
				style: {
					width: `calc(100% - 2 * ${SIDE_CLEARANCE} - 4 * ${DOCK_INSET})`,
					maxWidth: `calc(${CARD_MAX} - 4 * ${DOCK_INSET})`,
					margin: "0 auto",
					border: "1px solid var(--dsw-alias-border-l1)",
					borderRadius: 12,
					background: "var(--dsw-specific-tip)",
					overflow: "hidden",
					fontSize: 13,
					fontFamily: "system-ui"
				},
				children: body
			});
			if (active.length === 1) {
				const single = active[0];
				if (single !== void 0) return card(row(single));
				return null;
			}
			return card(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [header, open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					maxHeight: 180,
					overflowY: "auto",
					borderTop: "1px solid var(--dsw-alias-border-l1)"
				},
				children: active.map(row)
			})] }));
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