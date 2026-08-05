// vlln/navbar 的 client bundle 产物（手写等价物，同 greeter 模式）。
// 契约：window.__ModuleLoader__.load({ id, factory })，factory(require)
// 返回 Cordis 插件导出面；id 必须等于插件 id。生产用 bundler 生成。
var module = { exports: {} };
var exports = module.exports;
window.__ModuleLoader__.load({
  id: 'vlln/navbar',
  factory: function (require) {
    module.exports = {
      name: 'navbar-client',
      apply: function () {
        // 导航条容器：fixed 定位，水平位置跟随对话流列（见 position()）。
        var bar = document.createElement('nav');
        bar.setAttribute('aria-label', '用户消息导航');
        bar.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;max-height:calc(100vh - 32px);overflow-y:auto;';
        var body = document.body;
        if (body === null) return;
        body.appendChild(bar);
        // 位置：贴近对话流列右缘 + 12px 间距。只在列移动时触发（列重建/
        // 尺寸变化/窗口 resize）——绝不进 render 的每帧路径：getBoundingClientRect
        // 强制 reflow，高频跑会拖死主线程。
        var flowOf = function () { return document.querySelector('[data-chat-flow=""]'); };
        var position = function () {
          var flow = flowOf();
          if (flow === null) return;
          // 贴近对话流列右缘 + 12px，但钳制在视口内（窄视口/详情面板展开
          // 下列右缘可能贴近或越过视口，溢出会盖住滚动条和交互区）。
          var right = flow.getBoundingClientRect().right;
          var next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8));
          var nextLeft = Math.max(8, next) + 'px';
          if (bar.style.left !== nextLeft) bar.style.left = nextLeft;
        };
        // 重建导航点：每个 user 消息一个可导航点；点数未变跳过重建。
        var render = function () {
          var rows = Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-kind="user"]'));
          if (rows.length === bar.childElementCount) return;
          bar.textContent = '';
          rows.forEach(function (row, index) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.title = 'user #' + (index + 1) + '（点击跳转）';
            dot.textContent = String(index + 1);
            dot.style.cssText = 'width:20px;height:20px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:transparent;color:#fff;font-size:11px;cursor:pointer;';
            dot.addEventListener('click', function () {
              // auto（非 smooth）：官方 follow 逻辑在非 wheel 滚动且
              // pinned-to-bottom 时拉回底部；smooth 动画每帧被拉回会形成
              // 无限滚动循环拖死主线程（整页假死）。auto 至多被拉回一次。
              row.scrollIntoView({ behavior: 'auto', block: 'start' });
            });
            bar.appendChild(dot);
          });
        };
        // 流容器绑定：初始 + 每次检测到流重建时重绑尺寸观察并重新定位。
        var flow = flowOf();
        var sizeObserver = null;
        var bindFlow = function () {
          var next = flowOf();
          if (next === flow) return;
          flow = next;
          if (sizeObserver !== null) sizeObserver.disconnect();
          sizeObserver = flow === null ? null : new ResizeObserver(function () { position(); });
          if (sizeObserver !== null && flow !== null) sizeObserver.observe(flow);
          position();
        };
        bindFlow();
        render(); // 初始渲染（后续变更经 observer 增量更新）
        window.addEventListener('resize', position);
        // 观察 body 全量，但回调只响应两类变更：流容器被替换，或变更落在
        // 当前流容器内。其他区域完全不触发——避免每帧 reflow 拖死页面。
        var scheduled = false;
        var schedule = function () {
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(function () { scheduled = false; render(); });
        };
        var observer = new MutationObserver(function (mutations) {
          bindFlow();
          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            if (m.target === bar || bar.contains(m.target)) continue;
            if (flow !== null && (m.target === flow || flow.contains(m.target))) {
              schedule();
              return;
            }
          }
        });
        observer.observe(body, { childList: true, subtree: true });
        return function () {
          observer.disconnect();
          if (sizeObserver !== null) sizeObserver.disconnect();
          window.removeEventListener('resize', position);
          bar.remove();
        };
      },
    };
    return module.exports;
  },
});
