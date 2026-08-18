/**
 * 薄控制台面板（0811 适配，UI 对齐官方「模型」设置页设计语言）：
 * - 已加载插件：loader 树条目（用户可管理项默认展示，官方内置折叠），
 *   状态三态——运行中 / 预设挂载（host 停用但 agent preset 挂载，0811
 *   preset 通道）/ 已停用
 * - 安装插件：统一入口——输入包名自动 pnpm add + 按 dsh.bundle 声明分流
 *   （bundle → 层栈重启生效；非 bundle → insert 行配置 HMR 实时挂载）
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
  /** host 停用但由 agent preset 挂载（0811 preset 通道）。 */
  presetMounted?: boolean
  /** 是否由 profile patch insert 行挂载（非 bundle 插件）。 */
  insertRow?: boolean
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

/**
 * 状态 Pill 三态（0811 preset 通道修正）：
 * - host 挂载 → 运行中
 * - host 停用 + preset 挂载 → 预设挂载（不是「已停用」——模型实际有这工具）
 * - host 停用 + preset 无 → 已停用
 */
function statePill(plugin: LoadedPluginRow): React.ReactNode {
  if (!plugin.disabled) return <Pill active>运行中</Pill>
  if (plugin.presetMounted === true) return <Pill>预设挂载</Pill>
  return <Pill>已停用</Pill>
}

