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
import { useCallback, useEffect, useState } from 'react'
import { Button, Input, Pill } from '@deepseek-ai/dsh-client-ui-primitives'

interface RepositoryState {
  repositories: string[]
  present: boolean
}

/** 一个 repository 源的更新检查结果（Node half /api/plugin-console/updates）。 */
interface UpdateRow {
  source: string
  ref: string
  refKind: 'sha' | 'branch'
  latestSha: string | null
  hasUpdate: boolean
  error?: string
}

/** loader 树已加载插件（Node half /installed，实时）。 */
interface LoadedPluginRow {
  id: string
  name: string
  disabled: boolean
  version?: string
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
const rowHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
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

const shortSha = (sha: string): string => sha.slice(0, 7)

/** 版本行：v当前 · latest（可更新时高亮）；本地/非 registry 包无 latest。 */
function versionText(plugin: LoadedPluginRow, latest: string | null, checked: boolean): { text: string; canUpdate: boolean } {
  const current = plugin.version === undefined ? '?' : `v${plugin.version}`
  if (!checked) return { text: `${current} · 待检查`, canUpdate: false }
  if (latest === null) return { text: `${current} · 本地`, canUpdate: false }
  if (latest === plugin.version) return { text: `${current} · 已最新`, canUpdate: false }
  return { text: `${current} → v${latest}`, canUpdate: true }
}

/** repository 源行的更新状态文本。 */
function updateText(row: UpdateRow): string {
  if (row.error !== undefined) return '无法检查'
  if (row.latestSha === null) return '未知'
  if (row.refKind === 'sha' && !row.hasUpdate) return `已最新 ${shortSha(row.ref)}`
  if (row.refKind === 'sha') return `有更新 ${shortSha(row.ref)}→${shortSha(row.latestSha)}`
  return `分支 ${row.ref}@${shortSha(row.latestSha)}`
}

/** 设置页面板主体（对齐官方「模型」设置页）。 */
export function ConsolePanel(): React.ReactNode {
  const [state, setState] = useState<RepositoryState>({ repositories: [], present: false })
  const [installed, setInstalled] = useState<LoadedPluginRow[]>([])
  const [showAll, setShowAll] = useState(false)
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updates, setUpdates] = useState<UpdateRow[] | undefined>(undefined)
  const [checking, setChecking] = useState(false)
  const [bundleInput, setBundleInput] = useState('')
  const [bundleBusy, setBundleBusy] = useState(false)
  const [bundleMsg, setBundleMsg] = useState<string | undefined>(undefined)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  const [versionChecked, setVersionChecked] = useState<Record<string, boolean>>({})
  const [versionBusy, setVersionBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [repoRes, installedRes, versionsRes] = await Promise.all([
        fetch('/api/plugin-console/repositories', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/installed', { headers: { accept: 'application/json' } }),
        fetch('/api/plugin-console/versions', { headers: { accept: 'application/json' } }),
      ])
      const repoBody = (await repoRes.json()) as RepositoryState & { ok?: boolean }
      const installedBody = (await installedRes.json()) as { plugins?: LoadedPluginRow[]; ok?: boolean }
      const versionsBody = (await versionsRes.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; ok?: boolean }
      setState({ repositories: repoBody.repositories ?? [], present: repoBody.present ?? false })
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

  const save = useCallback(async (repositories: string[]): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/repositories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repositories }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'save failed')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh])

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

  /** 检查全部 repository 源的远端更新状态。 */
  const checkUpdates = useCallback(async (): Promise<void> => {
    setChecking(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/updates', { headers: { accept: 'application/json' } })
      const body = (await response.json()) as { ok?: boolean; updates?: UpdateRow[]; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'check failed')
      setUpdates(body.updates ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setChecking(false)
    }
  }, [])

  /** 把指定源的 ref 更新为远端最新 commit（写配置，官方换代在下次启动）。 */
  const applyUpdate = useCallback(async (source: string): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/updates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source }),
      })
      const body = (await response.json()) as { ok?: boolean; message?: string }
      if (body.ok !== true) throw new Error(body.message ?? 'update failed')
      await refresh()
      await checkUpdates()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }, [refresh, checkUpdates])

  const add = useCallback(async (): Promise<void> => {
    const value = input.trim()
    if (value.length === 0) return
    if (!state.repositories.includes(value)) {
      await save([...state.repositories, value])
      setUpdates(undefined)
    }
    setInput('')
  }, [input, state.repositories, save])

  const remove = useCallback((id: string): void => {
    void save(state.repositories.filter(r => r !== id))
  }, [state.repositories, save])

  /** 手动检查最新版本（POST refresh，Node half 30s 防抖）。 */
  const refreshVersions = useCallback(async (): Promise<void> => {
    setVersionBusy(true)
    setError(undefined)
    try {
      const response = await fetch('/api/plugin-console/versions/refresh', { method: 'POST', headers: { accept: 'application/json' } })
      const body = (await response.json()) as { versions?: { name: string; latest: string | null; checked?: boolean }[]; message?: string }
      const map: Record<string, string | null> = {}
      const checkedMap: Record<string, boolean> = {}
      for (const row of body.versions ?? []) {
        map[row.name] = row.latest
        checkedMap[row.name] = row.checked === true
      }
      setVersions(map)
      setVersionChecked(checkedMap)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setVersionBusy(false)
    }
  }, [])

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

  useEffect(() => { void refresh() }, [refresh])

  if (loading) return <p style={{ color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>

  // 区分产品内置（@deepseek-ai/*、@cordisjs/*、cordis: 组合）与用户添加。
  const isOfficial = (p: LoadedPluginRow): boolean =>
    p.name.startsWith('@deepseek-ai/') || p.name.startsWith('@cordisjs/') || p.name.startsWith('cordis:')
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

      {/* 已加载插件 */}
      <section style={sectionStyle}>
        {sectionHeader(
          `已加载插件（${user.length} 用户 / ${official.length} 内置）`,
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" disabled={versionBusy} onClick={() => { void refreshVersions() }}>
              {versionBusy ? '检查中' : '检查更新'}
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
            const latest = versions[plugin.name] ?? null
            const version = versionText(plugin, latest, versionChecked[plugin.name] === true)
            return (
              <div key={plugin.id} style={rowCardStyle}>
                <div style={rowHeadStyle}>
                  <span style={identityStyle}>
                    <span style={nameStyle}>{plugin.name}</span>
                  </span>
                  <span style={actionsStyle}>
                    {!official.includes(plugin) && version.canUpdate ? (
                      <Button size="sm" variant="outline" disabled={busy || bundleBusy} onClick={() => { void updateBundle(plugin.name) }}>更新</Button>
                    ) : null}
                    {/* 内置插件不可停用（官方组合层）；仅用户插件可启停 */}
                    {!official.includes(plugin) ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void togglePlugin(plugin.id, !plugin.disabled) }}>
                        {plugin.disabled ? '启用' : '停用'}
                      </Button>
                    ) : null}
                    {/* 状态 Pill 贴右缘（名称左、按钮中、Pill 右） */}
                    {official.includes(plugin) ? <Pill>内置</Pill> : null}
                    <Pill active={!plugin.disabled}>{plugin.disabled ? '已停用' : '运行中'}</Pill>
                  </span>
                </div>
                <span style={versionLineStyle}>{version.text}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* repository 插件 */}
      <section style={sectionStyle}>
        {sectionHeader(
          'repository 插件',
          <Button size="sm" variant="outline" disabled={busy || checking} onClick={() => { void checkUpdates() }}>
            {checking ? '检查中' : '检查更新'}
          </Button>,
        )}
        <p style={introStyle}>`.dsh-plugin` 包源列表；增删行 = 装/卸，更新 = 固定到远端最新 commit。</p>
        {state.repositories.length === 0 ? (
          <p style={{ ...introStyle, fontSize: 12, lineHeight: '18px' }}>未配置 repository 插件源。</p>
        ) : null}
        <div style={rowsStyle}>
          {state.repositories.map(id => {
            const upd = updates?.find(u => u.source === id)
            const canUpdate = upd !== undefined && (upd.hasUpdate || upd.refKind === 'branch') && upd.latestSha !== null
            return (
              <div key={id} style={rowCardStyle}>
                <div style={rowHeadStyle}>
                  <span style={{ ...identityStyle, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ ...nameStyle, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{id}</span>
                    {upd !== undefined ? <span style={versionLineStyle}>{updateText(upd)}</span> : null}
                  </span>
                  <span style={actionsStyle}>
                    {canUpdate ? (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => { void applyUpdate(id) }}>更新</Button>
                    ) : null}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => { remove(id) }}>移除</Button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={editorStyle}>
          <div style={fieldStyle}>
            <label style={fieldLabelStyle} htmlFor="console-repo-source">插件源（github:owner/repo#ref）</label>
            <Input
              id="console-repo-source"
              value={input}
              placeholder="github:owner/repo#ref"
              onChange={(e) => { setInput(e.target.value) }}
            />
          </div>
          <div style={editorActionsStyle}>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void add() }}>添加</Button>
          </div>
        </div>
      </section>

      {/* 安装 bundle 插件 */}
      <section style={sectionStyle}>
        {sectionHeader('安装 bundle 插件')}
        <p style={introStyle}>pnpm add 到 profile 并加入层栈；安装/更新后重启 web 生效。</p>
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
