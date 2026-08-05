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
			"panel.overlayTitle": "Task Board",
			"panel.empty": "暂无会话",
			"panel.sessions": "会话：",
			"panel.dispatch": "分派任务（占位）"
		};
		const en = {
			"panel.trigger": "Task Board",
			"panel.overlayTitle": "Task Board",
			"panel.empty": "No sessions",
			"panel.sessions": "Sessions: ",
			"panel.dispatch": "Dispatch (placeholder)"
		};
		/** sidebar.panel 入口按钮：点击展开浮层。 */
		function TaskBoardTrigger(props) {
			const { t, useSessions } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const list = useSessions((s) => s);
			const count = list === void 0 ? 0 : Object.keys(list.byId).length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => {
					setOpen((v) => !v);
				},
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
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: {
							margin: "0 0 10px",
							fontSize: 14
						},
						children: t("panel.overlayTitle")
					}),
					count === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							fontSize: 13,
							color: "var(--dsw-alias-label-tertiary, #888)"
						},
						children: t("panel.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						style: { fontSize: 13 },
						children: [t("panel.sessions"), count]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							setOpen(false);
						},
						style: {
							marginTop: 10,
							padding: "6px 12px",
							fontSize: 13
						},
						children: t("panel.dispatch")
					})
				]
			})] });
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