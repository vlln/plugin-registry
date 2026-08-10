/**
 * `dsh registry` CLI surface — manage the local plugin registry: install from
 * a directory or tarball, list, enable/disable, uninstall, and scaffold.
 * Pure filesystem operations against the registry under `$DSH_HOME/plugins`;
 * no harness boot.
 *
 * Lives in the plugin package (not apps/cli) so the CLI implementation ships
 * as a distribution package and the official tree only carries the command
 * registration wiring (patch-slimming design: see distributing-plugins.md).
 *
 * Named `registry` (not `plugin`) because the official `dsh plugin`
 * manages a profile's pnpm plugins; the local registry is a separate surface
 * and keeps its own command name to avoid collision.
 * @module @deepseek-ai/dsh-plugin/cli
 */

import { resolveDshHome } from '@deepseek-ai/dsh-paths'
import {
  installPlugin,
  listPlugins,
  requireDirectory,
  setEnabled,
  uninstallPlugin,
} from './registry.ts'
import { installFromTarball, isTarball } from './tarball.ts'
import { scaffoldPlugin } from './scaffold.ts'
import { join } from 'node:path'

/** Local plugin registry management: `dsh registry <action> [target]`. */
export interface RegistryInvocation {
  mode: 'registry'
  /** The registry action to run. */
  action: 'install' | 'list' | 'enable' | 'disable' | 'uninstall' | 'create'
  /** Plugin directory/tarball for `install`, or the id for enable/disable/uninstall/create. */
  target?: string
}

/**
 * Run one plugin-registry action and print its outcome. Domain failures print
 * to stderr and set the exit code instead of throwing, so a mistyped id or a
 * bad manifest never surfaces a stack trace.
 * @param invocation - the resolved plugin-local subcommand.
 * @param harnessVersion - the running dsh version, checked against `engines.dsh` at install.
 */
export async function runRegistry(invocation: RegistryInvocation, harnessVersion: string): Promise<void> {
  try {
    const dshHome = resolveDshHome()
    switch (invocation.action) {
      case 'install': {
        if (invocation.target === undefined) throw new Error('dsh registry install needs a plugin directory or tarball')
        const installed = isTarball(invocation.target)
          ? await installFromTarball(invocation.target, { dshHome, harnessVersion })
          : await (async () => {
            await requireDirectory(invocation.target as string)
            return installPlugin(invocation.target as string, { dshHome, harnessVersion })
          })()
        console.log(
          `installed ${installed.id}@${installed.record.version} (disabled; run \`dsh registry enable ${installed.id}\` to activate)`,
        )
        break
      }
      case 'create': {
        if (invocation.target === undefined) throw new Error('dsh registry create needs a plugin id (publisher/name)')
        const name = invocation.target.split('/').at(-1) ?? invocation.target
        const dir = await scaffoldPlugin({ id: invocation.target, dir: join(process.cwd(), name) })
        console.log(`created plugin ${invocation.target} in ${dir}; run \`dsh registry install ${dir}\` to install it`)
        break
      }
      case 'list': {
        const listed = await listPlugins(dshHome)
        if (listed.length === 0) {
          console.log('no plugins installed')
          break
        }
        for (const plugin of listed) {
          const state = plugin.record.enabled ? 'enabled ' : 'disabled'
          const summary = plugin.manifest.description ? ` — ${plugin.manifest.description}` : ''
          console.log(`${state} ${plugin.id}@${plugin.record.version}${summary}`)
        }
        break
      }
      case 'enable': {
        if (invocation.target === undefined) throw new Error('dsh registry enable needs a plugin id')
        await setEnabled(dshHome, invocation.target, true)
        console.log(`enabled ${invocation.target}`)
        break
      }
      case 'disable': {
        if (invocation.target === undefined) throw new Error('dsh registry disable needs a plugin id')
        await setEnabled(dshHome, invocation.target, false)
        console.log(`disabled ${invocation.target}`)
        break
      }
      case 'uninstall': {
        if (invocation.target === undefined) throw new Error('dsh registry uninstall needs a plugin id')
        await uninstallPlugin(dshHome, invocation.target)
        console.log(`uninstalled ${invocation.target}`)
        break
      }
      default:
        throw new Error(`dsh registry: unhandled action ${JSON.stringify(invocation.action)}`)
    }
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
