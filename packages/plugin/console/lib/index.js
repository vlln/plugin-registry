window.__ModuleLoader__.load({
	id: "@vlln/plugin-console",
	factory: (require) => {
		var exports = { exports: {} }.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/Panel.tsx
		/**
		* 薄控制台面板（0811 适配，UI 对齐官方「模型」设置页设计语言）：
		* - 已加载插件：loader 树条目（用户可管理项默认展示，官方内置折叠），
		*   状态三态——运行中 / 预设挂载（host 停用但 agent preset 挂载，0811
		*   preset 通道）/ 已停用
		* - 安装插件：统一入口——输入包名自动 pnpm add + 按 dsh.bundle 声明分流
		*   （bundle → 层栈重启生效；非 bundle → insert 行配置 HMR 实时挂载）
		* 全部 token 走 --dsw-alias-*；零 CSS 依赖（inline 样式）。
		*/
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 12,
			maxWidth: 720,
			color: "var(--dsw-alias-label-primary)"
		};
		const titleStyle = {
			margin: 0,
			fontSize: 16,
			lineHeight: "24px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const introStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const rowsStyle = {
			margin: "12px 0 0",
			padding: 0,
			display: "flex",
			flexDirection: "column",
			gap: 8
		};
		const rowCardStyle = {
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			padding: "12px 14px",
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const rowHeadStyle = {
			display: "flex",
			alignItems: "center",
			gap: 10,
			minHeight: 28
		};
		const identityStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			minWidth: 0,
			flex: 1
		};
		const nameStyle = {
			fontSize: 14,
			lineHeight: "22px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const versionLineStyle = {
			display: "block",
			fontSize: 11,
			lineHeight: "16px",
			color: "var(--dsw-alias-label-tertiary)",
			fontFamily: "ui-monospace, monospace"
		};
		const actionsStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 4,
			marginLeft: "auto"
		};
		const editorStyle = {
			borderRadius: 12,
			background: "var(--dsw-alias-bg-module-platform)",
			padding: "14px 16px",
			display: "flex",
			flexDirection: "column",
			gap: 14
		};
		const fieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		const fieldLabelStyle = {
			fontSize: 12,
			lineHeight: "18px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-secondary)"
		};
		const editorActionsStyle = {
			display: "flex",
			justifyContent: "flex-end",
			gap: 8
		};
		const errorStyle = {
			margin: 0,
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-state-error-primary)"
		};
		const savedStyle = {
			margin: 0,
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-state-success-primary)"
		};
		/** 版本行：v当前 · latest（可更新时高亮）；本地/非 registry 包无 latest。 */
		function versionText(plugin, latest, checked) {
			const current = plugin.version === void 0 ? "?" : `v${plugin.version}`;
			if (!checked) return {
				text: `${current} · 待检查`,
				canUpdate: false
			};
			if (latest === null) return {
				text: `${current} · 本地`,
				canUpdate: false
			};
			if (latest === plugin.version) return {
				text: `${current} · 已最新`,
				canUpdate: false
			};
			return {
				text: `${current} → v${latest}`,
				canUpdate: true
			};
		}
		/**
		* 状态 Pill 三态（0811 preset 通道修正）：
		* - host 挂载 → 运行中
		* - host 停用 + preset 挂载 → 预设挂载（不是「已停用」——模型实际有这工具）
		* - host 停用 + preset 无 → 已停用
		*/
		function statePill(plugin) {
			if (!plugin.disabled) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
				active: true,
				children: "运行中"
			});
			if (plugin.presetMounted === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "预设挂载" });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "已停用" });
		}
		/** 设置页面板主体（对齐官方「模型」设置页）。 */
		function ConsolePanel() {
			const [installed, setInstalled] = (0, react.useState)([]);
			const [showAll, setShowAll] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [loading, setLoading] = (0, react.useState)(true);
			const [installInput, setInstallInput] = (0, react.useState)("");
			const [installBusy, setInstallBusy] = (0, react.useState)(false);
			const [installMsg, setInstallMsg] = (0, react.useState)(void 0);
			const [versions, setVersions] = (0, react.useState)({});
			const [versionChecked, setVersionChecked] = (0, react.useState)({});
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [installedRes, versionsRes] = await Promise.all([fetch("/api/plugin-console/installed", { headers: { accept: "application/json" } }), fetch("/api/plugin-console/versions", { headers: { accept: "application/json" } })]);
					const installedBody = await installedRes.json();
					const versionsBody = await versionsRes.json();
					setInstalled(installedBody.plugins ?? []);
					const map = {};
					const checkedMap = {};
					for (const row of versionsBody.versions ?? []) {
						map[row.name] = row.latest;
						checkedMap[row.name] = row.checked === true;
					}
					setVersions(map);
					setVersionChecked(checkedMap);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setLoading(false);
				}
			}, []);
			/** 运行时启停（loader 树立即生效）+ 写 profile patch 持久化。 */
			const togglePlugin = (0, react.useCallback)(async (id, disabled) => {
				setBusy(true);
				setError(void 0);
				try {
					const body = await (await fetch(`/api/plugin-console/installed/${encodeURIComponent(id)}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ disabled })
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "toggle failed");
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			/** 统一检查更新：npm 版本批量查（结果共享已加载区）。 */
			const checkAll = (0, react.useCallback)(async () => {
				setBusy(true);
				setError(void 0);
				try {
					const versionBody = await (await fetch("/api/plugin-console/versions/refresh", {
						method: "POST",
						headers: { accept: "application/json" }
					})).json();
					const map = {};
					const checkedMap = {};
					for (const row of versionBody.versions ?? []) {
						map[row.name] = row.latest;
						checkedMap[row.name] = row.checked === true;
					}
					setVersions(map);
					setVersionChecked(checkedMap);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, []);
			/** 统一安装：输入包名 → pnpm add → 按 dsh.bundle 分流（bundle 层栈 / insert 行实时）。 */
			const installPlugin = (0, react.useCallback)(async () => {
				const source = installInput.trim();
				if (source.length === 0) return;
				setInstallBusy(true);
				setInstallMsg(void 0);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/install", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ source })
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "install failed");
					setInstallMsg(body.message ?? "已安装");
					setInstallInput("");
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setInstallBusy(false);
				}
			}, [installInput, refresh]);
			/** bundle 更新（pnpm update <name>，拉取最新版本）。 */
			const updateBundle = (0, react.useCallback)(async (name) => {
				setBusy(true);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/bundles", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							action: "update",
							name
						})
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "update failed");
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			/** bundle 卸载（pnpm remove + 层栈 reconcile；确认弹窗防误触；重启生效）。 */
			const removeBundle = (0, react.useCallback)(async (name) => {
				if (!window.confirm(`卸载 bundle 插件 ${name}？将从 profile 移除依赖与层栈（重启 web 生效）。`)) return;
				setBusy(true);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/bundles", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							action: "remove",
							name
						})
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "remove failed");
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			if (loading) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: { color: "var(--dsw-alias-label-tertiary)" },
				children: "加载中…"
			});
			const isOfficial = (p) => p.name.startsWith("@deepseek-ai/") || p.name.startsWith("@cordisjs/") || p.name.startsWith("cordis:");
			const isSelf = (p) => p.name === "@vlln/plugin-console";
			const userRows = installed.filter((p) => !isOfficial(p) && !isSelf(p));
			const officialRows = installed.filter((p) => isOfficial(p));
			const shown = showAll ? installed : userRows;
			const sectionHeader = (title, actions) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 10
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					style: {
						...titleStyle,
						flex: 1,
						margin: 0
					},
					children: title
				}), actions]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 24,
					maxWidth: 720,
					color: "var(--dsw-alias-label-primary)"
				},
				children: [
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle,
						children: error
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: sectionStyle,
						children: [
							sectionHeader("安装插件"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: introStyle,
								children: "输入 npm 包名或 GitHub 项目——自动安装并挂载：bundle 插件（声明 dsh.bundle）加入层栈（重启生效）；非 bundle 插件写 insert 行（配置 HMR 实时挂载，无需重启）。GitHub 项目支持 https://github.com/o/r、github.com/o/r、github:o/r 三种写法。"
							}),
							installMsg !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: savedStyle,
								children: installMsg
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: editorStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: fieldStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: fieldLabelStyle,
										htmlFor: "console-install-source",
										children: "包名 / 源"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										id: "console-install-source",
										value: installInput,
										placeholder: "npm 包名 / https://github.com/o/r / github:o/r",
										onChange: (e) => {
											setInstallInput(e.target.value);
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: editorActionsStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: installBusy,
										onClick: () => {
											installPlugin();
										},
										children: installBusy ? "安装中" : "安装"
									})
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: sectionStyle,
						children: [sectionHeader(`已加载插件（${userRows.length} 用户 / ${officialRows.length} 内置）`, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: busy,
								onClick: () => {
									checkAll();
								},
								children: busy ? "检查中" : "检查更新"
							}), officialRows.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								onClick: () => {
									setShowAll((v) => !v);
								},
								children: showAll ? "只看用户" : `查看全部（${installed.length}）`
							}) : null]
						})), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowsStyle,
							children: [shown.map((plugin) => {
								const version = versionText(plugin, versions[plugin.name] ?? null, versionChecked[plugin.name] === true);
								const isUserRow = !isOfficial(plugin) && !isSelf(plugin);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: rowCardStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: rowHeadStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: identityStyle,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: nameStyle,
												children: plugin.name
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: actionsStyle,
											children: [
												isUserRow && version.canUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														updateBundle(plugin.name);
													},
													children: "更新"
												}) : null,
												isUserRow && plugin.insertRow !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														togglePlugin(plugin.id, !plugin.disabled);
													},
													children: plugin.disabled ? "启用" : "停用"
												}) : null,
												isUserRow && plugin.insertRow !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														removeBundle(plugin.name);
													},
													children: "卸载"
												}) : null,
												isSelf(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "管理工具" }) : null,
												plugin.insertRow === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "insert" }) : null,
												statePill(plugin)
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: versionLineStyle,
										children: version.text
									})]
								}, showAll ? `a${plugin.id}` : `u${plugin.id}`);
							}), shown.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...introStyle,
									fontSize: 12
								},
								children: "未加载任何插件。"
							}) : null]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Cordis 插件名。 */
		const name = "plugin-console-client";
		/** 需要 slots（settings.section 插槽）。 */
		const inject = ["slots"];
		/**
		* 插头图标（plugin-line，参考 Clarity 图标库，dsh 风格：fill
		* currentColor 细条 + 16px 显示；fill+stroke 同色叠加加粗线条
		* 0.5u/36 系 ≈ +22%）——设置页导航的 tab 图标是官方硬编码（仅 models
		* 特例，其余统一齿轮，零扩展点），0 patch 下用 MutationObserver 找到
		* 本控制台自己的「插件管理」tab 行替换其 svg 内容。只匹配自身 tab
		* 文本，绝不动官方「插件」tab（同名误换曾把官方 tab 图标改坏）。
		*/
		const PLUGIN_TAB_ICON_SVG = "<path fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0.5\" stroke-linejoin=\"round\" d=\"M29.81 16H29V8.83a2 2 0 0 0-2-2h-6A5.14 5.14 0 0 0 16.51 2A5 5 0 0 0 11 6.83H4a2 2 0 0 0-2 2V17h2.81A3.13 3.13 0 0 1 8 19.69A3 3 0 0 1 7.22 22A3 3 0 0 1 5 23H2v8.83a2 2 0 0 0 2 2h23a2 2 0 0 0 2-2V26h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 29.81 16m2.41 7A3 3 0 0 1 30 24h-3v7.83H4V25h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 4.81 15H4V8.83h9V7a3 3 0 0 1 1-2.22A3 3 0 0 1 16.31 4A3.13 3.13 0 0 1 19 7.19v1.64h8V18h2.81A3.13 3.13 0 0 1 33 20.69a3 3 0 0 1-.78 2.31\"/>";
		/** 替换设置页导航里本控制台「插件管理」tab 的默认齿轮图标为插头图标（幂等）。 */
		function patchPluginTabIcon() {
			for (const btn of document.querySelectorAll("button")) {
				const host = btn;
				if (host.dataset.dshConsoleIcon === "1") continue;
				if (btn.textContent?.trim() !== "插件管理") continue;
				const svg = btn.querySelector("svg");
				if (svg === null) continue;
				svg.setAttribute("viewBox", "0 0 36 36");
				svg.setAttribute("fill", "none");
				svg.innerHTML = PLUGIN_TAB_ICON_SVG;
				host.dataset.dshConsoleIcon = "1";
			}
		}
		/** 注册设置页「插件管理」面板 + 替换自身 tab 图标（设置页随时打开/关闭，全程监听）。 */
		function apply(ctx) {
			new MutationObserver(patchPluginTabIcon).observe(document.body, {
				childList: true,
				subtree: true
			});
			patchPluginTabIcon();
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "plugin-console",
				order: 60,
				label: () => "插件管理",
				inject: () => ({})
			}, ConsolePanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return exports;
	}
});
