import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { parse, stringify } from "yaml";
//#region src/discovery/store.ts
/**
* 发现层存储（0811 适配）：`$DSH_HOME/plugin-sources/` 域根读写——
* sources.yml（索引源集合，唯一配置入口）＋lock.yml（TOFU：resolved
* 引用）＋cache/<source-id>/（每源枚举快照，派生数据）。配置与派生分离。
*
* 命名 `plugin-sources/` 而非 `plugins/`：后者与旧 registry 的
* `~/.dsh/plugins/` 安装目录同名易混。删目录即重置发现层，不影响安装态
* （安装态在 profile 的 package.json bundles 与 cordis.patch.yml）。
*/
const DISCOVERY_ROOT = "plugin-sources";
const SOURCES_FILE = "sources.yml";
const LOCK_FILE = "lock.yml";
const CACHE_DIR = "cache";
const ENTRIES_FILE = "entries.json";
const TRUST_LEVELS = /* @__PURE__ */ new Set([
	"official",
	"community",
	"untrusted"
]);
/** 发现层域根。 */
function discoveryRoot(dshHome) {
	return join(dshHome, DISCOVERY_ROOT);
}
function sourcesPath(dshHome) {
	return join(discoveryRoot(dshHome), SOURCES_FILE);
}
function lockPath(dshHome) {
	return join(discoveryRoot(dshHome), LOCK_FILE);
}
function cacheDir(dshHome, sourceId) {
	return join(discoveryRoot(dshHome), CACHE_DIR, sourceId);
}
function cacheEntriesPath(dshHome, sourceId) {
	return join(cacheDir(dshHome, sourceId), ENTRIES_FILE);
}
function ensureDir(dir) {
	mkdirSync(dir, { recursive: true });
}
function readText(file) {
	if (!existsSync(file)) return null;
	return readFileSync(file, "utf8");
}
/** 源集合：读 sources.yml。文件不存在 → 空列表；非法结构 → 明确错误。 */
function readSources(dshHome) {
	const text = readText(sourcesPath(dshHome));
	if (text === null) return [];
	let parsed;
	try {
		parsed = parse(text);
	} catch (error) {
		throw new Error(`plugin-sources: ${SOURCES_FILE} is not valid YAML: ${String(error)}`);
	}
	if (parsed === null || parsed === void 0) return [];
	const root = parsed.sources;
	if (!Array.isArray(root)) throw new Error(`plugin-sources: ${SOURCES_FILE} must be a YAML object with a "sources" list`);
	return root.map((raw, i) => normalizeSource(raw, i));
}
/** 校验并规整一个源条目（0811 仅 index 一种）。 */
function normalizeSource(raw, index) {
	const r = raw ?? {};
	if (typeof r.id !== "string" || r.id.trim() === "") throw new Error(`plugin-sources: sources[${index}] missing string "id"`);
	if (r.kind !== void 0 && r.kind !== "index") throw new Error(`plugin-sources: sources[${index}] ("${r.id}") kind must be index (repository sources removed in 0811)`);
	if (typeof r.locator !== "string" || r.locator.trim() === "") throw new Error(`plugin-sources: sources[${index}] ("${r.id}") missing string "locator"`);
	if (r.trust !== void 0 && (typeof r.trust !== "string" || !TRUST_LEVELS.has(r.trust))) throw new Error(`plugin-sources: sources[${index}] ("${r.id}") trust must be one of official|community|untrusted`);
	return {
		id: r.id.trim(),
		kind: "index",
		locator: r.locator.trim(),
		trust: r.trust ?? "community"
	};
}
/** 写 sources.yml（原子：重建整个文件；失败抛错）。 */
function writeSources(dshHome, sources) {
	const root = { sources: sources.map((s) => ({
		id: s.id,
		kind: s.kind,
		locator: s.locator,
		...s.trust !== "community" ? { trust: s.trust } : {}
	})) };
	const text = stringify(root);
	ensureDir(discoveryRoot(dshHome));
	writeFileSync(sourcesPath(dshHome), text);
}
/** 源集合：按 id 取源；不存在返回 undefined。 */
function findSource(sources, id) {
	return sources.find((s) => s.id === id);
}
/** 源集合：追加或替换（按 id）。 */
function upsertSource(sources, source) {
	return [...sources.filter((s) => s.id !== source.id), source];
}
/** TOFU 锁：读 lock.yml。文件不存在 → 空；非法结构 → 明确错误。 */
function readLock(dshHome) {
	const text = readText(lockPath(dshHome));
	if (text === null) return [];
	let parsed;
	try {
		parsed = parse(text);
	} catch (error) {
		throw new Error(`plugin-sources: ${LOCK_FILE} is not valid YAML: ${String(error)}`);
	}
	if (parsed === null || parsed === void 0) return [];
	const root = parsed.locks;
	if (!Array.isArray(root)) throw new Error(`plugin-sources: ${LOCK_FILE} must be a YAML object with a "locks" list`);
	return root.map((raw, i) => {
		const r = raw ?? {};
		if (typeof r.canonical !== "string" || r.canonical.trim() === "") throw new Error(`plugin-sources: locks[${i}] missing string "canonical"`);
		if (r.kind !== "bundle" && r.kind !== "plugin") throw new Error(`plugin-sources: locks[${i}] ("${r.canonical}") kind must be bundle|plugin`);
		if (typeof r.ref !== "string" || r.ref.trim() === "") throw new Error(`plugin-sources: locks[${i}] ("${r.canonical}") missing string "ref"`);
		return {
			canonical: r.canonical.trim(),
			kind: r.kind,
			ref: r.ref.trim(),
			hash: typeof r.hash === "string" ? r.hash : void 0,
			recordedAt: typeof r.recordedAt === "string" ? r.recordedAt : (/* @__PURE__ */ new Date()).toISOString()
		};
	});
}
/** 写 lock.yml。 */
function writeLock(dshHome, locks) {
	const root = { locks };
	ensureDir(discoveryRoot(dshHome));
	writeFileSync(lockPath(dshHome), stringify(root));
}
/** 按 canonical 取锁；不存在返回 undefined。 */
function findLock(locks, canonical) {
	return locks.find((l) => l.canonical === canonical);
}
/** 追加或替换（按 canonical）。 */
function upsertLock(locks, lock) {
	return [...locks.filter((l) => l.canonical !== lock.canonical), lock];
}
/** 每源枚举快照：读 cache/<source-id>/entries.json；不存在 → null。 */
function readSnapshot(dshHome, sourceId) {
	const text = readText(cacheEntriesPath(dshHome, sourceId));
	if (text === null) return null;
	try {
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed.entries)) throw new Error("entries must be a list");
		return parsed;
	} catch (error) {
		throw new Error(`plugin-sources: cache/${sourceId}/entries.json is not valid: ${String(error)}`);
	}
}
/** 写枚举快照（按源分目录；派生数据，机器产物）。 */
function writeSnapshot(dshHome, sourceId, snapshot) {
	ensureDir(cacheDir(dshHome, sourceId));
	writeFileSync(cacheEntriesPath(dshHome, sourceId), JSON.stringify(snapshot, null, 2));
}
/** 快照是否新鲜（未超过 TTL）。 */
function snapshotFresh(snapshot, ttlMs, now = Date.now()) {
	const fetched = Date.parse(snapshot.fetchedAt);
	if (Number.isNaN(fetched)) return false;
	return now - fetched < ttlMs;
}
/** 解析 github 仓库 URL（https://github.com/o/r.git 或裸 https://github.com/o/r）。 */
function parseGithubUrl(url) {
	const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
	if (m === null) return null;
	return {
		owner: m[1],
		repo: m[2].replace(/\.git$/, "")
	};
}
const defaultFetch = async (url, init) => {
	const res = await fetch(url, init);
	return {
		ok: res.ok,
		status: res.status,
		etag: res.headers.get("etag"),
		text: () => res.text(),
		json: () => res.json()
	};
};
/** hub catalog 仓库条目 → 统一插件条目。 */
function hubRepoToPlugin(raw, sourceId) {
	const name = typeof raw.name === "string" ? raw.name : null;
	const url = typeof raw.url === "string" ? raw.url : null;
	if (name === null || url === null) return null;
	const gh = parseGithubUrl(url);
	if (gh === null) return null;
	const description = typeof raw.description === "string" ? raw.description : void 0;
	const isBundle = raw.bundle === true;
	const faces = [];
	if (raw.skill === true) faces.push("skill");
	if (isBundle) faces.push("bundle");
	return {
		id: name,
		kind: isBundle ? "bundle" : "plugin",
		source: `github:${gh.owner}/${gh.repo}`,
		faces,
		description,
		sourceId
	};
}
/**
* index 源枚举：读 hub catalog JSON（locator = URL 或本地文件路径），
* 条目转换，写快照。有新鲜快照 → 直接返回（不网络）；过期 → 拉取（带
* ETag 条件刷新，304 时保留 entries 仅更新 fetchedAt）。
*
* locator 支持 file:///path 或裸本地路径（读文件，零网络——本机经 hub
* clone 的 catalog.json 走此通道）。
*/
async function enumerateIndex(dshHome, source, opts = {}) {
	const now = opts.now ?? Date.now();
	const cached = readSnapshot(dshHome, source.id);
	if (cached !== null && !opts.refresh && snapshotFresh(cached, 216e5, now)) return cached;
	const filePath = source.locator.replace(/^file:\/\//, "");
	if (source.locator.startsWith("file:") || !/^https?:/i.test(source.locator) && existsSync(filePath)) {
		const { readFileSync } = await import("node:fs");
		let body;
		try {
			body = JSON.parse(readFileSync(filePath, "utf8"));
		} catch (error) {
			throw new Error(`plugin-sources: index "${source.id}" local file unreadable (${filePath}): ${String(error)}`);
		}
		const entries = (Array.isArray(body.repos) ? body.repos : []).map((p) => hubRepoToPlugin(p ?? {}, source.id)).filter((e) => e !== null);
		const snapshot = {
			fetchedAt: new Date(now).toISOString(),
			entries
		};
		writeSnapshot(dshHome, source.id, snapshot);
		return snapshot;
	}
	const fetchImpl = opts.fetch ?? defaultFetch;
	const headers = {};
	if (cached?.etag !== void 0 && !opts.refresh) headers["If-None-Match"] = cached.etag;
	const res = await fetchImpl(source.locator, { headers });
	if (res.status === 304 && cached !== null) {
		const refreshed = {
			fetchedAt: new Date(now).toISOString(),
			etag: cached.etag,
			entries: cached.entries
		};
		writeSnapshot(dshHome, source.id, refreshed);
		return refreshed;
	}
	if (!res.ok) throw new Error(`plugin-sources: index "${source.id}" fetch failed (${res.status}): ${source.locator}`);
	const body = await res.json();
	const entries = (Array.isArray(body.repos) ? body.repos : []).map((p) => hubRepoToPlugin(p ?? {}, source.id)).filter((e) => e !== null);
	const snapshot = {
		fetchedAt: new Date(now).toISOString(),
		etag: res.etag ?? void 0,
		entries
	};
	writeSnapshot(dshHome, source.id, snapshot);
	return snapshot;
}
/** 按源类型分发枚举（0811 仅 index）。 */
async function enumerateSource(dshHome, source, opts = {}) {
	return enumerateIndex(dshHome, source, opts);
}
//#endregion
//#region src/discovery/tools.ts
/**
* 插件管理工具（plugin_* ×4）：agent 的插件发现与安装面（0811 适配）。
* 0811 移除 repository-plugins 机制后，外部插件只有 profile bundle 一条
* 官方路径，安装态 = profile 的 `dsh.profile.bundles`（bundle 插件，
* pnpm add + reconcile）＋ profile `cordis.patch.yml` 的 insert 行
* （非 bundle 插件，配置 HMR 实时挂载，无需重启）。
*
* - plugin_search：搜源集合（默认 hub catalog 索引；给定新源 → 懒加载
*   探测并入 sources.yml）
* - plugin_install：bundle 源 → pnpm add + reconcile bundles 层；
*   非 bundle（npm 包）→ pnpm add + 写 profile patch insert 行（配置
*   HMR 实时挂载）；TOFU 固化 resolved ref 到 lock.yml
* - plugin_uninstall：删安装态行（bundle 移除依赖 + 层栈；insert 行移除）
* - plugin_status：无参 list 安装态；有参单查（含 lock 固化 ref）
*
* first-index：安装源即身份，不跨源合并候选池。依赖注入（deps），
* 避免与 index.ts 循环依赖。
*/
/** 统一插件条目输出（JSON Schema）。 */
const PLUGIN_ITEM = {
	type: "object",
	additionalProperties: false,
	properties: {
		id: {
			type: "string",
			required: true
		},
		kind: {
			type: "string",
			required: true,
			enum: ["bundle", "plugin"]
		},
		source: {
			type: "string",
			required: true
		},
		faces: {
			type: "array",
			items: { type: "string" },
			required: true
		},
		description: { type: "string" },
		sourceId: {
			type: "string",
			required: true
		}
	}
};
function pluginItemView(entry, trust) {
	return {
		id: entry.id,
		kind: entry.kind,
		source: entry.source,
		faces: entry.faces,
		...entry.description !== void 0 ? { description: entry.description } : {},
		sourceId: entry.sourceId,
		...trust !== void 0 ? { trust } : {}
	};
}
function renderPlugins(_args, value) {
	const lines = value.plugins.map((p) => {
		const trust = p.trust !== void 0 ? ` [${p.trust}]` : "";
		const faces = p.faces.length > 0 ? ` · ${p.faces.join("/")}` : "";
		const desc = p.description !== void 0 ? ` — ${p.description}` : "";
		return `- ${p.id}${trust} (${p.kind}${faces}) ${p.source}${desc}`;
	});
	return [{
		type: "text",
		text: lines.length > 0 ? lines.join("\n") : "(no plugins found)"
	}];
}
/** id 匹配：支持完整 canonical 或短仓库名。 */
function matchesId(canonical, id) {
	const key = id.trim().toLowerCase();
	return canonical === key || canonical.endsWith(`/${key}`) || canonical.split("/").pop() === key;
}
/** 从 search 的 source 参数推断源类型（新源懒加载）。 */
function inferSource(arg) {
	const id = `custom-${Date.now()}`;
	if (/^file:\/\//.test(arg) || /^https?:\/\//i.test(arg) || existsSync(arg)) return {
		id,
		kind: "index",
		locator: arg,
		trust: "community"
	};
	return {
		id,
		kind: "index",
		locator: "",
		trust: "community"
	};
}
function createPluginTools(deps) {
	return [
		defineTool({
			name: "plugin_search",
			description: "Search installable DSH plugins. Without `source`, searches every registered source (sources at $DSH_HOME/plugin-sources/sources.yml, enumeration cached; the default source is the dsh-external hub catalog). With `source`, probes that source — an index JSON file/URL (hub catalog format: {\"repos\": [...]}) is probed lazily and remembered for later searches. Results carry the owning source and trust level.",
			parameters: {
				query: {
					type: "string",
					description: "Substring to match against plugin id or description. Empty returns all."
				},
				source: {
					type: "string",
					description: "A registered source id, or a new source (an index JSON file/URL) to probe and remember."
				},
				refresh: {
					type: "boolean",
					description: "Force re-enumeration, ignoring cached snapshots."
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: { plugins: {
						type: "array",
						items: PLUGIN_ITEM,
						required: true
					} }
				},
				render: renderPlugins
			},
			async execute(args) {
				const home = deps.dshHome();
				const sources = readSources(home);
				let snapshots = [];
				if (args.source !== void 0 && args.source !== "") {
					const matched = findSource(sources, args.source);
					const target = matched ?? inferSource(args.source);
					if (target.locator === "") {
						if (matched === void 0) writeSources(home, upsertSource(sources, {
							...target,
							locator: args.source
						}));
						return { plugins: [] };
					}
					snapshots = [await enumerateSource(home, target, { refresh: args.refresh === true })];
					if (matched === void 0) writeSources(home, upsertSource(sources, target));
				} else for (const src of sources) snapshots.push(await enumerateSource(home, src, { refresh: args.refresh === true }));
				const query = (args.query ?? "").trim().toLowerCase();
				return { plugins: snapshots.flatMap((snap) => snap.entries).map((entry) => {
					return pluginItemView(entry, findSource(sources, entry.sourceId)?.trust);
				}).filter((p) => {
					if (query === "") return true;
					return p.id.toLowerCase().includes(query) || (p.description ?? "").toLowerCase().includes(query);
				}) };
			}
		}),
		defineTool({
			name: "plugin_install",
			description: "Install a DSH plugin. 0811 removed repository plugins; the only official path is the web profile. A bundle plugin (npm package whose manifest declares dsh.bundle) is added via pnpm to the profile and joins dsh.profile.bundles (takes effect on web restart). A non-bundle plugin (plain npm package with a cordis apply) is added via pnpm AND written as an insert row into the profile cordis.patch.yml, which the config HMR applies live — no restart needed. The resolved ref is recorded (TOFU) in $DSH_HOME/plugin-sources/lock.yml.",
			parameters: { source: {
				type: "string",
				required: true,
				description: "Install source: an npm package name (bundle or plain plugin)."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						canonical: {
							type: "string",
							required: true
						},
						kind: {
							type: "string",
							required: true,
							enum: ["bundle", "plugin"]
						},
						needsRestart: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => [{
					type: "text",
					text: value.message
				}]
			},
			async execute(args) {
				const home = deps.dshHome();
				const source = args.source.trim();
				if (source === "") throw new Error("plugin_install: source must be a non-empty package name");
				if (deps.bundleInstall === void 0) throw new Error(`plugin_install: bundle install support unavailable (web profile required)`);
				deps.bundleInstall(source);
				if (deps.isBundlePackage?.(source) === true) {
					writeLock(home, upsertLock(readLock(home), {
						canonical: source,
						kind: "bundle",
						ref: source,
						recordedAt: (/* @__PURE__ */ new Date()).toISOString()
					}));
					return {
						ok: true,
						canonical: source,
						kind: "bundle",
						needsRestart: true,
						message: `plugin_install: bundle ${source} added to the profile layer stack — restart the web app to load it.`
					};
				}
				const rowId = source.replace(/^@/, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
				deps.writeInsertRow(rowId, source);
				writeLock(home, upsertLock(readLock(home), {
					canonical: source,
					kind: "plugin",
					ref: source,
					recordedAt: (/* @__PURE__ */ new Date()).toISOString()
				}));
				return {
					ok: true,
					canonical: source,
					kind: "plugin",
					needsRestart: false,
					message: `plugin_install: plugin ${source} installed and mounted live (insert row ${rowId}) — config HMR applied it without a restart.`
				};
			}
		}),
		defineTool({
			name: "plugin_uninstall",
			description: "Remove an installed DSH plugin. A bundle plugin is removed from the profile dependencies (pnpm remove + layer-stack reconcile; takes effect on web restart). A non-bundle plugin is removed by deleting its insert row from the profile cordis.patch.yml (config HMR applies live). The source stays in plugin-sources (it can be reinstalled).",
			parameters: { id: {
				type: "string",
				required: true,
				description: "Plugin id (npm package name or insert-row id) to remove."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						ok: {
							type: "boolean",
							required: true
						},
						message: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => [{
					type: "text",
					text: value.message
				}]
			},
			async execute(args) {
				const id = args.id.trim();
				if (deps.removeInsertRow(id)) return {
					ok: true,
					message: `plugin_uninstall: removed plugin insert row "${id}" (live via config HMR)`
				};
				if (deps.bundleRemove !== void 0) {
					const result = deps.bundleRemove(id);
					if (result !== null) return {
						ok: true,
						message: `plugin_uninstall: removed bundle "${id}" (${result.names.join(", ") || "dependencies removed"}) — restart the web app to fully unload it.`
					};
				}
				throw new Error(`plugin_uninstall: "${id}" is not an installed plugin (no insert row, no bundle dependency)`);
			}
		}),
		defineTool({
			name: "plugin_status",
			description: "Show installed DSH plugins. Lists every installed plugin: insert rows (from the profile cordis.patch.yml, live-mounted non-bundle plugins) plus profile bundle layers (from the web profile manifest dsh.profile.bundles), each with its TOFU-resolved ref from lock.yml.",
			parameters: { id: {
				type: "string",
				description: "Plugin id or package name to inspect."
			} },
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: { plugins: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								canonical: {
									type: "string",
									required: true
								},
								kind: {
									type: "string",
									required: true,
									enum: ["bundle", "plugin"]
								},
								ref: { type: "string" },
								resolved: { type: "string" }
							}
						}
					} }
				},
				render: (_args, value) => {
					const lines = value.plugins.map((p) => {
						const ref = p.ref !== void 0 ? `#${p.ref}` : "";
						const resolved = p.resolved !== void 0 ? ` (resolved ${p.resolved})` : "";
						return `- ${p.canonical} (${p.kind})${ref}${resolved}`;
					});
					return [{
						type: "text",
						text: lines.length > 0 ? lines.join("\n") : "(no installed plugins)"
					}];
				}
			},
			async execute(args) {
				const locks = readLock(deps.dshHome());
				const rows = [];
				for (const row of deps.readInsertRows()) {
					const lock = findLock(locks, row.name);
					rows.push({
						canonical: row.name,
						kind: "plugin",
						...lock !== void 0 ? { resolved: lock.ref } : {}
					});
				}
				if (args.id !== void 0 && args.id !== "") {
					const hit = rows.filter((p) => matchesId(p.canonical, args.id));
					if (hit.length === 0) throw new Error(`plugin_status: "${args.id}" is not installed`);
					return { plugins: hit };
				}
				return { plugins: rows };
			}
		})
	];
}
//#endregion
//#region src/index.ts
/**
* 薄控制台 Node half（0811 适配）：读写 web profile 的安装态——
* ① `dsh.profile.bundles`（bundle 插件，pnpm add/reconcile）；
* ② profile `cordis.patch.yml` 的 insert 行（非 bundle 插件，配置 HMR
* 实时挂载，无需重启）；③ 同文件的 disabled 标记（启停持久化）。
* 经 webServer 提供 `/api/plugin-console` 路由供浏览器面板调用。
*
* 0 patch：完全官方机制——glue 插件经 bundle 挂载，安装态是官方
* HMR-watched 的 profile 用户 patch 层 + 官方 bundle 层栈。
*/
/** 解析 resolveDshHome（官方 dsh-paths）。 */
function resolveDshHome() {
	return process.env.DSH_HOME?.trim() !== "" && process.env.DSH_HOME !== void 0 ? process.env.DSH_HOME : join(homedir(), ".dsh");
}
/** 当前 profile（web 默认）目录。 */
function profileWebDir() {
	return join(resolveDshHome(), "profiles", "web");
}
/** 当前 profile 的 cordis.patch.yml（用户 patch 层，配置 HMR watched）。 */
function profilePatchPath() {
	return join(profileWebDir(), "cordis.patch.yml");
}
/**
* 读 profile patch 的全部 insert 行：解析顶层 `- insert:` 块下的
* `- id: <id>` / `name: <pkg>` 对（简化行级解析，与 0810 同策略）。
*/
function readInsertRows() {
	const file = profilePatchPath();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		return [];
	}
	const rows = [];
	const lines = content.split("\n");
	let inInsert = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === "insert:" || trimmed.startsWith("- insert:")) {
			inInsert = true;
			continue;
		}
		if (!inInsert) continue;
		if (/^- id:/.test(trimmed) && !line.startsWith("    ")) {
			inInsert = false;
			continue;
		}
		const idMatch = /^(\s*)- id:\s*([^\s]+)/.exec(line);
		if (idMatch === null) continue;
		let name;
		for (let j = i + 1; j < lines.length; j += 1) {
			const next = lines[j];
			if (/^(\s*)- id:/.test(next) && !next.startsWith("    ")) break;
			const nameMatch = /name:\s*(.+)/.exec(next.trim());
			if (nameMatch !== null) {
				name = nameMatch[1].trim().replace(/^['"]|['"]$/g, "");
				break;
			}
		}
		rows.push({
			id: idMatch[2],
			name: name ?? idMatch[2]
		});
	}
	return rows;
}
/**
* 写一个 insert 行（新增或按 id 更新 name）。保留文件其余内容；
* 文件为 `[]` 模板时重建为带 insert 块的列表。写后配置 HMR 实时挂载。
*/
function writeInsertRow(id, name) {
	const file = profilePatchPath();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		content = "[]\n";
	}
	const significant = content.split("\n").filter((l) => l.trim() !== "[]" && l.trim() !== "");
	if (readInsertRows().some((r) => r.id === id)) {
		let inInsert = false;
		const out = [];
		for (let i = 0; i < significant.length; i += 1) {
			const line = significant[i];
			const trimmed = line.trim();
			if (trimmed === "insert:" || trimmed.startsWith("- insert:")) {
				inInsert = true;
				out.push(line);
				continue;
			}
			if (inInsert && /^- id:/.test(trimmed) && !line.startsWith("    ")) inInsert = false;
			const idMatch = inInsert ? /^(\s*)- id:\s*([^\s]+)/.exec(line) : null;
			if (idMatch !== null && idMatch[2] === id) {
				out.push(line);
				const indent = idMatch[1];
				let replaced = false;
				for (let j = i + 1; j < significant.length; j += 1) {
					const next = significant[j];
					if (/^(\s*)- id:/.test(next.trim()) && !next.startsWith("    ")) break;
					if (/name:/.test(next.trim())) {
						out.push(`${indent}  name: '${name}'`);
						replaced = true;
						significant[j] = "";
						break;
					}
				}
				if (!replaced) out.push(`${indent}  name: '${name}'`);
				continue;
			}
			out.push(line);
		}
		writeFileSync(file, `${out.filter((l) => l !== "").join("\n")}\n`);
		return;
	}
	significant.push("", "- insert:");
	significant.push(`    - id: ${id}`);
	significant.push(`      name: '${name}'`);
	writeFileSync(file, `${significant.join("\n")}\n`);
	console.log(`[plugin-console] wrote insert row ${id} (${name}) to ${file}`);
}
/** 按 id 移除 insert 行；不存在返回 false。空掉的 insert 块一并删除。 */
function removeInsertRow(id) {
	const file = profilePatchPath();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		return false;
	}
	if (!readInsertRows().some((r) => r.id === id)) return false;
	const lines = content.split("\n");
	const out = [];
	let removed = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed === "insert:" || trimmed.startsWith("- insert:")) {
			const block = [];
			block.push(line);
			i += 1;
			for (; i < lines.length; i += 1) {
				const next = lines[i];
				if (/^(\s*)- id:/.test(next.trim()) && !next.startsWith("    ")) {
					i -= 1;
					break;
				}
				const idMatch = /^(\s*)- id:\s*([^\s]+)/.exec(next);
				if (idMatch !== null && idMatch[2] === id) {
					removed = true;
					for (let j = i + 1; j < lines.length; j += 1) {
						const after = lines[j];
						if (/^(\s*)- id:/.test(after.trim()) && !after.startsWith("    ")) break;
						i = j;
					}
					continue;
				}
				block.push(next);
			}
			if (block.some((l) => /^(\s*)- id:\s*/.test(l))) out.push(...block);
			continue;
		}
		out.push(line);
	}
	const text = out.some((l) => /^- id:/.test(l.trim()) || /^- insert:/.test(l.trim()) || /^insert:/.test(l.trim())) ? `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n` : "# Your patch layer for this dsh profile, applied after every bundle layer:\n# a top-level YAML array of loader patch entries (id-targeted config\n# overrides, disables, and insert lists; `!!js` expressions allowed).\n[]\n";
	writeFileSync(file, text);
	console.log(`[plugin-console] removed insert row ${id} from ${file}`);
	return removed;
}
/**
* 设置一个 Loader 树插件的 disabled 状态。保留其他行，只改目标行的
* disabled 字段（新增或移除 `  disabled: true/false`）。
*/
function writeUiPluginDisabled(id, disabled) {
	const file = profilePatchPath();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		content = "";
	}
	const significant = content.split("\n").filter((l) => l.trim() !== "[]");
	let targetLine = -1;
	let targetIndent = "";
	for (let i = 0; i < significant.length; i += 1) {
		const match = /^- id:\s*([^\s]+)/.exec(significant[i].trim());
		if (match !== null && match[1] === id) {
			targetLine = i;
			targetIndent = /^(\s*)-/.exec(significant[i])?.[1] ?? "";
			break;
		}
	}
	if (targetLine === -1) {
		significant.push(`${targetIndent}- id: ${id}`);
		significant.push(`${targetIndent}  disabled: ${String(disabled)}`);
	} else {
		let disabledLine = -1;
		for (let j = targetLine + 1; j < significant.length; j += 1) {
			const next = significant[j];
			if (next.trimStart().startsWith("- id:")) break;
			if (/disabled:\s*(true|false)/.test(next.trim())) {
				disabledLine = j;
				break;
			}
		}
		if (disabledLine === -1) significant.splice(targetLine + 1, 0, `${targetIndent}  disabled: ${String(disabled)}`);
		else significant[disabledLine] = `${targetIndent}  disabled: ${String(disabled)}`;
	}
	writeFileSync(file, `${significant.join("\n").trimEnd()}\n`);
	console.log(`[plugin-console] set ${id} disabled=${String(disabled)} in ${file}`);
}
/** 读 profile 清单（package.json）。 */
function readProfileManifest() {
	try {
		return JSON.parse(readFileSync(join(profileWebDir(), "package.json"), "utf8"));
	} catch {
		return {};
	}
}
/** 写回 profile 清单。 */
function writeProfileManifest(manifest) {
	writeFileSync(join(profileWebDir(), "package.json"), `${JSON.stringify(manifest, void 0, 2)}\n`);
}
/**
* 解析 pnpm add 后 profile 依赖里的真实包名：源串可能是指向路径/git 的
* 安装源（`/path/to/pkg`、`github:o/r#ref`），而依赖 key 才是包名
* （pnpm 按包的真实 name 写入 package.json）。先精确匹配，再回退到
* 依赖值包含源串的 key。找不到返回 null。
*/
function resolveInstalledName(source) {
	const deps = readProfileManifest().dependencies ?? {};
	if (typeof deps[source] === "string") return source;
	return Object.keys(deps).find((key) => deps[key] === source || deps[key]?.includes(source)) ?? null;
}
/** 已安装包是否声明 dsh.bundle（profile 层候选）。 */
function exportsBundlePatch(packageName) {
	try {
		return JSON.parse(readFileSync(join(profileWebDir(), "node_modules", packageName, "package.json"), "utf8")).dsh?.bundle?.patch !== void 0;
	} catch {
		return false;
	}
}
/**
* 复刻官方 dsh plugin 的 reconcile：按已安装状态把声明 dsh.bundle 的依赖
* 加入 `dsh.profile.bundles` 层栈；已从依赖移除或失去声明的包离开层栈。
* @returns 新增的层（调用方用于回显）。
*/
function reconcileBundles(added, beforeManifest) {
	const before = beforeManifest ?? readProfileManifest();
	const beforeDeps = new Set(Object.keys(before.dependencies ?? {}));
	const manifest = readProfileManifest();
	const dependencies = Object.keys(manifest.dependencies ?? {});
	const dependencySet = new Set(dependencies);
	const bundles = manifest.dsh?.profile?.bundles ?? [];
	const joined = [];
	for (const packageName of dependencies) if (exportsBundlePatch(packageName) && !bundles.includes(packageName)) {
		bundles.push(packageName);
		if (!added.includes(packageName)) added.push(packageName);
		joined.push(packageName);
	}
	const removed = [];
	for (const packageName of [...bundles]) {
		const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName);
		const stillBundle = dependencySet.has(packageName) && exportsBundlePatch(packageName);
		if (wasDependency && !stillBundle) {
			bundles.splice(bundles.indexOf(packageName), 1);
			removed.push(packageName);
		}
	}
	if (joined.length === 0 && removed.length === 0) return [];
	manifest.dsh = {
		...manifest.dsh,
		profile: {
			...manifest.dsh?.profile,
			bundles
		}
	};
	writeProfileManifest(manifest);
	console.log(`[plugin-console] reconciled bundles: +${joined.join(", ") || "none"} -${removed.join(", ") || "none"}`);
	return joined;
}
/**
* Windows 兼容执行 npm/pnpm：spawnSync 不能直接跑 .cmd 批处理垫片——
* libuv 的批处理包装在本机 CreateProcessW 直接 EINVAL（沙箱与普通
* web 进程均复现），而裸名又因不存在 .exe 而 ENOENT。win32 下改为用
* node 直接执行各 CLI 的 JS 入口：npm 随 node 发行
* （<node>\node_modules\npm\bin\npm-cli.js），pnpm 全局装在
* %APPDATA%\npm\node_modules\pnpm\bin\pnpm.mjs；入口不存在时回退 .cmd。
*/
function cliCommand(cmd, args, options) {
	if (process.platform !== "win32") return spawnSync(cmd, args, options);
	let entry = null;
	if (cmd === "npm") {
		const candidate = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
		if (existsSync(candidate)) entry = candidate;
	} else {
		const candidate = join(process.env.APPDATA ?? "", "npm", "node_modules", "pnpm", "bin", "pnpm.mjs");
		if (existsSync(candidate)) entry = candidate;
	}
	return entry === null ? spawnSync(`${cmd}.cmd`, args, options) : spawnSync(process.execPath, [entry, ...args], options);
}
/**
* bundle 安装/更新/移除：在 profile 目录跑 pnpm 子命令，然后 reconcile 层栈。
* 与官方 `dsh plugin <sub>`（pnpm forwarder + reconcile）同机制。
* @param args - pnpm 子命令参数（add <source> / update <name> / remove <name>）。
* @returns {ok, names, output} 新增层名与 pnpm 输出（失败时 output 为错误信息）。
*/
function runPnpm(args) {
	const dir = profileWebDir();
	const before = readProfileManifest();
	const result = cliCommand("pnpm", args, {
		cwd: dir,
		encoding: "utf8",
		timeout: 12e4
	});
	const output = (result.stdout ?? "") + (result.stderr ?? "");
	if (result.status !== 0) return {
		ok: false,
		names: [],
		output: output.slice(-1e3)
	};
	return {
		ok: true,
		names: reconcileBundles([], before),
		output: output.slice(-500)
	};
}
/** 已安装包是否声明 dsh.bundle（tools 判别用；未装返回 false）。 */
function isBundlePackage(packageName) {
	return exportsBundlePatch(packageName);
}
/** 读已安装包版本（profile node_modules/<name>/package.json）；未装返回 undefined。 */
function readInstalledVersion(name) {
	try {
		const manifest = JSON.parse(readFileSync(join(profileWebDir(), "node_modules", name, "package.json"), "utf8"));
		return typeof manifest.version === "string" ? manifest.version : void 0;
	} catch {
		return;
	}
}
/** 解析一个 preset 组合文件的全部行 id（agent.cordis.yml 顶层行 + insert 子行）。 */
function presetRowIdsFromFile(file) {
	const ids = /* @__PURE__ */ new Set();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		return ids;
	}
	for (const line of content.split("\n")) {
		const m = /- id:\s*([^\s]+)/.exec(line.trim());
		if (m !== null) ids.add(m[1]);
	}
	return ids;
}
/**
* 全部 agent preset 组合的行 id 并集（0811 起模型面工具由 preset 挂载）。
* 经 `ctx.agentPresets.list()`（官方服务）拿 preset 目录，再读组合文件。
* 服务不可用/读取失败 → 空集（面板退化为无「预设挂载」标注）。
*/
async function collectPresetRowIds(ctx) {
	const presets = ctx.agentPresets;
	const ids = /* @__PURE__ */ new Set();
	if (presets?.list === void 0) return ids;
	try {
		const list = await presets.list();
		for (const preset of list) {
			if (typeof preset.path !== "string") continue;
			for (const id of presetRowIdsFromFile(preset.path)) ids.add(id);
		}
	} catch {}
	return ids;
}
/** 遍历 loader 树收集全部条目（含嵌套子树），id 取短 id（options.id）。 */
async function collectLoaderEntries(ctx) {
	const loader = ctx.loader;
	if (loader?.entries === void 0) return [];
	const byId = /* @__PURE__ */ new Map();
	const insertRows = new Set(readInsertRows().map((r) => r.id));
	const presetIds = await collectPresetRowIds(ctx);
	for (const raw of loader.entries()) {
		const entry = raw;
		const id = entry.options?.id ?? entry.id;
		if (typeof id !== "string" || id.length === 0) continue;
		const name = entry.options?.name ?? id;
		const row = {
			id,
			name,
			disabled: entry.disabled === true,
			version: readInstalledVersion(name),
			kind: "loader",
			insertRow: insertRows.has(id)
		};
		const prev = byId.get(id);
		if (prev === void 0 || prev.disabled === true && row.disabled === false) byId.set(id, row);
	}
	for (const row of byId.values()) if (row.disabled && presetIds.has(row.id)) row.presetMounted = true;
	return [...byId.values()];
}
/** 版本检查缓存：name -> { latest, checkedAt }（进程内存）。 */
const versionCache = /* @__PURE__ */ new Map();
const VERSION_REFRESH_MIN_MS = 3e4;
let lastVersionRefreshAt = 0;
/** npm view <name> version（registry 最新版）；失败/非 registry 包返回 null。 */
function npmViewLatest(name) {
	let latest = null;
	try {
		const result = cliCommand("npm", [
			"view",
			name,
			"version"
		], {
			encoding: "utf8",
			timeout: 15e3,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const text = (result.stdout ?? "").trim();
		if (result.status === 0 && /^\d+(\.\d+)+/.test(text)) latest = text.split("\n")[0].trim();
	} catch {}
	versionCache.set(name, {
		latest,
		checkedAt: Date.now()
	});
	return latest;
}
/** 用户插件名列表（排除官方命名空间）。 */
async function userPluginNames(ctx) {
	const entries = await collectLoaderEntries(ctx);
	return [...new Set(entries.map((row) => row.name).filter((name) => !name.startsWith("@deepseek-ai/") && !name.startsWith("@cordisjs/") && !name.startsWith("cordis:")))];
}
/** 批量强制刷新版本缓存（可选 force）。 */
async function refreshVersions(ctx, force) {
	const now = Date.now();
	if (!force && now - lastVersionRefreshAt < VERSION_REFRESH_MIN_MS) return false;
	lastVersionRefreshAt = now;
	for (const name of await userPluginNames(ctx)) npmViewLatest(name);
	return true;
}
/** Cordis 插件名。 */
const name = "plugin-console";
/** 需要宿主 web server（web 组合）+ loader（读/改 loader 树条目）+ tools（注册 plugin_* 管理工具）+ agentPresets（预设挂载标注）。 */
const inject = [
	"webServer",
	"loader",
	"tools",
	"agentPresets"
];
/** 注册控制台路由：GET 读列表，POST 写列表。 */
function apply(ctx) {
	ctx.effect(() => {
		const pluginTools = createPluginTools({
			dshHome: () => resolveDshHome(),
			isBundlePackage,
			readInsertRows,
			writeInsertRow,
			removeInsertRow,
			bundleInstall: (source) => {
				const result = runPnpm(["add", source]);
				return result.ok ? {
					names: result.names,
					output: result.output
				} : null;
			},
			bundleRemove: (name) => {
				const result = runPnpm(["remove", name]);
				return result.ok ? {
					names: result.names,
					output: result.output
				} : null;
			}
		});
		const disposeTools = ctx.tools?.register !== void 0 ? pluginTools.map((tool) => ctx.tools.register(tool)) : [];
		if (disposeTools.length > 0) console.log(`[plugin-console] registered plugin tools: ${pluginTools.map((t) => t.name).join(", ")}`);
		const webServer = ctx.webServer;
		if (webServer === void 0) return () => {
			for (const dispose of disposeTools) dispose();
		};
		const prescanTimer = setTimeout(() => {
			refreshVersions(ctx, false).catch((error) => {
				console.log(`[plugin-console] version prescan failed: ${error instanceof Error ? error.message : String(error)}`);
			});
		}, 3e4);
		const disposeRoutes = webServer.register({
			kind: "prefix",
			path: "/api/plugin-console",
			handler: async (req, res) => {
				const json = (status, body) => {
					res.statusCode = status;
					res.setHeader("content-type", "application/json");
					res.end(JSON.stringify(body));
				};
				const url = req?.url ?? "/";
				const method = req?.method ?? "GET";
				const path = url.split("?")[0] ?? "/";
				try {
					if (method === "GET" && (path === "/api/plugin-console/inserts" || path === "/api/plugin-console/inserts/")) {
						json(200, {
							ok: true,
							inserts: readInsertRows()
						});
						return;
					}
					const insertMatch = /^\/api\/plugin-console\/inserts\/([^/]+)$/.exec(path);
					if (method === "POST" && insertMatch !== null) {
						const id = decodeURIComponent(insertMatch[1]);
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							(async () => {
								try {
									const parsed = JSON.parse(body);
									if (parsed.remove === true) {
										const removed = removeInsertRow(id);
										json(removed ? 200 : 404, { ok: removed });
										return;
									}
									const name = (parsed.name ?? "").trim();
									if (name.length === 0) {
										json(400, {
											ok: false,
											message: "insert row needs a name"
										});
										return;
									}
									writeInsertRow(id, name);
									json(200, {
										ok: true,
										id,
										name,
										live: true
									});
								} catch (error) {
									json(500, {
										ok: false,
										message: error instanceof Error ? error.message : String(error)
									});
								}
							})();
						});
						return;
					}
					if (method === "GET" && (path === "/api/plugin-console/installed" || path === "/api/plugin-console/installed/")) {
						json(200, {
							ok: true,
							plugins: await collectLoaderEntries(ctx)
						});
						return;
					}
					if (method === "GET" && (path === "/api/plugin-console/versions" || path === "/api/plugin-console/versions/")) {
						json(200, {
							ok: true,
							versions: (await userPluginNames(ctx)).map((name) => {
								const cached = versionCache.get(name);
								return {
									name,
									latest: cached?.latest ?? null,
									checked: cached !== void 0
								};
							})
						});
						return;
					}
					if (method === "POST" && (path === "/api/plugin-console/versions/refresh" || path === "/api/plugin-console/versions/refresh/")) {
						json(200, {
							ok: true,
							refreshed: await refreshVersions(ctx, false),
							versions: (await userPluginNames(ctx)).map((name) => {
								const cached = versionCache.get(name);
								return {
									name,
									latest: cached?.latest ?? null,
									checked: cached !== void 0
								};
							})
						});
						return;
					}
					if (method === "POST" && (path === "/api/plugin-console/install" || path === "/api/plugin-console/install/")) {
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							(async () => {
								try {
									const source = (JSON.parse(body).source ?? "").trim();
									if (source.length === 0) {
										json(400, {
											ok: false,
											message: "install needs a source"
										});
										return;
									}
									const result = runPnpm(["add", source]);
									if (!result.ok) {
										json(502, {
											ok: false,
											message: `pnpm add failed: ${result.output}`
										});
										return;
									}
									const installedName = resolveInstalledName(source);
									if (installedName === null) {
										json(502, {
											ok: false,
											message: `pnpm add succeeded but ${source} is not in the profile dependencies`
										});
										return;
									}
									if (isBundlePackage(installedName)) {
										json(200, {
											ok: true,
											kind: "bundle",
											name: installedName,
											needsRestart: true,
											message: `bundle ${installedName} 已加入层栈——重启 web 生效`
										});
										return;
									}
									const id = installedName.replace(/^@/, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
									writeInsertRow(id, installedName);
									json(200, {
										ok: true,
										kind: "plugin",
										name: installedName,
										id,
										needsRestart: false,
										message: `插件 ${installedName} 已挂载（insert 行 ${id}，配置 HMR 实时生效）`
									});
								} catch (error) {
									json(500, {
										ok: false,
										message: error instanceof Error ? error.message : String(error)
									});
								}
							})();
						});
						return;
					}
					const installedMatch = /^\/api\/plugin-console\/installed\/([^/]+)$/.exec(path);
					if (method === "POST" && installedMatch !== null) {
						const id = decodeURIComponent(installedMatch[1]);
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							(async () => {
								try {
									const disabled = JSON.parse(body).disabled === true;
									if (id === "@dsh-external/plugin-console") {
										json(409, {
											ok: false,
											message: "管理工具自身不可停用"
										});
										return;
									}
									const loader = ctx.loader;
									let target;
									if (loader?.entries !== void 0) for (const raw of loader.entries()) {
										const candidate = raw;
										if ((candidate.options?.id ?? candidate.id) === id) {
											target = raw;
											break;
										}
									}
									if (target?.update === void 0) {
										json(404, {
											ok: false,
											message: `loader entry not found: ${id}`
										});
										return;
									}
									await target.update({ disabled });
									writeUiPluginDisabled(id, disabled);
									json(200, {
										ok: true,
										id,
										disabled,
										runtime: true,
										persisted: true
									});
								} catch (error) {
									json(500, {
										ok: false,
										message: error instanceof Error ? error.message : String(error)
									});
								}
							})();
						});
						return;
					}
					if (method === "POST" && (path === "/api/plugin-console/bundles" || path === "/api/plugin-console/bundles/")) {
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							(async () => {
								try {
									const parsed = JSON.parse(body);
									if (parsed.action === "install") {
										const source = (parsed.source ?? "").trim();
										if (source.length === 0) {
											json(400, {
												ok: false,
												message: "install needs a source"
											});
											return;
										}
										const result = runPnpm(["add", source]);
										if (!result.ok) {
											json(502, {
												ok: false,
												message: `pnpm add failed: ${result.output}`
											});
											return;
										}
										json(200, {
											ok: true,
											action: "install",
											names: result.names,
											needsRestart: true
										});
										return;
									}
									if (parsed.action === "update") {
										const name = (parsed.name ?? "").trim();
										if (name.length === 0) {
											json(400, {
												ok: false,
												message: "update needs a package name"
											});
											return;
										}
										const result = runPnpm(["update", name]);
										if (!result.ok) {
											json(502, {
												ok: false,
												message: `pnpm update failed: ${result.output}`
											});
											return;
										}
										json(200, {
											ok: true,
											action: "update",
											name,
											names: result.names,
											needsRestart: true
										});
										return;
									}
									if (parsed.action === "remove") {
										const name = (parsed.name ?? "").trim();
										if (name.length === 0) {
											json(400, {
												ok: false,
												message: "remove needs a package name"
											});
											return;
										}
										if (name === "@dsh-external/plugin-console") {
											json(409, {
												ok: false,
												message: "管理工具自身不可卸载"
											});
											return;
										}
										const result = runPnpm(["remove", name]);
										if (!result.ok) {
											json(502, {
												ok: false,
												message: `pnpm remove failed: ${result.output}`
											});
											return;
										}
										json(200, {
											ok: true,
											action: "remove",
											name,
											needsRestart: true
										});
										return;
									}
									json(400, {
										ok: false,
										message: "action must be install, update, or remove"
									});
								} catch (error) {
									json(500, {
										ok: false,
										message: error instanceof Error ? error.message : String(error)
									});
								}
							})();
						});
						return;
					}
					json(404, {
						ok: false,
						message: "not found"
					});
				} catch (error) {
					json(500, {
						ok: false,
						message: error instanceof Error ? error.message : String(error)
					});
				}
			}
		});
		return () => {
			clearTimeout(prescanTimer);
			for (const dispose of disposeTools) dispose();
			disposeRoutes();
		};
	}, "plugin-console: config read/write route + plugin tools");
}
//#endregion
export { apply, inject, name };
