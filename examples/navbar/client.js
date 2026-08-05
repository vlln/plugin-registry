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
            '[data-vlln-navbar]:hover{background:transparent;border-color:transparent}',
            '[data-vlln-dot]{width:7px;height:7px;border-radius:999px;padding:0;border:none;background:rgba(128,128,140,.45);cursor:pointer;flex:none;transition:width .22s ease,background .22s ease,transform .22s ease}',
            '[data-vlln-dot]:hover{background:var(--dsw-alias-interactive-bg-hover);transform:scale(1.25)}',
            '[data-vlln-dot].active{width:22px;border-radius:999px;background:var(--dsw-alias-text-accent,#4c9aff)}',
                        '[data-vlln-preview]{position:fixed;z-index:910;width:244px;box-sizing:border-box;padding:12px 16px;border-radius:12px;font-size:12px;line-height:1.55;color:var(--dsw-alias-text-1,#eee);background:var(--dsw-hovercard-bg,#2C2C2E);box-shadow:var(--dsw-shadow-lv3);overflow:hidden;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;pointer-events:none}',
            '[data-vlln-more]{width:3px;height:3px;border-radius:999px;background:rgba(128,128,140,.5);flex:none}',
            '@media (prefers-reduced-motion: reduce){[data-vlln-navbar],[data-vlln-dot],[data-vlln-dot].active{transition:none;animation:none}}',
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
          // 激活 = 视口内最顶部的那条 user 消息（阅读起点；与 block:start
          // 跳转对齐——跳转后目标行在视口顶部，激活应指向它）。
          var best = 0;
          var found = false;
          var bestTop = Number.POSITIVE_INFINITY;
          for (var i = 0; i < rows.length; i++) {
            var top = rows[i].getBoundingClientRect().top;
            if (top >= 0 && top < bestTop) { bestTop = top; best = i; found = true; }
          }
          return found ? best : rows.length - 1;
        };
        var WINDOW = 11;
        var HALF_WINDOW = 5;
        // 当前窗口起点（render 设置；updateActiveClass 用同一 lo 映射窗口内 dot）。
        var lo = 0;

        // 预览：消息开头（CSS line-clamp 6 行截断）。
        var previewTimer = null;
        var positionPreview = function (anchor) {
          var r = anchor.getBoundingClientRect();
          // right 定位：卡片右缘贴 dot 左缘 - 14px（内容短的卡片也贴紧）。
          preview.style.right = (window.innerWidth - r.left + 14) + 'px';
          preview.style.top = Math.min(window.innerHeight - 120, r.top - 12) + 'px';
        };
        var showPreview = function (row, anchor) {
          // 消息文本 = 气泡内文本（排除时间戳/操作按钮/分支提示）；CSS
          // line-clamp 6 行截断。延迟 500ms（对齐官方 HoverCard 行为）。
          if (previewTimer !== null) clearTimeout(previewTimer);
          previewTimer = setTimeout(function () {
            var bubble = row.querySelector('[class*="bubble"]');
            var text = ((bubble !== null ? bubble : row).textContent || '').trim();
            if (text === '') return;
            preview.textContent = text;
            preview.style.display = 'block';
            positionPreview(anchor);
          }, 500);
        };
        var hidePreview = function () {
          if (previewTimer !== null) clearTimeout(previewTimer);
          preview.style.display = 'none';
        };

        // 渲染节点串：等距节点 + 滑动窗口（>11 显示激活 ± 5，端点细点）。
        var render = function () {
          position();
          var rows = userRows();
          if (rows.length < 2) { bar.style.display = 'none'; return; }
          bar.style.display = 'flex';
          var active = computeActive();
          activeIndex = active;
          var windowed = rows.length > WINDOW;
          lo = windowed ? Math.max(0, active - HALF_WINDOW) : 0;
          var hi = windowed ? Math.min(rows.length - 1, active + HALF_WINDOW) : rows.length - 1;
          var dotCount = hi - lo + 1 + (windowed ? 2 : 0);
          if (bar.childElementCount === dotCount) {
            // 窗口未变：只移动激活态（滚动时不应重建节点）。
            updateActiveClass(active);
            return;
          }
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
            // aria-label 而非 title：title 会叠加浏览器原生 tooltip（与预览卡重复）。
            dot.setAttribute('aria-label', 'user #' + (i + 1) + '（点击跳转）');
            (function (row, d) {
              d.addEventListener('mouseenter', function () { showPreview(row, d); });
              d.addEventListener('mouseleave', hidePreview);
              d.addEventListener('focus', function () { showPreview(row, d); });
              d.addEventListener('blur', hidePreview);
              d.addEventListener('click', function () {
                jumpToRow(row);
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

        // 点击跳转：wheel 起源 + 第一步立即 + 手动 rAF 缓动（防 follow 拉回）。
        var jumpToRow = function (row) {
          var scroller = scrollerOf();
          if (scroller === null) return;
          scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
          var target = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
          var start = scroller.scrollTop;
          scroller.scrollTop = start + (target > start ? 1 : -1); // 第一步立即
          var dist = target - start;
          var dur = Math.min(480, 160 + Math.abs(dist) * 0.25);
          var t0 = performance.now();
          var step = function (now) {
            // 每帧续 wheel 起源（官方 2 rAF 后清空 wheelStart，过期即拉回）。
            scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
            var p = Math.min(1, (now - t0) / dur);
            var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            scroller.scrollTop = start + dist * eased;
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        };

        // 窗口内激活态：第 i 个 dot 对应行 lo+i，只切换 class 不重建。
        var updateActiveClass = function (active) {
          var dots = bar.querySelectorAll('[data-vlln-dot]');
          for (var i = 0; i < dots.length; i++) {
            if (i + lo === active) dots[i].classList.add('active');
            else dots[i].classList.remove('active');
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
        // 激活跟踪用 IntersectionObserver（行进出视口自动触发，鲁棒）。
        var io = null;
        var bindIO = function () {
          if (io !== null) io.disconnect();
          var root = scrollerOf();
          if (root === null) return;
          io = new IntersectionObserver(function () {
            if (scrollScheduled) return;
            scrollScheduled = true;
            requestAnimationFrame(function () { scrollScheduled = false; updateActive(); });
          }, { root: root, rootMargin: '0px 0px -15% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] });
          var rows = userRows();
          for (var i = 0; i < rows.length; i++) { io.observe(rows[i]); }
        };
        bindIO();
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
          bindIO();
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
          if (io !== null) io.disconnect();
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
