window.__ModuleLoader__.load({
	id: "acme/greeter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/index.tsx
		/** 纯 DOM 自渲染：不需要服务注入。 */
		const inject = [];
		function apply(ctx) {
			const host = document.createElement("div");
			host.setAttribute("data-greeter", "");
			document.body.appendChild(host);
			const root = react_dom_client.createRoot(host);
			root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "fixed",
					right: 8,
					top: 8,
					fontSize: 12,
					opacity: .9
				},
				children: "👋 greeter client half active"
			}));
			return () => { root.unmount(); host.remove(); };
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
