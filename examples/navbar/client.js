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
        var bar = document.createElement('nav');
        bar.setAttribute('aria-label', '用户消息导航');
        bar.style.cssText = 'position:fixed;right:8px;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(20,20,20,.85);border-radius:8px;font-family:system-ui;';
        var body = document.body;
        if (body === null) return;
        body.appendChild(bar);
        var render = function () {
          bar.textContent = '';
          var rows = Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-kind="user"]'));
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
        var flowRoot = document.querySelector('[data-chat-flow=""]');
        var observer = new MutationObserver(function () { render(); });
        if (flowRoot !== null) observer.observe(flowRoot, { childList: true, subtree: true });
        return function () {
          observer.disconnect();
          bar.remove();
        };
      },
    };
    return module.exports;
  },
});
