/**
 * 薄控制台面板（0811 适配，UI 对齐官方「模型」设置页设计语言）：
 * - 已加载插件：loader 树条目（启停 + 版本 + 更新/卸载）
 * - 已挂载 insert 插件：profile patch 的 insert 行（非 bundle 插件，
 *   配置 HMR 实时挂载——添加/移除即时生效，无需重启）
 * - 安装 bundle 插件：pnpm add + reconcile 层栈（重启生效）
 * 全部 token 走 --dsw-alias-*；零 CSS 依赖（inline 样式）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'

/** loader 树已加载插件（Node half /installed，实时）。 */
interface LoadedPluginRow {
  id: string
  name: string
  disabled: boolean
  version?: string
  kind?: 'loader'
}

/** profile patch insert 行（非 bundle 插件安装态）。 */
interface InsertRow {
  id: string
  name: string
}

/* ---- 官方「模型」页设计语言（ModelsSection.module.css 对齐） ---- */
const sectionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720,
  color: 'var(--dsw-alias-label-primary)',
}
const titleStyle: React.CSSProperties = {
  margin: 0, fontSize: 16, lineHeight: '24px', fontWeight: 500,
  color: 'var(--dsw-alias-label-primary)',
}
const introStyle: React.CSSProperties = {
  margin: 0, fontSize: 14, lineHeight: '22px', color: 'var(--dsw-alias-label-tertiary)',
}
const rowsStyle: React.CSSProperties = {
  margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8,
}
const rowCardStyle: React.CSSProperties = {
  border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12,
  padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
}
const rowHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 }
const identityStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1,
}
const nameStyle: React.CSSProperties = {
  fontSize: 14, lineHeight: '22px', fontWeight: 500, color: 'var(--dsw-alias-label-primary)',
}
const versionLineStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-tertiary)',
  fontFamily: 'ui-monospace, monospace',
}
const actionsStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto',
}
const editorStyle: React.CSSProperties = {
  borderRadius: 12, background: 'var(--dsw-alias-bg-module-platform)',
  padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14,
}
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12, lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)',
}
const editorActionsStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', gap: 8,
}
const errorStyle: React.CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)',
}
const savedStyle: React.CSSProperties = {
  margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-success-primary)',
}

/** 版本行：v当前 · latest（可更新时高亮）；本地/非 registry 包无 latest。 */
function versionText(plugin: LoadedPluginRow, latest: string | null, checked: boolean): { text: string; canUpdate: boolean } {
  const current = plugin.version === undefined ? '?' : `v${plugin.version}`
  if (!checked) return { text: `${current} · 待检查`, canUpdate: false }
  if (latest === null) return { text: `${current} · 本地`, canUpdate: false }
  if (latest === plugin.version) return { text: `${current} · 已最新`, canUpdate: false }
  return { text: `${current} → v${latest}`, canUpdate: true }
}

