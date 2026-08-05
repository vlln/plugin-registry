window.__ModuleLoader__.load({
	id: "vlln/turn-fold",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/turn-fold.tsx
		const NS = "turn-fold";
		const zh = {
			"fold.summary": "第 {count} 轮执行过程（{tools} 个步骤）",
			"fold.expand": "展开",
			"fold.collapse": "收起"
		};
		const en = {
			"fold.summary": "Turn {count} execution ({tools} steps)",
			"fold.expand": "Expand",
			"fold.collapse": "Collapse"
		};
		/**
		* 原样折叠已结束 turn 的执行过程：一次 turn 完成，把该 turn 的中间过程
		* （工具调用组 + 中间文本）默认折叠成一行；**点击展开后渲染官方原生
		* 内容**（每个 tool 调用、上下文注入、thinking 原样显示）——不是自制
		* 组件替代。
		*
		* 机制：chain 的 elected 组件注入 `fallback`（官方原生渲染，官方
		* scoped-slots 支持）；组件读展开集（默认全折叠）——折叠中渲染折叠行，
		* 展开时渲染 `props.fallback`（原生）。select 始终接管「已结束 turn 的
		* 执行过程」，展开与否由组件层决定，select 保持纯。
		*
		* 聚合策略：折叠态只让该 turn 第一个流内执行过程 item 渲染折叠行、其余
		* 渲染 null；展开态每个执行过程 item 都渲染自己的 fallback——原生 items
		* 原样恢复（tool 调用、上下文注入、thinking 全在）。
		*/
		/** 每 turn 最后一条有内容 assistant 的 seq（= Answer 判别，官方语义的本地复制）。 */
		function lastAssistantSeqs(nodes) {
			const lastByTurn = /* @__PURE__ */ new Map();
			for (const node of nodes) {
				if (node.kind !== "assistant") continue;
				if (!node.blocks.some((b) => (b.kind === "text" || b.kind === "reasoning") && b.text.trim() !== "")) continue;
				lastByTurn.set(node.turn, node.seq);
			}
			return new Set(lastByTurn.values());
		}
		/** 展开集：默认全部折叠（空集），点击折叠行加入 turn 显示原生。 */
		let expanded = /* @__PURE__ */ new Set();
		const expandListeners = /* @__PURE__ */ new Set();
		function toggleExpanded(turn) {
			expanded = new Set(expanded);
			if (expanded.has(turn)) expanded.delete(turn);
			else expanded.add(turn);
			for (const fn of [...expandListeners]) fn();
		}
		const subscribeExpanded = (fn) => {
			expandListeners.add(fn);
			return () => {
				expandListeners.delete(fn);
			};
		};
		function TurnFoldRow(props) {
			const { t, matched, useSession, item, fallback } = props;
			const nodes = useSession((s) => s.nodes);
			const answerSeqs = lastAssistantSeqs(nodes);
			const processSeqs = [];
			for (const node of nodes) {
				if ((node.kind === "assistant" || node.kind === "tool-result" ? node.turn : void 0) !== matched.turn) continue;
				if (node.kind === "tool-result") processSeqs.push(node.seq);
				else if (node.kind === "assistant" && !answerSeqs.has(node.seq) && node.blocks.some((b) => (b.kind === "text" || b.kind === "reasoning") && b.text.trim() !== "")) processSeqs.push(node.seq);
			}
			if (processSeqs.length === 0) return null;
			(0, react.useSyncExternalStore)(subscribeExpanded, () => expanded);
			if (expanded.has(matched.turn)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: fallback });
			if ((item.kind === "tool-group" ? item.results[0].seq : item.node.seq) !== Math.min(...processSeqs)) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					margin: "2px 0",
					fontSize: 13,
					background: "var(--dsw-alias-bg-layer-2, #141414)",
					border: "1px solid var(--dsw-alias-border-l2, #333)",
					borderRadius: 6,
					color: "var(--dsw-alias-text-muted, #999)"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => toggleExpanded(matched.turn),
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
					children: [
						t("fold.summary", {
							count: matched.turn,
							tools: processSeqs.length
						}),
						" ",
						t("fold.expand")
					]
				})
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