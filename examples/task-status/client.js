// vlln/task-status client bundle（手写等价物，同 examples/navbar 模式）。
// 数据自造缝：轮询 Node half 的 /plugins/vlln/task-status/tasks 路由，
// 不依赖 useTasks / task/snapshot 推送帧。构建见 README「构建 client bundle」。
window.__ModuleLoader__.load({
	id: "vlln/task-status",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let slots = require("@deepseek-ai/dsh-client-ui-slots");
		//#region src/client/task-status.tsx
		const TASKS_PATH = "/plugins/vlln/task-status/tasks";
		const OUTPUT_PATH = "/plugins/vlln/task-status/output";
		const POLL_MS = 1000;
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
		const SIDE_CLEARANCE = "var(--dsh-composer-side-clearance, 16px)";
		const DOCK_INSET = "var(--dsh-composer-dock-inset, 8px)";
		const CARD_MAX = "var(--dsh-composer-card-max-width, 780px)";
		// 对齐官方 StateDot（@deepseek-ai/dsh-client-ui-primitives）：4 态语义色 +
		// ongoing 像素追逐动画；颜色由 StateDot 经 --dsw-* token 解析。
		const STATUS_META = {
			running: { state: "ongoing", label: "task.running" },
			stopping: { state: "warning", label: "task.stopping" },
			completed: { state: "done", label: "task.completed" },
			killed: { state: "warning", label: "task.killed" },
			failed: { state: "error", label: "task.failed" }
		};
		function useSessionTasks(sessionId) {
			const [tasks, setTasks] = react.useState([]);
			react.useEffect(() => {
				let alive = true;
				const poll = async () => {
					try {
						const res = await fetch(TASKS_PATH, { headers: { accept: "application/json" } });
						if (!res.ok) return;
						const data = await res.json();
						if (alive && Array.isArray(data.tasks)) setTasks(data.tasks);
					} catch {}
				};
				poll();
				const timer = setInterval(() => { poll(); }, POLL_MS);
				return () => { alive = false; clearInterval(timer); };
			}, [sessionId]);
			return tasks.filter(task => task.ownerSession === sessionId);
		}
		// 手动读取（不用自动轮询）：tasks.read 的游标全局 per-task，自动轮询会
		// 持续消耗官方 task_output 工具的读取增量（竞争同一游标）。
		function useTaskOutput(taskId) {
			const [output, setOutput] = react.useState("");
			const taskIdRef = react.useRef(taskId);
			taskIdRef.current = taskId;
			react.useEffect(() => { setOutput(""); }, [taskId]);
			const readOutput = async () => {
				const current = taskIdRef.current;
				if (current === null) return;
				try {
					const res = await fetch(OUTPUT_PATH + "?id=" + encodeURIComponent(current), { headers: { accept: "application/json" } });
					if (!res.ok) return;
					const data = await res.json();
					if (typeof data.text === "string" && data.text !== "") setOutput(prev => prev + data.text);
				} catch {}
			};
			return { taskOutput: output, readOutput };
		}
		function TaskStatusBar(props) {
			const t = props.t;
			const tasks = useSessionTasks(props.session.sessionId);
			const [inChat, setInChat] = react.useState(false);
			const [open, setOpen] = react.useState(false);
			const [expandedTask, setExpandedTask] = react.useState(null);
			const { taskOutput, readOutput } = useTaskOutput(expandedTask);
			react.useEffect(() => {
				const check = () => { setInChat(document.querySelector('[data-chat-flow=""]') !== null); };
				check();
				const observer = new MutationObserver(check);
				observer.observe(document.body, { childList: true, subtree: true });
				return () => { observer.disconnect(); };
			}, []);
			if (!inChat) return null;
			const active = tasks.filter(task => task.status === "running" || task.status === "stopping");
			const running = active.filter(task => task.status === "running").length;
			if (active.length === 0) return null;
			const statusOf = (status) => STATUS_META[status] || { state: "warning", label: status };
			const pad = (n) => String(n).padStart(2, "0");
			const timeText = (task) => {
				const start = new Date(task.startedAt);
				const time = pad(start.getHours()) + ":" + pad(start.getMinutes()) + ":" + pad(start.getSeconds());
				return task.finishedAt === undefined
					? time + " 起"
					: time + " → " + pad(new Date(task.finishedAt).getHours()) + ":" + pad(new Date(task.finishedAt).getMinutes());
			};
			const row = (task) => {
				const meta = statusOf(task.status);
				const expanded = expandedTask === task.id;
				const body = [
					react.createElement(primitives.StateDot, { key: "g", state: meta.state, size: 10 }),
					react.createElement("span", { key: "l", style: { flex: 1, fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, task.label),
					react.createElement("span", { key: "tm", style: { fontSize: 12, color: "var(--dsw-alias-label-caption)", whiteSpace: "nowrap" } }, timeText(task)),
					react.createElement("span", { key: "st", style: { fontSize: 12, color: meta.color, whiteSpace: "nowrap" } }, t(meta.label))
				];
				const line = react.createElement("div", {
					key: "row",
					style: { display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 12px", borderRadius: 8, cursor: "pointer", background: expanded ? "var(--dsw-alias-interactive-bg-hover)" : undefined },
					onClick: () => setExpandedTask(expanded ? null : task.id)
				}, body);
				const details = expanded
					? react.createElement("div", {
						key: "det",
						style: { padding: "0 12px 8px 34px", fontSize: 12, lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)", display: "flex", flexDirection: "column", gap: 2 }
					}, react.createElement("span", null, "类型：" + task.kind + " · " + timeText(task)), task.detail !== undefined ? react.createElement("span", null, "详情：" + task.detail) : null,
						react.createElement("button", { type: "button", onClick: () => { readOutput(); }, style: { alignSelf: "flex-start", marginTop: 2, padding: "2px 8px", borderRadius: 6, fontSize: 11, lineHeight: "18px", cursor: "pointer", color: "var(--dsw-alias-text-accent)", background: "transparent", border: "1px solid var(--dsw-alias-border-l1)" } }, taskOutput === "" ? "读取输出" : "继续读取"),
						taskOutput !== "" ? react.createElement("pre", { style: { margin: "4px 0 0", padding: "8px 10px", maxHeight: 160, overflowY: "auto", borderRadius: 8, fontSize: 11, lineHeight: "16px", fontFamily: "var(--dsh-code-font-family, ui-monospace, monospace)", background: "var(--dsw-specific-tip)", border: "1px solid var(--dsw-alias-border-l1)", whiteSpace: "pre-wrap", wordBreak: "break-word" } }, taskOutput) : null)
					: null;
				return react.createElement("div", { key: task.id }, line, details);
			};
			const header = react.createElement("div", {
				style: { display: "flex", alignItems: "center", gap: 6, height: 36, padding: "4px 5px 4px 12px", cursor: active.length > 1 ? "pointer" : "default" },
				onClick: active.length > 1 ? () => setOpen(v => !v) : undefined
			}, react.createElement("span", { style: { width: 16, fontSize: 14, lineHeight: "16px", textAlign: "center", color: "var(--dsw-alias-label-tertiary)" } }, "⚙"),
				react.createElement("span", { style: { flex: 1, fontSize: 13, lineHeight: "24px", fontWeight: 500, color: "var(--dsw-alias-label-primary)" } }, t("status.running", { count: running })),
				active.length > 1 ? react.createElement("span", { style: { padding: "0 8px", fontSize: 12, color: "var(--dsw-alias-label-caption)" } }, open ? t("status.close") : t("status.open")) : null);
			const card = (body) => react.createElement("div", {
				"data-task-status-bar": "",
				style: { width: "calc(100% - 2 * " + SIDE_CLEARANCE + " - 4 * " + DOCK_INSET + ")", maxWidth: "calc(" + CARD_MAX + " - 4 * " + DOCK_INSET + ")", margin: "0 auto", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12, background: "var(--dsw-specific-tip)", overflow: "hidden", fontSize: 13, fontFamily: "system-ui" }
			}, body);
			if (active.length === 1) return card(row(active[0]));
			const list = open ? react.createElement("div", { style: { maxHeight: 180, overflowY: "auto", borderTop: "1px solid var(--dsw-alias-border-l1)" } }, active.map(row)) : null;
			return card(react.createElement(react.Fragment, null, header, list));
		}
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "task-status: dictionaries");
			// 0806 slots 契约：注册走 ctx.slots.inject。
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register({ name: "conversation.input.dock", id: "task-status", order: 10, locale: NS }, TaskStatusBar));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
