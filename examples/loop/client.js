// acme/loop client bundle（手写等价物，同 examples/navbar / task-status 模式）。
// 数据自造缝：轮询 Node half 的 /plugins/acme/loop/loops 路由（?sessionId= 过滤），
// 经 conversation.input.dock 槽显示活动循环状态条。构建见 README「构建 client bundle」。
window.__ModuleLoader__.load({
	id: "acme/loop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let slots = require("@deepseek-ai/dsh-client-ui-slots");
		//#region src/client/index.tsx
		const LOOPS_PATH = "/plugins/acme/loop/loops";
		const POLL_MS = 1000;
		const NS = "loop";
		const zh = {
			"active": "loop: 每 {interval} — {prompt}",
			"next": "下次 {countdown}"
		};
		const en = {
			"active": "loop: every {interval} — {prompt}",
			"next": "next {countdown}"
		};
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
			return react.createElement("div", {
				"data-loop-bar": "",
				style: {
					display: "flex", alignItems: "center", gap: 6, height: 28,
					margin: "0 auto", padding: "0 12px",
					width: "calc(100% - 2 * var(--dsh-composer-side-clearance, 16px) - 4 * var(--dsh-composer-dock-inset, 8px))",
					maxWidth: "calc(var(--dsh-composer-card-max-width, 780px) - 4 * var(--dsh-composer-dock-inset, 8px))",
					border: "1px solid var(--dsw-alias-border-l1)",
					borderRadius: 10,
					background: "var(--dsw-specific-tip)",
					fontSize: 13,
					fontFamily: "system-ui"
				}
			},
				react.createElement("span", { style: { width: 16, fontSize: 14, lineHeight: "16px", textAlign: "center" } }, "🔁"),
				react.createElement("span", { style: { flex: 1, fontSize: 13, lineHeight: "28px", color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
					t("active", { interval: loop.intervalText, prompt: loop.prompt })),
				react.createElement("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-caption)", whiteSpace: "nowrap" } },
					t("next", { countdown: countdownText })));
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
