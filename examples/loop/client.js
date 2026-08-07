// acme/loop client bundle（手写等价物，同 examples/navbar / task-status 模式）。
// 数据自造缝：轮询 Node half 的 /plugins/acme/loop/loops 路由（?sessionId= 过滤），
// 经 conversation.input.dock 槽显示活动循环状态条；视觉对齐官方 GoalBar。
window.__ModuleLoader__.load({
	id: "acme/loop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let slots = require("@deepseek-ai/dsh-client-ui-slots");
		//#region src/client/index.tsx
		const LOOPS_PATH = "/plugins/acme/loop/loops";
		const POLL_MS = 1000;
		const NS = "loop";
		const zh = {
			"active": "循环中",
			"next": "下次 {countdown}"
		};
		const en = {
			"active": "Looping",
			"next": "next {countdown}"
		};
		const SIDE_CLEARANCE = "var(--dsh-composer-side-clearance, 16px)";
		const DOCK_INSET = "var(--dsh-composer-dock-inset, 8px)";
		const CARD_MAX = "var(--dsh-composer-card-max-width, 780px)";
		function useSessionLoops(sessionId) {
			const [loops, setLoops] = react.useState([]);
			react.useEffect(() => {
				let alive = true;
				const poll = async () => {
					try {
						const res = await fetch(LOOPS_PATH + "?sessionId=" + encodeURIComponent(sessionId), { headers: { accept: "application/json" } });
						if (!res.ok) return;
						const data = await res.json();
						if (alive && Array.isArray(data.loops)) setLoops(data.loops);
					} catch {
						// 瞬态网络错误：保持上一帧，下轮重试。
					}
				};
				void poll();
				const timer = setInterval(() => { void poll(); }, POLL_MS);
				return () => { alive = false; clearInterval(timer); };
			}, [sessionId]);
			return loops;
		}
		function countdownTo(nextTickAt) {
			return Math.max(0, Math.ceil((nextTickAt - Date.now()) / 1000));
		}
		function LoopBar(props) {
			const { t, session } = props;
			const loops = useSessionLoops(session.sessionId);
			const [inChat, setInChat] = react.useState(false);
			react.useEffect(() => {
				const check = () => { setInChat(document.querySelector("[data-chat-flow=\"\"]") !== null); };
				check();
				const observer = new MutationObserver(check);
				observer.observe(document.body, { childList: true, subtree: true });
				return () => { observer.disconnect(); };
			}, []);
			if (!inChat) return null;
			if (loops.length === 0) return null;
			const loop = loops[0];
			if (loop === undefined) return null;
			const countdown = countdownTo(loop.nextTickAt);
			const countdownText = countdown > 0 ? countdown + "s" : "now";
			// 双层 dock 结构（对齐官方 GoalBar / QueueDock）：外层 dock 列负责与
			// 同槽卡片同宽同基准（card cap 减 4 inset，居中），内层 bar 满宽限 max。
			// 直接用 width:100% 会与 queue/todo 卡片的宽度基准错位干涉。
			return react.createElement("div", {
				"data-loop-dock": "",
				style: {
					boxSizing: "border-box",
					width: "calc(100% - 2 * " + SIDE_CLEARANCE + " - 4 * " + DOCK_INSET + ")",
					margin: "0 auto"
				}
			}, react.createElement("div", {
				"data-loop-bar": "",
				style: {
					boxSizing: "border-box", display: "flex", alignItems: "center", gap: 10,
					width: "100%", maxWidth: "calc(" + CARD_MAX + " - 4 * " + DOCK_INSET + ")",
					// 高度由内容撑开（对齐官方 TodoPanel：body padding 上下 6px +
					// 24px 行高 + border ≈ 38px），不设固定 height。
					margin: "0 auto", padding: "6px 12px",
					border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 12,
					background: "var(--dsw-specific-tip)", fontSize: 13, fontFamily: "system-ui"
				}
			},
				// 活动指示：ongoing 像素点 + 循环 icon
				react.createElement("span", { style: { display: "inline-flex", flex: "none", alignItems: "center", gap: 8 } },
					react.createElement(primitives.StateDot, { state: "ongoing", size: 10 }),
					react.createElement("span", { style: { display: "inline-flex", flex: "none", color: "var(--dsw-alias-label-tertiary)" } },
						react.createElement(primitives.IconRefreshOutline16, { size: 14 }))),
				// 状态标签（13/24 medium，与 Todo/Queue 标题同族）
				react.createElement("span", { style: { flex: "none", fontSize: 13, lineHeight: "24px", fontWeight: 500, color: "var(--dsw-alias-label-primary)" } },
					t("active")),
				// prompt：主文本，省略号截断
				react.createElement("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", fontSize: 13, lineHeight: "20px", color: "var(--dsw-alias-label-primary-dimmed)", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
					loop.prompt),
				// 间隔 + 倒计时
				react.createElement("span", { style: { flex: "none", fontSize: 12, lineHeight: "20px", color: "var(--dsw-alias-label-caption)", whiteSpace: "nowrap" } },
					loop.intervalText + " · " + t("next", { countdown: countdownText }))));
		}
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "loop: dictionaries");
			// 0806 slots 契约：注册走 ctx.slots.inject（等待槽声明、随声明坍缩自动移除）。
			ctx.slots.inject("conversation.input.dock", () =>
				ctx.slots.register({ name: "conversation.input.dock", id: "loop", order: 20, locale: NS }, LoopBar));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
