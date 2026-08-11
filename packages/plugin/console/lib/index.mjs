import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { join } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { parse, stringify } from "yaml";
//#region src/discovery/store.ts
/**
* 发现层存储：`$DSH_HOME/plugin-sources/` 域根读写——sources.yml（源集合，
* 用户唯一配置入口）＋lock.yml（TOFU：resolved commit + 内容哈希）＋
* cache/<source-id>/（每源枚举快照，派生数据）。配置与派生分离（apt 同构：
* sources.list 配置 / var/lib/apt/lists 快照）。
*
* 命名 `plugin-sources/` 而非 `plugins/`：后者与旧 registry 的
* `~/.dsh/plugins/` 安装目录同名易混。删目录即重置发现层，不影响安装态
* （cordis.patch.yml 在域根之外，官方位置）。
*/
const DISCOVERY_ROOT = "plugin-sources";
const SOURCES_FILE = "sources.yml";
const LOCK_FILE = "lock.yml";
const CACHE_DIR = "cache";
const ENTRIES_FILE = "entries.json";
const SOURCE_KINDS = /* @__PURE__ */ new Set([
	"index",
	"manifest",
	"single"
]);
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
/** 校验并规整一个源条目。 */
function normalizeSource(raw, index) {
	const r = raw ?? {};
	if (typeof r.id !== "string" || r.id.trim() === "") throw new Error(`plugin-sources: sources[${index}] missing string "id"`);
	if (typeof r.kind !== "string" || !SOURCE_KINDS.has(r.kind)) throw new Error(`plugin-sources: sources[${index}] ("${r.id}") kind must be one of index|manifest|single`);
	if (typeof r.locator !== "string" || r.locator.trim() === "") throw new Error(`plugin-sources: sources[${index}] ("${r.id}") missing string "locator"`);
	if (r.trust !== void 0 && (typeof r.trust !== "string" || !TRUST_LEVELS.has(r.trust))) throw new Error(`plugin-sources: sources[${index}] ("${r.id}") trust must be one of official|community|untrusted`);
	return {
		id: r.id.trim(),
		kind: r.kind,
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
		if (r.kind !== "repository" && r.kind !== "bundle") throw new Error(`plugin-sources: locks[${i}] ("${r.canonical}") kind must be repository|bundle`);
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
/** 解析官方 repository 源串（github:owner/repo#ref&path:...）→ 各部分。 */
function parseRepositorySource(source) {
	const m = /^github:([^/]+)\/([^#&]+?)(?:#([^&]+))?(?:&path:(\/.*))?$/.exec(source.trim());
	if (m === null) return null;
	return {
		owner: m[1],
		repo: m[2],
		ref: m[3] ?? null,
		path: m[4] ?? null
	};
}
/** canonical 身份（owner/repo 小写，跨源去重键）。 */
function canonicalOfRepository(owner, repo) {
	return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}
/** 从 package.json 的 dsh 字段派生能力面。 */
function facesOfDsh(dsh) {
	const faces = [];
	const d = dsh ?? {};
	if (d.entry !== void 0) faces.push("tool");
	if (d.skills !== void 0) faces.push("skill");
	if (d.mcpServers !== void 0) faces.push("mcp");
	if (d.client !== void 0) faces.push("ui");
	if (d.bundle !== void 0) faces.push("bundle");
	return faces;
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
/** index 源条目转换：hub 形态 → 统一条目。 */
function hubEntryToPlugin(raw, sourceId) {
	const id = typeof raw.id === "string" ? raw.id : null;
	const url = typeof raw.source === "string" ? raw.source : null;
	if (id === null || url === null) return null;
	const gh = parseGithubUrl(url);
	if (gh === null) return null;
	const description = typeof raw.description === "string" ? raw.description : void 0;
	return {
		id,
		kind: "repository",
		source: `github:${gh.owner}/${gh.repo}`,
		refHint: null,
		faces: [],
		description,
		sourceId
	};
}
/**
* index 源枚举：读索引 JSON（locator = URL 或本地文件路径），条目转换，
* 写快照。有新鲜快照 → 直接返回（不网络）；过期 → 拉取（带 ETag 条件
* 刷新，304 时保留 entries 仅更新 fetchedAt）。
*
* locator 支持 file:///path 或裸本地路径（读文件，零网络——hub 私有仓库
* 匿名 raw 404，本机经 hub clone 的 plugins.json 走此通道）。
*/
async function enumerateIndex(dshHome, source, opts = {}) {
	const now = opts.now ?? Date.now();
	const cached = readSnapshot(dshHome, source.id);
	if (cached !== null && !opts.refresh && snapshotFresh(cached, 216e5, now)) return cached;
	const filePath = source.locator.replace(/^file:\/\//, "");
	if (existsSync(filePath) && (source.locator.startsWith("file:") || !/^https?:/i.test(source.locator))) {
		const { readFileSync } = await import("node:fs");
		let body;
		try {
			body = JSON.parse(readFileSync(filePath, "utf8"));
		} catch (error) {
			throw new Error(`plugin-sources: index "${source.id}" local file unreadable (${filePath}): ${String(error)}`);
		}
		const entries = (Array.isArray(body.plugins) ? body.plugins : []).map((p) => hubEntryToPlugin(p ?? {}, source.id)).filter((e) => e !== null);
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
	const entries = (Array.isArray(body.plugins) ? body.plugins : []).map((p) => hubEntryToPlugin(p ?? {}, source.id)).filter((e) => e !== null);
	const snapshot = {
		fetchedAt: new Date(now).toISOString(),
		etag: res.etag ?? void 0,
		entries
	};
	writeSnapshot(dshHome, source.id, snapshot);
	return snapshot;
}
/**
* single 源探测：读仓库 package.json（先试 .dsh-plugin/，再试根），
* 派生 faces/description，写该源快照。按仓库去重 + 1h TTL：同仓库在
* 其它 single 源出现时复用本源缓存。
*/
async function enumerateSingle(dshHome, source, opts = {}) {
	const now = opts.now ?? Date.now();
	const cached = readSnapshot(dshHome, source.id);
	if (cached !== null && !opts.refresh && snapshotFresh(cached, 36e5, now)) return cached;
	const parsed = parseRepositorySource(source.locator);
	if (parsed === null) throw new Error(`plugin-sources: single "${source.id}" locator must be github:owner/repo#ref[&path:/...]`);
	const fetchImpl = opts.fetch ?? defaultFetch;
	const { owner, repo } = parsed;
	const probePaths = parsed.path !== null ? [`${parsed.path.replace(/^\/+/, "")}/package.json`] : [".dsh-plugin/package.json", "package.json"];
	const ref = parsed.ref ?? "HEAD";
	let pkg = null;
	let usedPath = null;
	for (const p of probePaths) {
		const res = await fetchImpl(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`);
		if (res.ok) {
			pkg = await res.json();
			usedPath = p;
			break;
		}
		if (res.status !== 404) break;
	}
	if (pkg === null) throw new Error(`plugin-sources: single "${source.id}" is not a plugin — no package.json at ${probePaths.join(" or ")} (${owner}/${repo}@${ref})`);
	const id = typeof pkg.name === "string" ? pkg.name : `${owner}/${repo}`;
	const description = typeof pkg.description === "string" ? pkg.description : void 0;
	const dsh = pkg.dsh;
	const faces = facesOfDsh(dsh);
	const isBundle = dsh?.bundle !== void 0;
	const pathTail = usedPath === ".dsh-plugin/package.json" ? "&path:/.dsh-plugin" : parsed.path ?? "";
	const entry = {
		id,
		kind: isBundle ? "bundle" : "repository",
		source: `github:${owner}/${repo}${parsed.ref !== null ? `#${parsed.ref}` : ""}${pathTail}`,
		refHint: parsed.ref,
		faces,
		description,
		sourceId: source.id
	};
	const snapshot = {
		fetchedAt: new Date(now).toISOString(),
		entries: [entry]
	};
	writeSnapshot(dshHome, source.id, snapshot);
	return snapshot;
}
/** manifest 源枚举：读用户手写清单文件（每行一个官方源串，或 YAML 列表）。 */
async function enumerateManifest(dshHome, source, opts = {}) {
	const { readFileSync } = await import("node:fs");
	let text;
	try {
		text = readFileSync(source.locator.replace(/^file:\/\//, ""), "utf8");
	} catch (error) {
		throw new Error(`plugin-sources: manifest "${source.id}" unreadable (${source.locator}): ${String(error)}`);
	}
	const entries = text.split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).map((sourceStr) => {
		const parsed = parseRepositorySource(sourceStr);
		if (parsed !== null) return {
			id: `${parsed.owner}/${parsed.repo}`,
			kind: "repository",
			source: sourceStr,
			refHint: parsed.ref,
			faces: [],
			sourceId: source.id
		};
		return {
			id: sourceStr,
			kind: "bundle",
			source: sourceStr,
			refHint: null,
			faces: [],
			sourceId: source.id
		};
	});
	return {
		fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
		entries
	};
}
/** 按源类型分发枚举。 */
async function enumerateSource(dshHome, source, opts = {}) {
	switch (source.kind) {
		case "index": return enumerateIndex(dshHome, source, opts);
		case "single": return enumerateSingle(dshHome, source, opts);
		case "manifest": return enumerateManifest(dshHome, source, opts);
	}
}
//#endregion
//#region src/discovery/tools.ts
/**
* 插件管理工具（plugin_* ×4）：agent 的插件发现与安装面。
* - plugin_search：搜源集合（给定新源 → 懒加载探测并入 sources.yml）
* - plugin_install：官方格式源直装（已装则更新 ref）；repository 走
*   cordis.patch.yml repositories 行，bundle 走 pnpm add；TOFU 固化
*   resolved ref 到 lock.yml
* - plugin_uninstall：删安装态行（清单保留，可再装）
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
			enum: ["repository", "bundle"]
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
/** 解析一个 repository 安装行 → 结构化。 */
function parseInstalled(source) {
	const parsed = parseRepositorySource(source);
	if (parsed === null) return null;
	return {
		canonical: canonicalOfRepository(parsed.owner, parsed.repo),
		ref: parsed.ref,
		kind: "repository"
	};
}
/** id 匹配：支持完整 canonical（owner/repo）或短仓库名。 */
function matchesId(canonical, id) {
	const key = id.trim().toLowerCase();
	return canonical === key || canonical.endsWith(`/${key}`) || canonical.split("/").pop() === key;
}
/** 规范化 ref 检查：repository 源必须有精确 ref（禁裸分支）。 */
function requireExactRef(source, parsed) {
	if (parsed.ref === null || parsed.ref.trim() === "") throw new Error(`plugin_install: repository source needs an exact ref (commit sha or tag), got bare "${source}" — pin github:owner/repo#<sha|tag>`);
}
/** 从 search 的 source 参数推断源类型（新源懒加载）。 */
function inferSource(arg) {
	const id = `custom-${Date.now()}`;
	if (/^file:\/\//.test(arg) || /^https?:\/\//i.test(arg)) return {
		id,
		kind: "index",
		locator: arg,
		trust: "community"
	};
	if (arg.startsWith("github:")) return {
		id,
		kind: "single",
		locator: arg,
		trust: "community"
	};
	return {
		id,
		kind: "manifest",
		locator: `bundle:${arg}`,
		trust: "community"
	};
}
function createPluginTools(deps) {
	return [
		defineTool({
			name: "plugin_search",
			description: "Search installable DSH plugins. Without `source`, searches every registered source (sources at $DSH_HOME/plugin-sources/sources.yml, enumeration cached). With `source`, probes that source — a new official-format source (github:owner/repo#ref, an index file/URL, or an npm bundle) is probed lazily and remembered for later searches. Results carry the owning source and trust level.",
			parameters: {
				query: {
					type: "string",
					description: "Substring to match against plugin id or description. Empty returns all."
				},
				source: {
					type: "string",
					description: "A registered source id, or a new source (github:owner/repo#ref, an index JSON file/URL, or an npm bundle) to probe and remember."
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
				let matched;
				if (args.source !== void 0 && args.source !== "") {
					matched = findSource(sources, args.source);
					const target = matched ?? inferSource(args.source);
					if (target.kind === "manifest" && target.locator.startsWith("bundle:")) {
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
			description: "Install a DSH plugin from an official-format source. Repository plugins (github:owner/repo#<sha|tag>[&path:/...]) are written to $DSH_HOME/cordis.patch.yml repository-plugins.repositories (official HMR applies them); bundle plugins (npm package with dsh.bundle) are added via pnpm to the web profile. Installing an already-installed plugin updates its ref. The resolved ref is recorded (TOFU) in $DSH_HOME/plugin-sources/lock.yml.",
			parameters: { source: {
				type: "string",
				required: true,
				description: "Official-format source: github:owner/repo#<sha|tag>[&path:/...] or an npm bundle name."
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
						ref: { type: "string" },
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
				const repoParsed = parseRepositorySource(args.source);
				if (repoParsed !== null) {
					requireExactRef(args.source, repoParsed);
					const canonical = canonicalOfRepository(repoParsed.owner, repoParsed.repo);
					const next = [...deps.readRepositories().repositories];
					const idx = next.findIndex((row) => parseInstalled(row)?.canonical === canonical);
					if (idx !== -1) next[idx] = args.source;
					else next.push(args.source);
					deps.writeRepositories(next);
					writeLock(home, upsertLock(readLock(home), {
						canonical,
						kind: "repository",
						ref: repoParsed.ref,
						recordedAt: (/* @__PURE__ */ new Date()).toISOString()
					}));
					return {
						ok: true,
						canonical,
						ref: repoParsed.ref,
						message: `plugin_install: ${canonical}@${repoParsed.ref} ${idx !== -1 ? "updated" : "added"} — HMR will apply it; restart the web app if no live HMR.`
					};
				}
				if (deps.bundleInstall === void 0) throw new Error(`plugin_install: bundle source "${args.source}" needs bundleInstall support (web profile)`);
				const result = deps.bundleInstall(args.source);
				writeLock(home, upsertLock(readLock(home), {
					canonical: args.source,
					kind: "bundle",
					ref: args.source,
					recordedAt: (/* @__PURE__ */ new Date()).toISOString()
				}));
				return {
					ok: true,
					canonical: args.source,
					message: `plugin_install: bundle ${args.source} added${result !== null ? ` (${result.names.join(", ")})` : ""} — restart the web app to load it.`
				};
			}
		}),
		defineTool({
			name: "plugin_uninstall",
			description: "Remove an installed repository plugin from $DSH_HOME/cordis.patch.yml repository-plugins.repositories. The source stays in plugin-sources (it can be reinstalled); bundle plugins are not removed by this tool yet.",
			parameters: { id: {
				type: "string",
				required: true,
				description: "Plugin id or owner/repo to remove."
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
				const current = deps.readRepositories();
				const remaining = current.repositories.filter((row) => {
					const parsed = parseInstalled(row);
					return parsed === null ? row !== args.id.trim() : !matchesId(parsed.canonical, args.id);
				});
				if (remaining.length === current.repositories.length) throw new Error(`plugin_uninstall: "${args.id}" is not an installed repository plugin`);
				deps.writeRepositories(remaining);
				return {
					ok: true,
					message: `plugin_uninstall: removed "${args.id}" (repositories now ${remaining.length})`
				};
			}
		}),
		defineTool({
			name: "plugin_status",
			description: "Show installed DSH plugins. Without `id`, lists every installed repository plugin (from $DSH_HOME/cordis.patch.yml repository-plugins.repositories). With `id`, shows that plugin plus its TOFU-resolved ref from lock.yml.",
			parameters: { id: {
				type: "string",
				description: "Plugin id or owner/repo to inspect."
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
								ref: { type: "string" },
								resolved: { type: "string" },
								path: { type: "string" }
							}
						}
					} }
				},
				render: (_args, value) => {
					const lines = value.plugins.map((p) => {
						const ref = p.ref !== void 0 ? `#${p.ref}` : "";
						const resolved = p.resolved !== void 0 ? ` (resolved ${p.resolved})` : "";
						return `- ${p.canonical}${ref}${resolved}`;
					});
					return [{
						type: "text",
						text: lines.length > 0 ? lines.join("\n") : "(no installed repository plugins)"
					}];
				}
			},
			async execute(args) {
				const locks = readLock(deps.dshHome());
				const view = deps.readRepositories().repositories.map((row) => parseInstalled(row)).filter((p) => p !== null).map((p) => {
					const lock = findLock(locks, p.canonical);
					return {
						canonical: p.canonical,
						...p.ref !== null ? { ref: p.ref } : {},
						...lock !== void 0 ? { resolved: lock.ref } : {}
					};
				});
				if (args.id !== void 0 && args.id !== "") {
					const hit = view.filter((p) => matchesId(p.canonical, args.id));
					if (hit.length === 0) throw new Error(`plugin_status: "${args.id}" is not installed`);
					return { plugins: hit };
				}
				return { plugins: view };
			}
		})
	];
}
//#endregion
//#region src/index.ts
/**
* 薄控制台 Node half：读写 `$DSH_HOME/cordis.patch.yml` 的
* `repository-plugins` 行（官方仓库插件的用户配置层，homePatchPath）。
* 经 httpServer 提供 `/api/plugin-console` 路由供浏览器面板调用。
*
* 0 patch：完全官方机制——glue 插件经 bundle 挂载，config 是官方
* HMR-watched 的 home 级用户 patch 层。
*/
/** 解析 resolveDshHome（官方 dsh-paths）。 */
function resolveDshHome() {
	return process.env.DSH_HOME?.trim() !== "" && process.env.DSH_HOME !== void 0 ? process.env.DSH_HOME : join(process.env.HOME ?? "/tmp", ".dsh");
}
/** home 级用户 patch 文件（官方 homePatchPath）。 */
function homePatchPath() {
	return join(resolveDshHome(), "cordis.patch.yml");
}
/**
* UI 插件（bundle 插件）的用户覆盖文件：当前 profile 的 cordis.patch.yml。
* bundle 层的挂载行在此被用户的 `disabled: true/false` 覆盖（官方 patch
* 语义：按 id 覆盖同名行）。当前 profile = 启动时的 profile（web 默认）。
*/
function profilePatchPath() {
	return join(resolveDshHome(), "profiles", "web", "cordis.patch.yml");
}
/** 读当前 repositories 列表（解析 home cordis.patch.yml 的 repository-plugins 行）。 */
function readRepositories() {
	const file = homePatchPath();
	let content;
	try {
		content = readFileSync(file, "utf8");
	} catch {
		return {
			repositories: [],
			present: false
		};
	}
	const lines = content.split("\n");
	const repos = [];
	let inRepoBlock = false;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (line.includes("id: repository-plugins")) {
			inRepoBlock = true;
			continue;
		}
		if (inRepoBlock) {
			if (line.trim().startsWith("repositories:")) {
				for (let j = i + 1; j < lines.length; j += 1) {
					const item = lines[j];
					if (item.trimStart().startsWith("- ")) repos.push(item.trim().slice(2).trim());
					else if (!item.trimStart().startsWith("#")) break;
				}
				break;
			}
			if (line.trim().startsWith("- id:")) break;
		}
	}
	return {
		repositories: repos,
		present: inRepoBlock
	};
}
/** 写 repositories 列表（重建 home cordis.patch.yml 的 repository-plugins 行）。 */
function writeRepositories(repositories) {
	const file = homePatchPath();
	const block = [
		"# Home-level patch layer (HMR-watched). 薄控制台写入目标。",
		"- id: repository-plugins",
		"  config:",
		...repositories.length === 0 ? ["    repositories: []"] : ["    repositories:", ...repositories.map((r) => `      - ${r}`)],
		""
	].join("\n");
	writeFileSync(file, block);
	console.log(`[plugin-console] wrote ${repositories.length} repositories to ${file}`);
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
	writeFileSync(file, significant.join("\n"));
	console.log(`[plugin-console] set ${id} disabled=${String(disabled)} in ${file}`);
}
/** 解析 `github:owner/repo#ref&path:...` 源为 {owner, repo, ref, tail}。 */
function parseSource(source) {
	const match = /^github:([^/\s#&]+)\/([^/\s#&]+)#([^\s#&]+)/.exec(source);
	if (match === null) return null;
	return {
		owner: match[1],
		repo: match[2],
		ref: match[3],
		tail: source.slice(match[0].length)
	};
}
/** 40-hex commit（固定引用可对比）；分支/标签名则只能报告远端最新。 */
function isCommitSha(value) {
	return /^[0-9a-f]{40}$/.test(value);
}
/** git ls-remote 取远端 ref 指向的 commit；区分网络失败与远端无此 ref。 */
function gitRemoteCommit(owner, repo, ref) {
	return new Promise((resolve) => {
		execFile("git", [
			"ls-remote",
			`https://github.com/${owner}/${repo}.git`,
			ref
		], { timeout: 15e3 }, (error, stdout) => {
			if (error) {
				resolve({
					sha: null,
					missing: false
				});
				return;
			}
			const sha = stdout.split("\n")[0]?.split("	")[0] ?? "";
			resolve(isCommitSha(sha) ? {
				sha,
				missing: false
			} : {
				sha: null,
				missing: true
			});
		});
	});
}
/** 当前 profile 目录（bundle 安装/更新的 pnpm 工作目录）。 */
function profileWebDir() {
	return join(resolveDshHome(), "profiles", "web");
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
* bundle 安装/更新：在 profile 目录跑 pnpm add/update，然后 reconcile 层栈。
* 与官方 `dsh plugin <sub>`（pnpm forwarder + reconcile）同机制。
* @param args - pnpm 子命令参数（add <source> 或 update <name>）。
* @returns {names, output} 新增层名与 pnpm 输出（失败时 output 为错误信息）。
*/
function runPnpm(args) {
	const dir = profileWebDir();
	const before = readProfileManifest();
	const result = spawnSync("pnpm", args, {
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
/** 检查全部已配置源的远端状态。 */
async function checkUpdates(sources) {
	const rows = [];
	for (const source of sources) {
		const pluginName = repositoryManifestName(source);
		const parsed = parseSource(source);
		if (parsed === null) {
			rows.push({
				source,
				pluginName,
				ref: "",
				refKind: "sha",
				latestSha: null,
				hasUpdate: false,
				error: "unsupported source (expected github:owner/repo#ref)"
			});
			continue;
		}
		const result = await gitRemoteCommit(parsed.owner, parsed.repo, parsed.ref);
		if (result.sha === null) {
			rows.push({
				source,
				pluginName,
				ref: parsed.ref,
				refKind: isCommitSha(parsed.ref) ? "sha" : "branch",
				latestSha: null,
				hasUpdate: false,
				error: result.missing ? "remote has no such ref（未推送或已删除）" : "cannot reach remote (network/credentials)"
			});
			continue;
		}
		rows.push({
			source,
			pluginName,
			ref: parsed.ref,
			refKind: isCommitSha(parsed.ref) ? "sha" : "branch",
			latestSha: result.sha,
			hasUpdate: parsed.ref !== result.sha
		});
	}
	return rows;
}
/** Cordis 插件名。 */
const name = "plugin-console";
/** 需要宿主 web server（web 组合）+ loader（读/改 loader 树条目）+ tools（注册 plugin_* 管理工具）。 */
const inject = [
	"httpServer",
	"loader",
	"tools"
];
/**
* 版本检查缓存：name -> { latest, checkedAt }（进程内存）。
* 防 registry 请求风暴策略：
* - 面板 GET /versions **只读缓存**（零网络）；
* - 进程启动后延迟预扫描（apply 里 setTimeout 30s）填充缓存；
* - 手动 POST /versions/refresh 强制查（30 秒最小间隔防抖）。
*/
const versionCache = /* @__PURE__ */ new Map();
const VERSION_REFRESH_MIN_MS = 3e4;
let lastVersionRefreshAt = 0;
/** npm view <name> version（registry 最新版）；失败/非 registry 包返回 null。 */
function npmViewLatest(name) {
	let latest = null;
	try {
		const result = spawnSync("npm", [
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
function userPluginNames(ctx) {
	return [...new Set(collectLoaderEntries(ctx).map((row) => row.name).filter((name) => !name.startsWith("@deepseek-ai/") && !name.startsWith("@cordisjs/") && !name.startsWith("cordis:")))];
}
/**
* 批量强制刷新版本缓存（可选 force；手动检查时用）。
* @returns 是否实际执行了查询（false = 距上次刷新 < 最小间隔，直接返回缓存）。
*/
function refreshVersions(ctx, force) {
	const now = Date.now();
	if (!force && now - lastVersionRefreshAt < VERSION_REFRESH_MIN_MS) return false;
	lastVersionRefreshAt = now;
	for (const name of userPluginNames(ctx)) npmViewLatest(name);
	return true;
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
/** 遍历 loader 树收集全部条目（含嵌套子树），id 取短 id（options.id）。 */
function collectLoaderEntries(ctx) {
	const loader = ctx.loader;
	if (loader?.entries === void 0) return [];
	const byId = /* @__PURE__ */ new Map();
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
			kind: "loader"
		};
		const prev = byId.get(id);
		if (prev === void 0 || prev.disabled === true && row.disabled === false) byId.set(id, row);
	}
	return [...byId.values()];
}
/** cordis FiberState.ACTIVE（wrapper 同款常量，保持对齐）。 */
const FIBER_ACTIVE = 2;
/**
* 读 repository 插件的 manifest 名（wrapper 内嵌）：specifier →
* cacheKey(sha256) → cache 的 dsh-plugin.mjs → manifest.name。
* cache 未预填充/不可读时返回 undefined（插件未装，无从显示状态）。
*/
function repositoryManifestName(specifier) {
	try {
		const key = createHash("sha256").update(specifier).digest("hex");
		const wrapper = join(resolveDshHome(), "cache", "repository-plugins", key, "node_modules", "repository", "dsh-plugin.mjs");
		const text = readFileSync(wrapper, "utf8");
		const match = /const manifest = (\{.*?\})/.exec(text);
		if (match === null) return void 0;
		const manifest = JSON.parse(match[1]);
		return typeof manifest.name === "string" ? manifest.name : void 0;
	} catch {
		return;
	}
}
/** repository 插件的 cache 包目录（与 manifest wrapper 同目录）。 */
function repositoryCacheDir(specifier) {
	const key = createHash("sha256").update(specifier).digest("hex");
	return join(resolveDshHome(), "cache", "repository-plugins", key, "node_modules", "repository");
}
/** 读 repository 插件 cache 包的 version（package.json）；未准备/不可读返回 undefined。 */
function readRepositoryVersion(specifier) {
	try {
		const manifest = JSON.parse(readFileSync(join(repositoryCacheDir(specifier), "package.json"), "utf8"));
		return typeof manifest.version === "string" ? manifest.version : void 0;
	} catch {
		return;
	}
}
/** 从 config 源列表构建 specifier → 插件元信息（version/ref 本地零网络）。 */
function repositoryMetaMap(repositories) {
	const map = /* @__PURE__ */ new Map();
	for (const source of repositories) {
		const parsed = parseSource(source);
		map.set(source, {
			pluginName: repositoryManifestName(source),
			version: readRepositoryVersion(source),
			ref: parsed?.ref,
			refKind: parsed !== null && isCommitSha(parsed.ref) ? "sha" : parsed !== null ? "branch" : void 0
		});
	}
	return map;
}
/**
* 枚举 RepositoryCache 挂载的 repository 插件（并入「已加载插件」）。
*
* 识别：config 的每个 repository 源（specifier）经 cache 的 wrapper manifest
* 得到插件名；`ctx.registry` 里 runtime.name 命中该集合的即 repository 插件
* （wrapper 挂载的 runtime），运行状态 = 任一 fiber active。不依赖 fiber 父
* 链（cordis 拦截 ctx.parent 访问）。版本/ref 从 cache 包与 config 行取（零网络）。
*/
function collectRepositoryPlugins(ctx) {
	const metaBySpec = repositoryMetaMap(readRepositories().repositories);
	const byName = /* @__PURE__ */ new Map();
	for (const [source, meta] of metaBySpec.entries()) {
		if (meta.pluginName === void 0) continue;
		byName.set(meta.pluginName, {
			id: meta.pluginName,
			name: meta.pluginName,
			disabled: true,
			version: meta.version,
			kind: "repository",
			ref: meta.ref,
			refKind: meta.refKind,
			source
		});
	}
	if (byName.size === 0) return [];
	const registry = ctx.registry;
	if (registry?.entries === void 0) return [...byName.values()];
	for (const [, runtime] of registry.entries()) {
		const name = runtime.name;
		if (typeof name !== "string" || !byName.has(name)) continue;
		const fibers = [...runtime.fibers ?? []];
		const row = byName.get(name);
		if (fibers.some((f) => f.state === FIBER_ACTIVE)) row.disabled = false;
	}
	return [...byName.values()];
}
/** 注册控制台路由：GET 读列表，POST 写列表。 */
function apply(ctx) {
	ctx.effect(() => {
		const pluginTools = createPluginTools({
			dshHome: () => resolveDshHome(),
			readRepositories,
			writeRepositories,
			bundleInstall: (source) => {
				const result = runPnpm(["add", source]);
				return result.ok ? {
					names: result.names,
					output: result.output
				} : null;
			}
		});
		const disposeTools = ctx.tools?.register !== void 0 ? pluginTools.map((tool) => ctx.tools.register(tool)) : [];
		if (disposeTools.length > 0) console.log(`[plugin-console] registered plugin tools: ${pluginTools.map((t) => t.name).join(", ")}`);
		const httpServer = ctx.httpServer;
		if (httpServer === void 0) return () => {
			for (const dispose of disposeTools) dispose();
		};
		const prescanTimer = setTimeout(() => {
			try {
				refreshVersions(ctx, false);
			} catch (error) {
				console.log(`[plugin-console] version prescan failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}, 3e4);
		const disposeRoutes = httpServer.register({
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
					if (method === "GET" && (path === "/api/plugin-console/repositories" || path === "/api/plugin-console/repositories/")) {
						const sources = readRepositories().repositories;
						const meta = repositoryMetaMap(sources);
						const mountedNames = new Set(collectRepositoryPlugins(ctx).filter((r) => !r.disabled).map((r) => r.name));
						const rows = sources.map((source) => {
							const m = meta.get(source);
							return {
								source,
								parsed: parseSource(source) ?? void 0,
								pluginName: m?.pluginName,
								version: m?.version,
								ref: m?.ref,
								refKind: m?.refKind,
								mounted: m?.pluginName !== void 0 && mountedNames.has(m.pluginName)
							};
						});
						json(200, {
							ok: true,
							repositories: rows,
							present: rows.length > 0
						});
						return;
					}
					if (method === "POST" && (path === "/api/plugin-console/repositories" || path === "/api/plugin-console/repositories/")) {
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							writeRepositories(JSON.parse(body).repositories ?? []);
							json(200, { ok: true });
						});
						return;
					}
					if (method === "GET" && (path === "/api/plugin-console/updates" || path === "/api/plugin-console/updates/")) {
						(async () => {
							try {
								const rows = await checkUpdates(readRepositories().repositories);
								json(200, {
									ok: true,
									updates: rows
								});
							} catch (error) {
								json(500, {
									ok: false,
									message: error instanceof Error ? error.message : String(error)
								});
							}
						})();
						return;
					}
					if (method === "POST" && (path === "/api/plugin-console/updates" || path === "/api/plugin-console/updates/")) {
						let body = "";
						req?.on?.("data", (c) => {
							body += c.toString("utf8");
						});
						req?.on?.("end", () => {
							(async () => {
								try {
									const source = JSON.parse(body).source ?? "";
									const current = readRepositories().repositories;
									if (!current.includes(source)) {
										json(404, {
											ok: false,
											message: `source not configured: ${source}`
										});
										return;
									}
									const parsedSource = parseSource(source);
									if (parsedSource === null) {
										json(400, {
											ok: false,
											message: "unsupported source (expected github:owner/repo#ref)"
										});
										return;
									}
									const result = await gitRemoteCommit(parsedSource.owner, parsedSource.repo, parsedSource.ref);
									if (result.sha === null) {
										json(result.missing ? 400 : 502, {
											ok: false,
											message: result.missing ? "remote has no such ref（未推送或已删除）" : "cannot reach remote (network/credentials)"
										});
										return;
									}
									if (result.sha === parsedSource.ref) {
										json(200, {
											ok: true,
											updated: false,
											source,
											latestSha: result.sha
										});
										return;
									}
									const updated = `github:${parsedSource.owner}/${parsedSource.repo}#${result.sha}${parsedSource.tail}`;
									writeRepositories(current.map((item) => item === source ? updated : item));
									json(200, {
										ok: true,
										updated: true,
										source,
										from: parsedSource.ref,
										to: latest
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
							plugins: [...collectLoaderEntries(ctx), ...collectRepositoryPlugins(ctx)]
						});
						return;
					}
					if (method === "GET" && (path === "/api/plugin-console/versions" || path === "/api/plugin-console/versions/")) {
						json(200, {
							ok: true,
							versions: userPluginNames(ctx).map((name) => {
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
							refreshed: refreshVersions(ctx, false),
							versions: userPluginNames(ctx).map((name) => {
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
