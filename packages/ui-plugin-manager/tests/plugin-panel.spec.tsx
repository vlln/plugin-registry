// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PluginEntryView } from '@deepseek-ai/dsh-host-apiproxy'
import { PluginPanel, type PluginPanelProps } from '../src/client/PluginPanel.tsx'

afterEach(cleanup)

/** Enable-call shape with the RPC failure branch (ok:false) a test stubs. */
type EnableCall = (payload: { id: string }) => Promise<{
  result: { ok: boolean; error?: { code: string; message: string; details: unknown }; value?: { id: string } }
}>

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
 * A stateful in-memory registry backing the mock API: each mutation applies
 * to the rows synchronously, so the panel's post-action refresh observes the
 * new state (mirroring the host's live registry).
 */
function pluginsApi() {
  const calls: string[] = []
  let rows: PluginEntryView[] = []
  const patch = (id: string, change: Partial<PluginEntryView>): void => {
    rows = rows.map(row => row.id === id ? { ...row, ...change } : row)
  }
  const api = {
    plugins: {
      list: vi.fn(async () => ({ result: { ok: true as const, value: { plugins: rows } } })),
      install: vi.fn(async (payload: { id: string }) => {
        calls.push(`install:${payload.id}`)
        patch(payload.id, { installed: true, enabled: false })
        return { result: { ok: true as const, value: payload } }
      }),
      // RPC responses carry both outcomes; the wide return type lets a test
      // stub a business failure (ok:false) through mockImplementation.
      enable: vi.fn<EnableCall>(async (payload: { id: string }) => {
        calls.push(`enable:${payload.id}`)
        patch(payload.id, { enabled: true })
        return { result: { ok: true as const, value: payload } }
      }),
      disable: vi.fn(async (payload: { id: string }) => {
        calls.push(`disable:${payload.id}`)
        patch(payload.id, { enabled: false })
        return { result: { ok: true as const, value: payload } }
      }),
      uninstall: vi.fn(async (payload: { id: string }) => {
        calls.push(`uninstall:${payload.id}`)
        patch(payload.id, { installed: false, enabled: false })
        return { result: { ok: true as const, value: payload } }
      }),
    },
  }
  return { api, calls, setRows: (next: PluginEntryView[]): void => { rows = next } }
}

function props(api: unknown): PluginPanelProps {
  return { api: api as PluginPanelProps['api'] } as PluginPanelProps
}

describe('PluginPanel', () => {
  it('renders the browse rows with state badges and actions', async () => {
    const { api, setRows } = pluginsApi()
    setRows([
      entry({ id: 'acme/available' }),
      entry({ id: 'acme/installed', installed: true, enabled: false }),
      entry({ id: 'acme/running', installed: true, enabled: true }),
    ])
    render(<PluginPanel {...props(api)} />)

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
    const { api, setRows } = pluginsApi()
    setRows([entry({ id: 'acme/alpha' }), entry({ id: 'zeta/beta', description: 'weather tool' })])
    render(<PluginPanel {...props(api)} />)
    await screen.findByText('acme/alpha')

    fireEvent.change(screen.getByLabelText('搜索插件'), { target: { value: 'weather' } })
    expect(screen.queryByText('acme/alpha')).toBeNull()
    expect(screen.getByText('zeta/beta')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('搜索插件'), { target: { value: 'zeta' } })
    expect(screen.getByText('zeta/beta')).toBeTruthy()
  })

  it('installs, enables, disables, and uninstalls through the API and refreshes', async () => {
    const { api, calls, setRows } = pluginsApi()
    setRows([entry({ id: 'acme/one' })])
    render(<PluginPanel {...props(api)} />)
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
    const { api } = pluginsApi()
    render(<PluginPanel {...props(api)} />)
    await screen.findByText(/尚未发现插件/)
  })

  it('surfaces an enable failure instead of staying silent', async () => {
    const { api, setRows } = pluginsApi()
    setRows([entry({ id: 'broken/ghost', installed: true, enabled: false })])
    // The RPC carrier returns ok:false for business failures (declared tool
    // never registered), not a thrown rejection — the failure shape is the
    // runtime reality the panel must surface.
    api.plugins.enable.mockImplementation(async () => ({
      result: {
        ok: false,
        error: { code: 'internal', message: 'plugin broken/ghost declares tools [ghost-tool] but registered none', details: {} },
      },
    }))
    render(<PluginPanel {...props(api)} />)
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
