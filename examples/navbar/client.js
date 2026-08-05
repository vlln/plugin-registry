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
        var body = document.body;
        if (body === null) return;
        var STYLE_ID = 'vlln-navbar-style';
        if (document.getElementById(STYLE_ID) === null) {
          var style = document.createElement('style');
          style.id = STYLE_ID;
          style.textContent = [
            '[data-vlln-navbar]{position:fixed;top:50%;transform:translateY(-50%);z-index:900;display:flex;flex-direction:column;gap:10px;padding:8px;border-radius:12px;font-family:system-ui;max-height:calc(100vh - 32px);overflow-y:auto;background:transparent;border:1px solid transparent;transition:background .18s ease,border-color .18s ease}',
            '[data-vlln-navbar]:hover{background:rgba(30,30,34,.55);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-color:rgba(255,255,255,.08)}',
            '[data-vlln-dot]{width:7px;height:7px;border-radius:999px;padding:0;border:none;background:rgba(128,128,140,.45);cursor:pointer;flex:none;transition:width .22s ease,background .22s ease,transform .22s ease}',
            '[data-vlln-dot]:hover{background:rgba(128,128,140,.8);transform:scale(1.25)}',
            '[data-vlln-dot].active{width:22px;border-radius:999px;background:var(--dsw-alias-text-accent,#4c9aff)}',
            '[data-vlln-dot].pulse{animation:vlln-navbar-pulse .9s ease-out}',
            '@keyframes vlln-navbar-pulse{0%{box-shadow:0 0 0 0 rgba(76,154,255,.55)}100%{box-shadow:0 0 0 10px rgba(76,154,255,0)}}',
            '[data-vlln-preview]{position:fixed;z-index:910;max-width:320px;min-width:200px;padding:10px 12px;border-radius:10px;font-size:12px;line-height:1.55;color:var(--dsw-alias-text-1,#eee);background:rgba(24,24,28,.72);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.1);box-shadow:0 8px 28px rgba(0,0,0,.35);overflow:hidden;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;pointer-events:none}',
            '[data-vlln-more]{width:3px;height:3px;border-radius:999px;background:rgba(128,128,140,.5);flex:none}',
            '@media (prefers-reduced-motion: reduce){[data-vlln-navbar],[data-vlln-dot],[data-vlln-dot].active,[data-vlln-dot].pulse{transition:none;animation:none}}',
          ].join('');
          document.head.appendChild(style);
        }
        // 导航条容器（等距节点串；平时隐形，悬停浮现磨砂胶囊托底）。
        var bar = document.createElement('nav');
        bar.setAttribute('data-vlln-navbar', '');
        bar.setAttribute('aria-label', '用户消息导航');
        body.appendChild(bar);
        // 预览卡（悬停/聚焦节点时贴节点弹出，玻璃模糊 + 6 行截断）。
        var preview = document.createElement('div');
        preview.setAttribute('data-vlln-preview', '');
        preview.style.display = 'none';
        body.appendChild(preview);

        var flowOf = function () { return document.querySelector('[data-chat-flow=""]'); };
        var scrollerOf = function () {
          var flow = flowOf();
          if (flow === null) return null;
          var n = flow.parentElement;
          while (n !== null) {
            var s = getComputedStyle(n);
            if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n;
            n = n.parentElement;
          }
          return null;
        };
        var userRows = function () {
          return Array.prototype.slice.call(document.querySelectorAll('[data-chat-flow-kind="user"]'));
        };

        // 位置：贴近对话流列右缘 + 12px，钳制视口内（列移动时触发）。
        var position = function () {
          var flow = flowOf();
          if (flow === null) return;
          var right = flow.getBoundingClientRect().right;
          var next = Math.round(Math.min(right + 12, window.innerWidth - bar.offsetWidth - 8));
          var nextLeft = Math.max(8, next) + 'px';
          if (bar.style.left !== nextLeft) bar.style.left = nextLeft;
        };

        // 激活态：阅读头经过的最后一条 user 消息（rAF 节流重算）。
        var activeIndex = -1;
        var computeActive = function () {
          var rows = userRows();
          if (rows.length === 0) return -1;
          var mid = window.innerHeight * 0.35;
          var idx = 0;
          for (var i = 0; i < rows.length; i++) {
            var top = rows[i].getBoundingClientRect().top;
            if (top <= mid) idx = i;
            else break;
          }
          return idx;
        };
        var WINDOW = 11;
        var HALF_WINDOW = 5;

        // 预览：消息开头（CSS line-clamp 6 行截断）。
        var showPreview = function (row, anchor) {
          var text = (row.textContent || '').trim();
          if (text === '') return;
          preview.textContent = text;
          preview.style.display = 'block';
          var r = anchor.getBoundingClientRect();
          var x = r.left - 320 - 14;
          preview.style.left = Math.max(8, x) + 'px';
          preview.style.top = Math.min(window.innerHeight - 120, r.top - 12) + 'px';
        };
        var hidePreview = function () { preview.style.display = 'none'; };

        // 渲染节点串：等距节点 + 滑动窗口（>11 显示激活 ± 5，端点细点）。
        var render = function () {
          position();
          var rows = userRows();
          if (rows.length < 2) { bar.style.display = 'none'; return; }
          bar.style.display = 'flex';
          var active = computeActive();
          activeIndex = active;
          var windowed = rows.length > WINDOW;
          var lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0;
          var hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1;
          var dotCount = hi - lo + 1 + (windowed ? 2 : 0);
          if (bar.childElementCount === dotCount) { updateActive(); return; }
          bar.textContent = '';
          if (windowed && lo > 0) {
            var moreL = document.createElement('span');
            moreL.setAttribute('data-vlln-more', '');
            bar.appendChild(moreL);
          }
          for (var i = lo; i <= hi; i++) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('data-vlln-dot', '');
            dot.title = 'user #' + (i + 1) + '（点击跳转）';
            (function (row, d) {
              d.addEventListener('mouseenter', function () { showPreview(row, d); });
              d.addEventListener('mouseleave', hidePreview);
              d.addEventListener('focus', function () { showPreview(row, d); });
              d.addEventListener('blur', hidePreview);
              d.addEventListener('click', function () {
                // 平滑滚动：先派发 wheel 事件建立官方 wheel 起源标记，
                // 使本次程序化滚动不被 follow 逻辑拉回（合成 wheel 无默认滚动）。
                var scroller = scrollerOf();
                if (scroller !== null) {
                  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true }));
                }
                row.scrollIntoView({ behavior: 'smooth', block: 'start' });
                d.classList.add('pulse');
                setTimeout(function () { d.classList.remove('pulse'); }, 950);
              });
            })(rows[i], dot);
            if (i === active) dot.classList.add('active');
            bar.appendChild(dot);
          }
          if (windowed && hi < rows.length - 1) {
            var moreR = document.createElement('span');
            moreR.setAttribute('data-vlln-more', '');
            bar.appendChild(moreR);
          }
        };

        // 滚动只重算激活态（rAF 节流），激活药丸滑动。
        var updateActive = function () {
          var next = computeActive();
          if (next === activeIndex) return;
          activeIndex = next;
          render();
        };

        // 流容器绑定：初始 + 流重建时重绑尺寸观察并重新定位。
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
        window.addEventListener('resize', position);
        // 滚动监听：重算激活态（rAF 节流）。
        var scrollScheduled = false;
        var onScroll = function () {
          if (scrollScheduled) return;
          scrollScheduled = true;
          requestAnimationFrame(function () { scrollScheduled = false; updateActive(); });
        };
        var scroller = scrollerOf();
        var bindScroller = function () {
          var next = scrollerOf();
          if (next === scroller) return;
          if (scroller !== null) scroller.removeEventListener('scroll', onScroll);
          scroller = next;
          if (scroller !== null) scroller.addEventListener('scroll', onScroll, { passive: true });
        };
        bindScroller();
        render();

        // 观察 body 全量，只响应流容器替换或流容器内变更（其他零触发）。
        var scheduled = false;
        var schedule = function () {
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(function () { scheduled = false; render(); });
        };
        var observer = new MutationObserver(function (mutations) {
          bindFlow();
          bindScroller();
          for (var i = 0; i < mutations.length; i++) {
            var m = mutations[i];
            if (m.target === bar || bar.contains(m.target)) continue;
            if (m.target === preview || preview.contains(m.target)) continue;
            if (flow !== null && (m.target === flow || flow.contains(m.target))) {
              schedule();
              return;
            }
          }
        });
        observer.observe(body, { childList: true, subtree: true });

        // 插件生命周期：unload 时清理。
        return function () {
          observer.disconnect();
          if (sizeObserver !== null) sizeObserver.disconnect();
          if (scroller !== null) scroller.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', position);
          bar.remove();
          preview.remove();
          var st = document.getElementById(STYLE_ID);
          if (st !== null) st.remove();
        };
      },
    };
    return module.exports;
  },
});
