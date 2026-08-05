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
        bar.style.cssText = 'position:fixed;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;';
        var body = document.body;
        if (body === null) return;
        body.appendChild(bar);
        // 位置：贴近对话流列右缘 + 12px 间距（不是视口右缘）；只在变化时写。
        var position = function () {
          var flow = document.querySelector('[data-chat-flow=""]');
          if (flow === null) return;
          var next = Math.round(flow.getBoundingClientRect().right + 12) + 'px';
          if (bar.style.left !== next) bar.style.left = next;
        };
        // 重建导航点：每个 user 消息一个可导航点；点数未变跳过重建。
        var render = function () {
          position();
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
              row.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            bar.appendChild(dot);
          });
        };
        render();
        // 观察 body 全量 + 过滤自身变更 + rAF 去抖：覆盖对话流挂载/重建
        // （hero → active、会话切换、翻页），同时避免重建循环。
        var scheduled = false;
        var observer = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            if (m.target === bar || bar.contains(m.target)) return;
          }
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(function () { scheduled = false; render(); });
        });
        observer.observe(body, { childList: true, subtree: true });
        // 列宽变化（面板开合/resize）移动列：单独跟一次尺寸。
        var flow = document.querySelector('[data-chat-flow=""]');
        var sizeObserver = flow === null ? null : new ResizeObserver(function () { position(); });
        if (sizeObserver !== null && flow !== null) sizeObserver.observe(flow);
        window.addEventListener('resize', position);
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