/** 设置页面板主体（对齐官方「模型」设置页）。 */
export function ConsolePanel(): React.ReactNode {
  const [installed, setInstalled] = useState<LoadedPluginRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [installInput, setInstallInput] = useState('')
  const [installBusy, setInstallBusy] = useState(false)
  const [installMsg, setInstallMsg] = useState<string | undefined>(undefined)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  const [versionChecked, setVersionChecked] = useState<Record<string, boolean>>({})

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [installedRes, versionsRes] = await Promise.all([
        fetch('/api/plugin-console/installed', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/versions', { headers: { accept: 'application/json' } }),
      ])
      const installedBody = (await installedRes.json()) as { plugins?: LoadedPluginRow[]; ok?: boolean }
      const versionsBody = (await versionsRes.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; ok?: boolean }
      setInstalled(installedBody.plugins ?? [])
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

  /** 统一安装：输入包名 → pnpm add → 按 dsh.bundle 分流（bundle 层栈 / insert 行实时）。 */
  const installPlugin = useCallback(async (): Promise<void> => {
    const source = installInput.trim()
    if (source.length === 0) return
    setInstallBusy(true)
    setInstallMsg(undefined)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const body = (await response.json()) as { ok?: boolean; kind?: string; name?: string; needsRestart?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'install failed')
      setInstallMsg(body.message ?? '已安装')
      setInstallInput('')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setInstallBusy(false)
    }
  }, [installInput, refresh])

  /** bundle 更新（pnpm update <name>，拉取最新版本）。 */
  const updateBundle = useCallback(async (name: string): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'update', name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'update failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  /** bundle 卸载（pnpm remove + 层栈 reconcile；确认弹窗防误触；重启生效）。 */
  const removeBundle = useCallback(async (name: string): Promise<void> => {
    if (!window.confirm(`卸载 bundle 插件 ${name}？将从 profile 移除依赖与层栈（重启 web 生效）。`)) return
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/bundles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', name }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'remove failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>

  // 区分产品内置（@deepseek-ai/*、@cordisjs/*、cordis: 组合）与用户添加。
  const isOfficial = (p: LoadedPluginRow): boolean =>
    p.name.startsWith('@deepseek-ai/') || p.name.startsWith('@cordisjs/') || p.name.startsWith('cordis:')
  // 管理工具自身：禁用会卸载本面板（管理入口消失），不可停用。
  const isSelf = (p: LoadedPluginRow): boolean => p.name === '@vlln/plugin-console'
  // 用户可管理项：非官方 + 非管理工具自身；默认展示（官方 124 个折叠）。
  const userRows = installed.filter(p => !isOfficial(p) && !isSelf(p))
  const officialRows = installed.filter(p => isOfficial(p))
  const shown = showAll ? installed : userRows

  const sectionHeader = (title: string, actions?: React.ReactNode): React.ReactNode => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <h2 style={{ ...titleStyle, flex: 1, margin: 0 }}>{title}</h2>
      {actions}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720, color: 'var(--dsw-alias-label-primary)' }}>
      {error !== undefined ? <p style={errorStyle}>{error}</p> : null}

      {/* 安装插件：统一入口（自动 pnpm add + 按形态分流） */}
      <section style={sectionStyle}>
        {sectionHeader('安装插件')}
        <p style={introStyle}>输入 npm 包名或 GitHub 项目——自动安装并挂载：bundle 插件（声明 dsh.bundle）加入层栈（重启生效）；非 bundle 插件写 insert 行（配置 HMR 实时挂载，无需重启）。GitHub 项目支持 https://github.com/o/r、github.com/o/r、github:o/r 三种写法。</p>
        {installMsg !== undefined ? <p style={savedStyle}>{installMsg}</p> : null}
        <div style={editorStyle}>
          <div style={fieldStyle}>
            <label style={fieldLabelStyle} htmlFor="console-install-source">包名 / 源</label>
            <Input
              id="console-install-source"
              value={installInput}
              placeholder="npm 包名 / https://github.com/o/r / github:o/r"
              onChange={(e) => { setInstallInput(e.target.value) }}
            />
          </div>
          <div style={editorActionsStyle}>
            <Button size="sm" variant="outline" disabled={installBusy} onClick={() => { void installPlugin() }}>
              {installBusy ? '安装中' : '安装'}
            </Button>
          </div>
        </div>
      </section>

      {/* 已加载插件：默认用户可管理项，官方内置折叠 */}
      <section style={sectionStyle}>
        {sectionHeader(
          `已加载插件（${userRows.length} 用户 / ${officialRows.length} 内置）`,
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void checkAll() }}>
              {busy ? '检查中' : '检查更新'}
            </Button>
            {officialRows.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => { setShowAll(v => !v) }}>
                {showAll ? '只看用户' : `查看全部（${installed.length}）`}
              </Button>
            ) : null}
          </div>,
        )}
        <div style={rowsStyle}>
          {shown.map(plugin => {
            const version = versionText(plugin, versions[plugin.name] ?? null, versionChecked[plugin.name] === true)
            const isUserRow = !isOfficial(plugin) && !isSelf(plugin)
            return (
              <div key={showAll ? `a${plugin.id}` : `u${plugin.id}`} style={rowCardStyle}>
                <div style={rowHeadStyle}>
                  <span style={identityStyle}>
                    <span style={nameStyle}>{plugin.name}</span>
                  </span>
                  <span style={actionsStyle}>
                    {isUserRow && version.canUpdate ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void updateBundle(plugin.name) }}>更新</Button>
                    ) : null}
                    {isUserRow && plugin.insertRow !== true ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void togglePlugin(plugin.id, !plugin.disabled) }}>
                        {plugin.disabled ? '启用' : '停用'}
                      </Button>
                    ) : null}
                    {isUserRow && plugin.insertRow !== true ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void removeBundle(plugin.name) }}>卸载</Button>
                    ) : null}
                    {isSelf(plugin) ? <Pill>管理工具</Pill> : null}
                    {plugin.insertRow === true ? <Pill>insert</Pill> : null}
                    {statePill(plugin)}
                  </span>
                </div>
                <span style={versionLineStyle}>{version.text}</span>
              </div>
            )
          })}
          {shown.length === 0 ? <p style={{ ...introStyle, fontSize: 12 }}>未加载任何插件。</p> : null}
        </div>
      </section>
    </div>
  )
}
