// acme/greeter 的 client bundle 产物（示例提交的手写等价物）。
//
// 契约（与官方 client 包一致）：脚本执行时调用
// window.__ModuleLoader__.load({ id, factory })，factory(require) 返回
// Cordis 插件的导出面；浏览器侧随后按 graph row（id 必须等于
// `acme/greeter`）创建 fiber 并 apply。
//
// 实际开发中请用构建工具生成此文件（见 README.md「构建 client bundle」），
// 手写产物仅用于此示例：无外部依赖、无 CSS、无 sourcemap，factory 直接
// 返回源码模块。
var module = { exports: {} };
var exports = module.exports;
window.__ModuleLoader__.load({
  id: 'acme/greeter',
  factory: function (require) {
    module.exports = {
      name: 'greeter-client',
      apply: function (ctx) {
        if (typeof document !== 'undefined') {
          var tag = document.createElement('span');
          tag.textContent = '👋 greeter client half active';
          tag.style.cssText = 'position:fixed;right:8px;bottom:8px;font-size:12px;opacity:.9;z-index:2147483647';
          if (document.body) document.body.appendChild(tag);
        }
      },
    };
    return module.exports;
  },
});
