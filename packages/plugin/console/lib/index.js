window.__ModuleLoader__.load({
	id: "@dsh-external/plugin-console",
	factory: (require) => {
		var exports = { exports: {} }.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/Panel.tsx
		/**
		* 薄控制台面板（UI 对齐官方「模型」设置页设计语言——ModelsSection.module.css）：
		* - section：flex column gap 12 maxWidth 720；title 16/24 500；intro 14/22 tertiary
		* - 插件行：rowCard（border-l2 r12 p12/14）+ rowHead（identity 左 / actions 右，
		*   margin-left auto = 左右对齐）
		* - 按钮：官方 Button（行内 sm h28 r14 dense；主操作 md h36 r18 capsule）
		* - 输入区：editor 卡片（bg-module-platform r12 p14/16）+ field（label 上 /
		*   input 下）+ actions 右对齐（justify-content flex-end）
		* 全部 token 走 --dsw-alias-*；零 CSS 依赖（inline 样式，保持构建链简单）。
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
		const shortSha = (sha) => sha.slice(0, 7);
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
		* repository 插件版本行：cache 版本 + git 远端状态（join /updates 结果）。
		* 「没有更新按钮」由文案自己回答：已最新 / 分支 / 无法检查 / 待检查。
		* 分支 ref 天然最新（每次换代取远端头），不提供「更新」按钮。
		*/
		function repositoryVersionText(plugin, upd) {
			const current = plugin.version === void 0 ? "?" : `v${plugin.version}`;
			const ref7 = plugin.ref === void 0 ? "" : shortSha(plugin.ref);
			if (upd === void 0) return {
				text: `${current} @${ref7} · 待检查`,
				canUpdate: false
			};
			if (upd.error !== void 0) return {
				text: `${current} @${ref7} · 无法检查`,
				canUpdate: false
			};
			if (upd.latestSha === null) return {
				text: `${current} @${ref7} · 未知`,
				canUpdate: false
			};
			if (upd.refKind === "branch") return {
				text: `${current} · 分支 ${upd.ref}@${shortSha(upd.latestSha)}`,
				canUpdate: false
			};
			if (!upd.hasUpdate) return {
				text: `${current} · 已最新 ${ref7}`,
				canUpdate: false
			};
			return {
				text: `${current} · 有更新 ${ref7}→${shortSha(upd.latestSha)}`,
				canUpdate: true
			};
		}
		/** repository 源行的更新状态文本（区 B 源行）。 */
		function updateText(row) {
			if (row.error !== void 0) return "无法检查";
			if (row.latestSha === null) return "未知";
			if (row.refKind === "sha" && !row.hasUpdate) return `已最新 ${shortSha(row.ref)}`;
			if (row.refKind === "sha") return `有更新 ${shortSha(row.ref)}→${shortSha(row.latestSha)}`;
			return `分支 ${row.ref}@${shortSha(row.latestSha)}`;
		}
		/** 设置页面板主体（对齐官方「模型」设置页）。 */
		function ConsolePanel() {
			const [state, setState] = (0, react.useState)({
				repositories: [],
				present: false
			});
			const [installed, setInstalled] = (0, react.useState)([]);
			const [showAll, setShowAll] = (0, react.useState)(false);
			const [input, setInput] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)(void 0);
			const [busy, setBusy] = (0, react.useState)(false);
			const [loading, setLoading] = (0, react.useState)(true);
			const [updates, setUpdates] = (0, react.useState)(void 0);
			const [checking, setChecking] = (0, react.useState)(false);
			const [bundleInput, setBundleInput] = (0, react.useState)("");
			const [bundleBusy, setBundleBusy] = (0, react.useState)(false);
			const [bundleMsg, setBundleMsg] = (0, react.useState)(void 0);
			const [versions, setVersions] = (0, react.useState)({});
			const [versionChecked, setVersionChecked] = (0, react.useState)({});
			const refresh = (0, react.useCallback)(async () => {
				try {
					const [repoRes, installedRes, versionsRes] = await Promise.all([
						fetch("/api/plugin-console/repositories", { headers: { accept: "application/json" } }),
						fetch("/api/plugin-console/installed", { headers: { accept: "application/json" } }),
						fetch("/api/plugin-console/versions", { headers: { accept: "application/json" } })
					]);
					const repoBody = await repoRes.json();
					const installedBody = await installedRes.json();
					const versionsBody = await versionsRes.json();
					setState({
						repositories: repoBody.repositories ?? [],
						present: repoBody.present ?? false
					});
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
			const save = (0, react.useCallback)(async (repositories) => {
				setBusy(true);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/repositories", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ repositories })
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "save failed");
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, [refresh]);
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
			/** 统一检查更新：npm 版本批量查 + repository 远端 commit 批量查（结果共享区 A/B）。 */
			const checkAll = (0, react.useCallback)(async () => {
				setChecking(true);
				setError(void 0);
				try {
					const [versionRes, updatesRes] = await Promise.all([fetch("/api/plugin-console/versions/refresh", {
						method: "POST",
						headers: { accept: "application/json" }
					}), fetch("/api/plugin-console/updates", { headers: { accept: "application/json" } })]);
					const versionBody = await versionRes.json();
					const updatesBody = await updatesRes.json();
					if (updatesBody.ok !== true) throw new Error(updatesBody.message ?? "check failed");
					const map = {};
					const checkedMap = {};
					for (const row of versionBody.versions ?? []) {
						map[row.name] = row.latest;
						checkedMap[row.name] = row.checked === true;
					}
					setVersions(map);
					setVersionChecked(checkedMap);
					setUpdates(updatesBody.updates ?? []);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setChecking(false);
				}
			}, []);
			/** 把指定源的 ref 更新为远端最新 commit（写配置后官方 config HMR 即时换代，无需重启）。 */
			const applyUpdate = (0, react.useCallback)(async (source) => {
				setBusy(true);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/updates", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ source })
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "update failed");
					await refresh();
					await checkAll();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBusy(false);
				}
			}, [refresh, checkAll]);
			const add = (0, react.useCallback)(async () => {
				const value = input.trim();
				if (value.length === 0) return;
				if (!state.repositories.some((r) => r.source === value)) {
					await save([...state.repositories.map((r) => r.source), value]);
					setUpdates(void 0);
				}
				setInput("");
			}, [
				input,
				state.repositories,
				save
			]);
			const remove = (0, react.useCallback)((source) => {
				save(state.repositories.map((r) => r.source).filter((r) => r !== source));
			}, [state.repositories, save]);
			/** bundle 安装（profile 目录 pnpm add + reconcile 层栈）。 */
			const installBundle = (0, react.useCallback)(async () => {
				const source = bundleInput.trim();
				if (source.length === 0) return;
				setBundleBusy(true);
				setBundleMsg(void 0);
				setError(void 0);
				try {
					const body = await (await fetch("/api/plugin-console/bundles", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							action: "install",
							source
						})
					})).json();
					if (body.ok !== true) throw new Error(body.message ?? "install failed");
					setBundleMsg(`已安装并加入层栈：${(body.names ?? []).join(", ") || source}（重启 web 生效）`);
					setBundleInput("");
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBundleBusy(false);
				}
			}, [bundleInput]);
			/** bundle 更新（pnpm update <name>，拉取最新版本）。 */
			const updateBundle = (0, react.useCallback)(async (name) => {
				setBundleBusy(true);
				setBundleMsg(void 0);
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
					setBundleMsg(`${name} 已更新（重启 web 生效）`);
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBundleBusy(false);
				}
			}, []);
			/** bundle 卸载（pnpm remove + 层栈 reconcile；确认弹窗防误触；重启生效）。 */
			const removeBundle = (0, react.useCallback)(async (name) => {
				if (!window.confirm(`卸载 bundle 插件 ${name}？将从 profile 移除依赖与层栈（重启 web 生效）。`)) return;
				setBundleBusy(true);
				setBundleMsg(void 0);
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
					setBundleMsg(`${name} 已卸载（重启 web 生效）`);
					await refresh();
				} catch (caught) {
					setError(caught instanceof Error ? caught.message : String(caught));
				} finally {
					setBundleBusy(false);
				}
			}, [refresh]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			if (loading) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				style: { color: "var(--dsw-alias-label-tertiary)" },
				children: "加载中…"
			});
			const isOfficial = (p) => p.kind !== "repository" && (p.name.startsWith("@deepseek-ai/") || p.name.startsWith("@cordisjs/") || p.name.startsWith("cordis:"));
			const isSelf = (p) => p.name === "@dsh-external/plugin-console";
			const official = installed.filter(isOfficial);
			const user = installed.filter((p) => !isOfficial(p));
			const shown = showAll ? installed : user;
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
						children: [sectionHeader(`已加载插件（${user.length} 用户 / ${official.length} 内置）`, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								disabled: checking,
								onClick: () => {
									checkAll();
								},
								children: checking ? "检查中" : "检查更新"
							}), official.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								size: "sm",
								variant: "outline",
								onClick: () => {
									setShowAll((v) => !v);
								},
								children: showAll ? "只看用户" : `查看全部（${installed.length}）`
							}) : null]
						})), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: rowsStyle,
							children: shown.map((plugin) => {
								const isRepo = plugin.kind === "repository";
								const upd = isRepo ? updates?.find((u) => u.pluginName === plugin.name) : void 0;
								const version = isRepo ? repositoryVersionText(plugin, upd) : versionText(plugin, versions[plugin.name] ?? null, versionChecked[plugin.name] === true);
								const isUserBundle = !isRepo && !official.includes(plugin) && !isSelf(plugin);
								const repoCanUpdate = isRepo && upd?.refKind === "sha" && upd.hasUpdate === true;
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
												isUserBundle && version.canUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy || bundleBusy,
													onClick: () => {
														updateBundle(plugin.name);
													},
													children: "更新"
												}) : null,
												repoCanUpdate && plugin.source !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														applyUpdate(plugin.source);
													},
													children: "更新"
												}) : null,
												isUserBundle ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														togglePlugin(plugin.id, !plugin.disabled);
													},
													children: plugin.disabled ? "启用" : "停用"
												}) : null,
												isUserBundle ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy || bundleBusy,
													onClick: () => {
														removeBundle(plugin.name);
													},
													children: "卸载"
												}) : null,
												official.includes(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "内置" }) : null,
												isSelf(plugin) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "管理工具" }) : null,
												isRepo ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, { children: "repository" }) : null,
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
													active: !plugin.disabled,
													children: plugin.disabled ? "已停用" : "运行中"
												})
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: versionLineStyle,
										children: version.text
									})]
								}, showAll ? `a${plugin.id}` : `u${plugin.id}`);
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: sectionStyle,
						children: [
							sectionHeader("repository 插件源"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: introStyle,
								children: "`.dsh-plugin` 包源列表；添加/移除行 = 装/卸，更新 = 固定到远端最新 commit（改完即生效，无需重启）。未挂载源（刚添加/准备失败）也在此显示状态。"
							}),
							state.repositories.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...introStyle,
									fontSize: 12,
									lineHeight: "18px"
								},
								children: "未配置 repository 插件源。"
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: rowsStyle,
								children: state.repositories.map((row) => {
									const upd = updates?.find((u) => u.source === row.source);
									const canUpdate = upd !== void 0 && upd.refKind === "sha" && upd.hasUpdate === true;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: rowCardStyle,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: rowHeadStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													...identityStyle,
													flexDirection: "column",
													alignItems: "flex-start",
													gap: 4
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														...nameStyle,
														fontFamily: "ui-monospace, monospace",
														fontSize: 13
													},
													children: row.source
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: versionLineStyle,
													children: [
														row.pluginName !== void 0 ? `${row.pluginName} · ` : "",
														row.version !== void 0 ? `v${row.version} · ` : "",
														row.mounted ? "已挂载" : "未挂载",
														upd !== void 0 ? ` · ${updateText(upd)}` : ""
													]
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: actionsStyle,
												children: [canUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														applyUpdate(row.source);
													},
													children: "更新"
												}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													size: "sm",
													variant: "outline",
													disabled: busy,
													onClick: () => {
														remove(row.source);
													},
													children: "移除"
												})]
											})]
										})
									}, row.source);
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: editorStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: fieldStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: fieldLabelStyle,
										htmlFor: "console-repo-source",
										children: "插件源（github:owner/repo#ref）"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										id: "console-repo-source",
										value: input,
										placeholder: "github:owner/repo#ref",
										onChange: (e) => {
											setInput(e.target.value);
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: editorActionsStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy,
										onClick: () => {
											add();
										},
										children: "添加"
									})
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						style: sectionStyle,
						children: [
							sectionHeader("安装 bundle 插件"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: introStyle,
								children: "pnpm add 到 profile 并加入层栈；安装/更新后重启 web 生效。"
							}),
							bundleMsg !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: savedStyle,
								children: bundleMsg
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: editorStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: fieldStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: fieldLabelStyle,
										htmlFor: "console-bundle-source",
										children: "包源"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										id: "console-bundle-source",
										value: bundleInput,
										placeholder: "git+file:///path/to/plugin 或 registry 包名",
										onChange: (e) => {
											setBundleInput(e.target.value);
										}
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: editorActionsStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										size: "sm",
										variant: "outline",
										disabled: busy || bundleBusy,
										onClick: () => {
											installBundle();
										},
										children: bundleBusy ? "安装中" : "安装"
									})
								})]
							})
						]
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
		* 「插件」tab 行替换其 svg 内容。
		*/
		const PLUGIN_TAB_ICON_SVG = "<path fill=\"currentColor\" stroke=\"currentColor\" stroke-width=\"0.5\" stroke-linejoin=\"round\" d=\"M29.81 16H29V8.83a2 2 0 0 0-2-2h-6A5.14 5.14 0 0 0 16.51 2A5 5 0 0 0 11 6.83H4a2 2 0 0 0-2 2V17h2.81A3.13 3.13 0 0 1 8 19.69A3 3 0 0 1 7.22 22A3 3 0 0 1 5 23H2v8.83a2 2 0 0 0 2 2h23a2 2 0 0 0 2-2V26h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 29.81 16m2.41 7A3 3 0 0 1 30 24h-3v7.83H4V25h1a5 5 0 0 0 5-5.51A5.15 5.15 0 0 0 4.81 15H4V8.83h9V7a3 3 0 0 1 1-2.22A3 3 0 0 1 16.31 4A3.13 3.13 0 0 1 19 7.19v1.64h8V18h2.81A3.13 3.13 0 0 1 33 20.69a3 3 0 0 1-.78 2.31\"/>";
		/** 替换设置页导航里「插件」tab 的默认齿轮图标为插头图标（幂等）。 */
		function patchPluginTabIcon() {
			for (const btn of document.querySelectorAll("button")) {
				const host = btn;
				if (host.dataset.dshConsoleIcon === "1") continue;
				if (btn.textContent?.trim() !== "插件") continue;
				const svg = btn.querySelector("svg");
				if (svg === null) continue;
				svg.setAttribute("viewBox", "0 0 36 36");
				svg.setAttribute("fill", "none");
				svg.innerHTML = PLUGIN_TAB_ICON_SVG;
				host.dataset.dshConsoleIcon = "1";
			}
		}
		/** 注册设置页「插件」面板 + 替换 tab 图标（设置页随时打开/关闭，全程监听）。 */
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
				label: () => "插件",
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