/** 设置页面板主体（对齐官方「模型」设置页）。 */
export function ConsolePanel(): React.ReactNode {
  const [installed, setInstalled] = useState<LoadedPluginRow[]>([])
  const [inserts, setInserts] = useState<InsertRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [insertInput, setInsertInput] = useState('')
  const [insertBusy, setInsertBusy] = useState(false)
  const [insertMsg, setInsertMsg] = useState<string | undefined>(undefined)
  const [bundleInput, setBundleInput] = useState('')
  const [bundleBusy, setBundleBusy] = useState(false)
  const [bundleMsg, setBundleMsg] = useState<string | undefined>(undefined)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  const [versionChecked, setVersionChecked] = useState<Record<string, boolean>>({})

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [installedRes, versionsRes, insertsRes] = await Promise.all([
        fetch('/api/plugin-console/installed', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/versions', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/inserts', { headers: { accept: 'application/json' } }),
      ])
      const installedBody = (await installedRes.json()) as { plugins?: LoadedPluginRow[]; ok?: boolean }
      const versionsBody = (await versionsRes.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; ok?: boolean }
      const insertsBody = (await insertsRes.json()) as { inserts?: InsertRow[]; ok?: boolean }
      setInstalled(installedBody.plugins ?? [])
      setInserts(insertsBody.inserts ?? [])
      const map: Record<string, string | null> = {}
      const checkedMap: Record<string, boolean> = {}
      for (const row of versionsBody.versions ?? []) {
        map[row.name] = row.latest
        checkedMap[row.name] = row.checked === true
      }
      setVersions(map)
      setVersionChecked(checkedMap)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  /** 运行时启停（loader 树立即生效）+ 写 profile patch 持久化。 */
  const togglePlugin = useCallback(async (id: string, disabled: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch(`/api/plugin-console/installed/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ disabled }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'toggle failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  /** 统一检查更新：npm 版本批量查（结果共享已加载区）。 */
  const checkAll = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const versionRes = await fetch('/api/plugin-console/versions/refresh', { method: 'POST', headers: { accept: 'application/json' } })
      const versionBody = (await versionRes.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[] }
      const map: Record<string, string | null> = {}
      const checkedMap: Record<string, boolean> = {}
      for (const row of versionBody.versions ?? []) {
        map[row.name] = row.latest
        checkedMap[row.name] = row.checked === true
      }
      setVersions(map)
      setVersionChecked(checkedMap)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  /** insert 插件：写行（配置 HMR 实时挂载）。 */
  const addInsert = useCallback(async (): Promise<void> => {
    const name = insertInput.trim()
    if (name.length === 0) return
    setInsertBusy(true)
    setInsertMsg(undefined)
    setError(undefined)
    try {
      const id = name.replace(/^@/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
      const response = await fetch(`/api/plugin-console/inserts/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'insert failed')
      setInsertMsg(`已挂载 ${name}（配置 HMR 实时生效，无需重启）`)
      setInsertInput('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setInsertBusy(false)
    }
  }, [insertInput, refresh])

  /** insert 插件：移除行（配置 HMR 实时卸载）。 */
  const removeInsert = useCallback(async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`移除插件 ${name}？将从 profile patch 删除其 insert 行（配置 HMR 实时生效）。`)) return
    setInsertBusy(true)
    setInsertMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch(`/api/plugin-console/inserts/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ remove: true }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'remove failed')
      setInsertMsg(`${name} 已移除（配置 HMR 实时生效）`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setInsertBusy(false)
    }
  }, [refresh])

  /** bundle 安装（profile 目录 pnpm add + reconcile 层栈）。 */
  const installBundle = useCallback(async (): Promise<void> => {
    const source = bundleInput.trim()
    if (source.length === 0) return
    setBundleBusy(true)
    setBundleMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'install', source }),
      })
      const body = (await response.json()) as { ok?: boolean; names?: string[]; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'install failed')
      setBundleMsg(`已安装并加入层栈：${(body.names ?? []).join(', ') || source}（重启 web 生效）`)
      setBundleInput('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBundleBusy(false)
    }
  }, [bundleInput])

  /** bundle 更新（pnpm update <name>，拉取最新版本）。 */
  const updateBundle = useCallback(async (name: string): Promise<void> => {
    setBundleBusy(true)
    setBundleMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'update failed')
      setBundleMsg(`${name} 已更新（重启 web 生效）`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBundleBusy(false)
    }
  }, [])

  /** bundle 卸载（pnpm remove + 层栈 reconcile；确认弹窗防误触；重启生效）。 */
  const removeBundle = useCallback(async (name: string): Promise<void> => {
    if (!window.confirm(`卸载 bundle 插件 ${name}？将从 profile 移除依赖与层栈（重启 web 生效）。`)) return
    setBundleBusy(true)
    setBundleMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'remove failed')
      setBundleMsg(`${name} 已卸载（重启 web 生效）`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBundleBusy(false)
    }
  }, [refresh])

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>

  // 区分产品内置（@deepseek-ai/*、@cordisjs/*、cordis: 组合）与用户添加。
  const isOfficial = (p: LoadedPluginRow): boolean =>
    p.name.startsWith('@deepseek-ai/') || p.name.startsWith('@cordisjs/') || p.name.startsWith('cordis:')
  // 管理工具自身：禁用会卸载本面板（管理入口消失），不可停用。
  const isSelf = (p: LoadedPluginRow): boolean => p.name === '@dsh-external/plugin-console'
  const official = installed.filter(isOfficial)
  const user = installed.filter(p => !isOfficial(p))
  const shown = showAll ? installed : user

  const sectionHeader = (title: string, actions?: React.ReactNode): React.ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <h2 style={{ ...titleStyle, flex: 1, margin: 0 }}>{title}</h2>
      {actions}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' }}>
      {error !== undefined ? <p style={errorStyle}>{error}</p> : null}

      {/* 已加载插件：统一行（bundle + 内置），状态/生命周期 */}
      <section style={sectionStyle}>
        {sectionHeader(
          `已加载插件（${user.length} 用户 / ${official.length} 内置）`,
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void checkAll() }}>
              {busy ? '检查中' : '检查更新'}
            </Button>
            {official.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => { setShowAll(v => !v) }}>
                {showAll ? '只看用户' : `查看全部（${installed.length}）`}
              </Button>
            ) : null}
          </div>,
        )}
        <div style={rowsStyle}>
          {shown.map(plugin => {
            const version = versionText(plugin, versions[plugin.name] ?? null, versionChecked[plugin.name] === true)
            const isUserBundle = !official.includes(plugin) && !isSelf(plugin)
            return (
              <div key={showAll ? `a${plugin.id}` : `u${plugin.id}`} style={rowCardStyle}>
                <div style={rowHeadStyle}>
                  <span style={identityStyle}>
                    <span style={nameStyle}>{plugin.name}</span>
                  </span>
                  <span style={actionsStyle}>
                    {isUserBundle && version.canUpdate ? (
                      <Button size="sm" variant="outline" disabled={busy || bundleBusy} onClick={() => { void updateBundle(plugin.name) }}>更新</Button>
                    ) : null}
                    {isUserBundle ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void togglePlugin(plugin.id, !plugin.disabled) }}>
                        {plugin.disabled ? '启用' : '停用'}
                      </Button>
                    ) : null}
                    {isUserBundle ? (
                      <Button size="sm" variant="outline" disabled={busy || bundleBusy} onClick={() => { void removeBundle(plugin.name) }}>卸载</Button>
                    ) : null}
                    {official.includes(plugin) ? <Pill>内置</Pill> : null}
                    {isSelf(plugin) ? <Pill>管理工具</Pill> : null}
                    <Pill active={!plugin.disabled}>{plugin.disabled ? '已停用' : '运行中'}</Pill>
                  </span>
                </div>
                <span style={versionLineStyle}>{version.text}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* 已挂载 insert 插件（profile patch insert 行，配置 HMR 实时） */}
      <section style={sectionStyle}>
        {sectionHeader(`insert 插件（${inserts.length}）`)}
        <p style={introStyle}>profile `cordis.patch.yml` 的 insert 行——非 bundle 插件的安装形态。写行/删行由配置 HMR 实时挂载/卸载，无需重启。插件包需先在 profile 中可解析（bundle 安装区或 pnpm add）。</p>
        {inserts.length === 0 ? (
          <p style={{ ...introStyle, fontSize: 12, lineHeight: '18px' }}>未挂载 insert 插件。</p>
        ) : null}
        <div style={rowsStyle}>
          {inserts.map(row => (
            <div key={row.id} style={rowCardStyle}>
              <div style={rowHeadStyle}>
                <span style={identityStyle}>
                  <span style={{ ...nameStyle, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{row.name}</span>
                  <span style={versionLineStyle}>insert id: {row.id} · 实时挂载</span>
                </span>
                <span style={actionsStyle}>
                  <Button size="sm" variant="outline" disabled={insertBusy} onClick={() => { void removeInsert(row.id, row.name) }}>移除</Button>
                </span>
              </div>
            </div>
          ))}
        </div>
        <div style={editorStyle}>
          <div style={fieldStyle}>
            <label style={fieldLabelStyle} htmlFor="console-insert-name">插件包名（npm 包）</label>
            <Input
              id="console-insert-name"
              value={insertInput}
              placeholder="@dsh-external/dsh-loop"
              onChange={(e) => { setInsertInput(e.target.value) }}
            />
          </div>
          {insertMsg !== undefined ? <p style={savedStyle}>{insertMsg}</p> : null}
          <div style={editorActionsStyle}>
            <Button size="sm" variant="outline" disabled={insertBusy} onClick={() => { void addInsert() }}>
              {insertBusy ? '挂载中' : '挂载'}
            </Button>
          </div>
        </div>
      </section>

      {/* 安装 bundle 插件 */}
      <section style={sectionStyle}>
        {sectionHeader('安装 bundle 插件')}
        <p style={introStyle}>pnpm add 到 profile 并加入层栈；安装/更新/卸载后重启 web 生效。</p>
        {bundleMsg !== undefined ? <p style={savedStyle}>{bundleMsg}</p> : null}
        <div style={editorStyle}>
          <div style={fieldStyle}>
            <label style={fieldLabelStyle} htmlFor="console-bundle-source">包源</label>
            <Input
              id="console-bundle-source"
              value={bundleInput}
              placeholder="git+file:///path/to/plugin 或 registry 包名"
              onChange={(e) => { setBundleInput(e.target.value) }}
            />
          </div>
          <div style={editorActionsStyle}>
            <Button size="sm" variant="outline" disabled={busy || bundleBusy} onClick={() => { void installBundle() }}>
              {bundleBusy ? '安装中' : '安装'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
