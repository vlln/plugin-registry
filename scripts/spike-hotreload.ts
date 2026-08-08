/**
 * Spike: cordis loader 运行期 entry/fiber 操作可行性验证
 *
 * 验证两个 Stage 1 关键赌注（无需浏览器，Node 侧同款 loader）：
 *  1. boot settled 后，运行期 loader.create 新 entry（inject 已有服务）→ fiber 是否激活
 *  2. 运行期拆除 provider（无替换）→ 依赖方 fiber 是否被 _refresh 级联停用
 *
 * 跑法：cd /tmp/dsh-0808 && env -u TSX_TSCONFIG_PATH npx tsx spike-hotreload.ts
 */
import { Context, FiberState } from 'cordis'
import { Loader } from '@cordisjs/plugin-loader'

const s = (f: { state?: FiberState } | undefined): string =>
  f === undefined ? 'no-fiber' : FiberState[f.state]

async function main(): Promise<void> {
  const ctx = new Context()
  await ctx.plugin(Loader, {})
  const loader = ctx.loader

  // 插件：A 提供服务 svcA；B/C 依赖 svcA（观察级联）
  const pluginA = (c: Context): void => { c.reflect.provide('svcA', { who: 'A' }) }
  loader.builtins['spike-a'] = pluginA
  loader.builtins['spike-b'] = (c: Context): void => { void c }
  loader.builtins['spike-c'] = (c: Context): void => { void c }

  // --- 1. boot 阶段：create A + await ---
  const idA = await loader.create({ name: 'cordis:spike-a' })
  await loader.await()
  const entryA = loader.resolve(idA)
  console.log('[1 boot] A fiber =', s(entryA.fiber), '（期望 ACTIVE）')

  // --- 2. 运行期 create B（inject svcA）→ 是否自动激活 ---
  const idB = await loader.create({ name: 'cordis:spike-b', inject: ['svcA'] })
  await loader.await()
  const entryB = loader.resolve(idB)
  console.log('[2 runtime-create] B fiber =', s(entryB.fiber), '（运行期新增 entry 激活？）')

  // --- 3. 运行期 create C（同依赖）---
  const idC = await loader.create({ name: 'cordis:spike-c', inject: ['svcA'] })
  await loader.await()
  const entryC = loader.resolve(idC)
  console.log('[3 runtime-create] C fiber =', s(entryC.fiber))

  // --- 4. 运行期拆除 A（无替换：disabled）→ B/C 级联？ ---
  await entryA.update({ disabled: true })
  await loader.await()
  console.log('[4 remove A] A fiber =', s(entryA.fiber), '（拆除后）')
  console.log('[4 remove A] B fiber =', s(entryB.fiber), '（依赖方：INACTIVE/DISPOSED？）')
  console.log('[4 remove A] C fiber =', s(entryC.fiber))

  // --- 5. 重新激活 A → B/C 是否恢复 ---
  await entryA.update({ disabled: false })
  await loader.await()
  console.log('[5 re-enable A] A fiber =', s(entryA.fiber))
  console.log('[5 re-enable A] B fiber =', s(entryB.fiber), '（依赖方恢复？）')
  console.log('[5 re-enable A] C fiber =', s(entryC.fiber))

  // --- 6. 运行期 create 已存在 id（重复 create 会怎样）---
  try {
    const idA2 = await loader.create({ name: 'cordis:spike-a' })
    console.log('[6 dup create] 返回 id =', idA2, '（重复 create 未抛错？）')
  } catch (e) {
    console.log('[6 dup create] 抛错:', (e as Error).message.slice(0, 80))
  }

  console.log('\nSPIKE DONE')
  process.exit(0)
}

main().catch((e) => { console.error("SPIKE ERROR:", e); process.exit(1) })
