// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PluginEntryView } from '../src/client/api.ts'
import { PluginPanel, type PluginPanelProps } from '../src/client/PluginPanel.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function entry(overrides: Partial<PluginEntryView>): PluginEntryView {
  return {
    id: 'acme/tool',
    version: '0.1.0',
    description: 'demo',
    installed: false,
    enabled: false,
    ...overrides,
  }
}

/**
 * A stateful in-memory registry behind a fetch stub for `/api/plugin-registry`:
 * each mutation applies to the rows synchronously, so the panel's post-action
 * refresh observes the new state (mirroring the host's live registry).
 */
function stubRegistry() {
  const calls: string[] = []
  let rows: PluginEntryView[] = []
  const patch = (id: string, change: Partial<PluginEntryView>): void => {
    rows = rows.map(row => row.id === id ? { ...row, ...change } : row)
  }
  let failNext: { action: string; message: string } | undefined

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'GET' && url === '/api/plugin-registry/plugins') {
      return Response.json({ ok: true, plugins: rows })
    }
    const match = /^\/api\/plugin-registry\/plugins\/(install|enable|disable|uninstall)$/.exec(url)
    if (method === 'POST' && match !== null) {
      const action = match[1] as 'install' | 'enable' | 'disable' | 'uninstall'
      const body = JSON.parse(String(init?.body)) as { id: string }
      calls.push(`${action}:${body.id}`)
      if (failNext !== undefined && failNext.action === action) {
        const { message } = failNext
        failNext = undefined
        return Response.json({ ok: false, message }, { status: 500 })
      }
      if (action === 'install') patch(body.id, { installed: true, enabled: false })
      if (action === 'enable') patch(body.id, { enabled: true })
      if (action === 'disable') patch(body.id, { enabled: false })
      if (action === 'uninstall') patch(body.id, { installed: false, enabled: false })
      return Response.json({ ok: true, id: body.id })
    }
    return Response.json({ ok: false, message: 'not found' }, { status: 404 })
  })

  return {
    fetchStub,
    calls,
    setRows: (next: PluginEntryView[]): void => { rows = next },
    failNext: (action: string, message: string): void => { failNext = { action, message } },
    stub: (): void => { vi.stubGlobal('fetch', fetchStub) },
  }
}

let stubRegistryState: ReturnType<typeof stubRegistry> | undefined

beforeEach(() => {
  stubRegistryState = stubRegistry()
  stubRegistryState.stub()
})

function props(): PluginPanelProps {
  return {} as PluginPanelProps
}

describe('PluginPanel', () => {
  it('renders the browse rows with state badges and actions', async () => {
    const { setRows } = stubRegistryState!
    setRows([
      entry({ id: 'acme/available' }),
      entry({ id: 'acme/installed', installed: true, enabled: false }),
      entry({ id: 'acme/running', installed: true, enabled: true }),
    ])
    render(<PluginPanel {...props()} />)

    await screen.findByText('acme/available')
    expect(screen.getByText('未安装')).toBeTruthy()
    expect(screen.getByText('已禁用')).toBeTruthy()
    expect(screen.getByText('已启用')).toBeTruthy()
    // available → install; installed-disabled → enable+uninstall; running → disable+uninstall
    expect(screen.getAllByText('安装')).toHaveLength(1)
    expect(screen.getAllByText('启用')).toHaveLength(1)
    expect(screen.getAllByText('禁用')).toHaveLength(1)
    expect(screen.getAllByText('卸载')).toHaveLength(2)
  })

  it('filters rows by id and description', async () => {
    const { setRows } = stubRegistryState!
    setRows([entry({ id: 'acme/alpha' }), entry({ id: 'zeta/beta', description: 'weather tool' })])
    render(<PluginPanel {...props()} />)
    await screen.findByText('acme/alpha')

    fireEvent.change(screen.getByLabelText('搜索插件'), { target: { value: 'weather' } })
    expect(screen.queryByText('acme/alpha')).toBeNull()
    expect(screen.getByText('zeta/beta')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('搜索插件'), { target: { value: 'zeta' } })
    expect(screen.getByText('zeta/beta')).toBeTruthy()
  })

  it('installs, enables, disables, and uninstalls through the API and refreshes', async () => {
    const { calls, setRows } = stubRegistryState!
    setRows([entry({ id: 'acme/one' })])
    render(<PluginPanel {...props()} />)
    await screen.findByText('acme/one')

    fireEvent.click(screen.getByText('安装'))
    await screen.findByText('已禁用')

    fireEvent.click(screen.getByText('启用'))
    await screen.findByText('已启用')

    fireEvent.click(screen.getByText('禁用'))
    await screen.findByText('已禁用')

    fireEvent.click(screen.getByText('卸载'))
    await screen.findByText('未安装')

    expect(calls).toEqual(['install:acme/one', 'enable:acme/one', 'disable:acme/one', 'uninstall:acme/one'])
  })

  it('shows an empty hint when nothing is discovered', async () => {
    render(<PluginPanel {...props()} />)
    await screen.findByText(/尚未发现插件/)
  })

  it('surfaces an enable failure instead of staying silent', async () => {
    const { setRows, failNext } = stubRegistryState!
    setRows([entry({ id: 'broken/ghost', installed: true, enabled: false })])
    // The route returns ok:false for business failures (declared tool never
    // registered), not a thrown rejection — the failure shape is the runtime
    // reality the panel must surface.
    failNext('enable', 'plugin broken/ghost declares tools [ghost-tool] but registered none')
    render(<PluginPanel {...props()} />)
    await screen.findByText('broken/ghost')

    fireEvent.click(screen.getByText('启用'))
    // The failure is visible: the row still reads disabled and an alert shows
    // the API message — no dead click.
    await screen.findByRole('alert')
    expect(screen.getByRole('alert').textContent).toContain('broken/ghost')
    expect(screen.getByRole('alert').textContent).toContain('ghost-tool')
    expect(screen.getByText('已禁用')).toBeTruthy()
  })
})
