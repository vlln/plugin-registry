window.__ModuleLoader__.load({
	id: "acme/greeter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/index.tsx
		/** 需要此插件声明的服务：ui（通用渲染容器）。 */
		const inject = ["ui"];
		function apply(ctx) {
			ctx.ui.mount({
				container: "overlay",
				priority: 100
			}).render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "fixed",
					right: 8,
					bottom: 8,
					fontSize: 12,
					opacity: .9
				},
				children: "👋 greeter client half active"
			}));
		}
		//#endregion
		//#region src/client/index.ts
		const name = "greeter-client";
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map