window.__ModuleLoader__.load({
	id: "dsh-desktop-settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/PortSettingsCard.tsx
		/**
		* The dsh-desktop-settings card: custom server port, port-occupancy scan and
		* apply-and-restart, driven entirely through the Electron-injected
		* `window.__dshDesktop__` bridge. Registers into the `web-ui.plugin.item`
		* slot of the Web UI Plugins group.
		*/
		function bridge() {
			return typeof window === "undefined" ? void 0 : window.__dshDesktop__;
		}
		const st = {
			card: {
				display: "grid",
				gap: 12
			},
			row: {
				display: "flex",
				alignItems: "center",
				gap: 8,
				flexWrap: "wrap"
			},
			field: {
				display: "flex",
				alignItems: "center",
				gap: 8
			},
			input: {
				width: 110,
				padding: "6px 8px",
				background: "#2b2d31",
				border: "1px solid #4a4d54",
				borderRadius: 6,
				color: "#e6e6e6",
				fontSize: 13
			},
			btn: {
				padding: "6px 12px",
				border: "none",
				borderRadius: 6,
				background: "#4f8cff",
				color: "#fff",
				cursor: "pointer",
				fontSize: 13
			},
			btnSecondary: {
				background: "#33363b",
				border: "1px solid #4a4d54",
				color: "#e6e6e6"
			},
			badge: {
				display: "inline-block",
				padding: "2px 8px",
				borderRadius: 10,
				fontSize: 12,
				marginLeft: 6,
				color: "#9aa0a6",
				background: "rgba(154,160,166,.15)"
			},
			badgeGreen: {
				color: "#4caf50",
				background: "rgba(76,175,80,.15)"
			},
			badgeYellow: {
				color: "#d29922",
				background: "rgba(210,153,34,.15)"
			},
			badgeRed: {
				color: "#e5534b",
				background: "rgba(229,83,75,.15)"
			},
			label: {
				color: "#9aa0a6",
				fontSize: 13
			},
			muted: {
				color: "#9aa0a6",
				fontSize: 12
			},
			msg: {
				minHeight: 16,
				fontSize: 12,
				marginTop: 4
			},
			msgOk: { color: "#4caf50" },
			msgErr: { color: "#e5534b" },
			table: {
				width: "100%",
				borderCollapse: "collapse",
				marginTop: 8,
				fontSize: 12
			},
			th: {
				textAlign: "left",
				padding: "5px 8px",
				color: "#9aa0a6",
				fontWeight: 500,
				borderBottom: "1px solid #3a3d42"
			},
			td: {
				textAlign: "left",
				padding: "5px 8px",
				borderBottom: "1px solid #3a3d42"
			}
		};
		function badge(kind) {
			switch (kind) {
				case "free": return {
					text: "空闲",
					style: st.badgeGreen
				};
				case "dsh": return {
					text: "dsh web",
					style: st.badgeYellow
				};
				case "other": return {
					text: "其他程序",
					style: st.badgeRed
				};
				default: return {
					text: "未知",
					style: st.badge
				};
			}
		}
		function PortSettingsCard() {
			const [info, setInfo] = (0, react.useState)(null);
			const [ident, setIdent] = (0, react.useState)(null);
			const [portInput, setPortInput] = (0, react.useState)("");
			const [msg, setMsg] = (0, react.useState)({
				text: "",
				err: false
			});
			const [busy, setBusy] = (0, react.useState)(false);
			const [scanStart, setScanStart] = (0, react.useState)("3000");
			const [scanEnd, setScanEnd] = (0, react.useState)("3100");
			const [scanRows, setScanRows] = (0, react.useState)(null);
			const [scanMsg, setScanMsg] = (0, react.useState)({
				text: "",
				err: false
			});
			const [scanning, setScanning] = (0, react.useState)(false);
			const refresh = async () => {
				const b = bridge();
				if (!b) return;
				try {
					const i = await b.get();
					setInfo(i);
					setPortInput(String(i.configPort ?? i.port));
					const id = await b.identify(i.port);
					setIdent({
						kind: id.kind,
						name: id.name
					});
				} catch {}
			};
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			if (!bridge()) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...st.muted,
					padding: 8
				},
				children: "未检测到桌面端桥接（请在 DeepSeek Harness Desktop 中打开）。"
			});
			const sourceText = info?.portSource === "env" ? "环境变量" : info?.portSource === "config" ? "配置文件" : "默认";
			const identBadge = ident ? badge(ident.kind) : null;
			const save = async () => {
				const raw = parseInt(portInput, 10);
				if (!Number.isInteger(raw) || raw < 1024 || raw > 65535) {
					setMsg({
						text: "端口必须是 1024–65535 之间的整数。",
						err: true
					});
					return;
				}
				setBusy(true);
				try {
					const res = await bridge().setPort(raw);
					if (res.ok) setMsg({
						text: "已保存，点击「应用并重启服务」立即生效。",
						err: false
					});
					else setMsg({
						text: "保存失败：" + (res.error || "未知错误"),
						err: true
					});
				} catch (err) {
					setMsg({
						text: "保存失败：" + String(err),
						err: true
					});
				} finally {
					setBusy(false);
				}
			};
			const restart = async () => {
				setBusy(true);
				setMsg({
					text: "正在重启服务…",
					err: false
				});
				try {
					const res = await bridge().restart();
					if (res.ok) {
						setMsg({
							text: "已应用新端口 " + res.port,
							err: false
						});
						await refresh();
					} else setMsg({
						text: "重启失败：" + (res.error || "未知错误"),
						err: true
					});
				} catch (err) {
					setMsg({
						text: "重启失败：" + String(err),
						err: true
					});
				} finally {
					setBusy(false);
				}
			};
			const scan = async () => {
				const s = parseInt(scanStart, 10);
				const e = parseInt(scanEnd, 10);
				if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e > 65535 || s > e) {
					setScanMsg({
						text: "扫描范围无效。",
						err: true
					});
					return;
				}
				if (e - s + 1 > 2e3) {
					setScanMsg({
						text: "单次最多扫描 2000 个端口。",
						err: true
					});
					return;
				}
				setScanning(true);
				setScanMsg({
					text: "扫描中…",
					err: false
				});
				try {
					const res = await bridge().scanPorts(s, e);
					if (res.error) {
						setScanMsg({
							text: res.error,
							err: true
						});
						return;
					}
					const rows = res.list ?? [];
					setScanRows(rows);
					setScanMsg(rows.length === 0 ? {
						text: "该范围内没有端口被占用。",
						err: false
					} : {
						text: "共 " + rows.length + " 个端口被占用。",
						err: false
					});
				} catch (err) {
					setScanMsg({
						text: "扫描失败：" + String(err),
						err: true
					});
				} finally {
					setScanning(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: st.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: st.row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.label,
								children: "服务端口"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: info?.port ?? "—" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.badge,
								children: sourceText
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.badge,
								children: info?.running ? "运行中" : "未运行"
							}),
							identBadge && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: identBadge.style,
								children: identBadge.text
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: st.field,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.label,
								children: "端口（1024–65535）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1024,
								max: 65535,
								style: st.input,
								value: portInput,
								onChange: (e) => setPortInput(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: st.btn,
								disabled: busy,
								onClick: () => void save(),
								children: "保存"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: {
									...st.btn,
									...st.btnSecondary
								},
								disabled: busy,
								onClick: () => void restart(),
								children: "应用并重启服务"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...st.msg,
							...msg.err ? st.msgErr : st.msgOk
						},
						children: msg.text
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: st.muted,
						children: "设置写入桌面端本机配置文件；环境变量 DSH_PORT 优先级更高。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...st.row,
							marginTop: 8
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.label,
								children: "范围"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								max: 65535,
								style: st.input,
								value: scanStart,
								onChange: (e) => setScanStart(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: st.muted,
								children: "—"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1,
								max: 65535,
								style: st.input,
								value: scanEnd,
								onChange: (e) => setScanEnd(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: {
									...st.btn,
									...st.btnSecondary
								},
								disabled: scanning,
								onClick: () => void scan(),
								children: "扫描占用"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...st.msg,
							...scanMsg.err ? st.msgErr : st.msgOk
						},
						children: scanMsg.text
					}),
					scanRows !== null && scanRows.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
						style: st.table,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: st.th,
								children: "端口"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: st.th,
								children: "占用进程"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: st.th,
								children: "PID"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								style: st.th,
								children: "状态"
							})
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: scanRows.map((r) => {
							const b = badge(r.kind);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: st.td,
									children: r.port
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: st.td,
									children: r.name || "未知"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: st.td,
									children: r.pid ?? "-"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
									style: st.td,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: b.style,
										children: b.text
									})
								})
							] }, r.port);
						}) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: st.muted,
						children: "黄色 = dsh web 服务（可复用）；红色 = 其他程序占用。"
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const zh = {
			"title": "DeepSeek Harness 桌面端",
			"description": "端口设置与占用扫描（由桌面端桥接提供）",
			"currentPort": "服务端口",
			"portSource.env": "环境变量",
			"portSource.config": "配置文件",
			"portSource.default": "默认",
			"status.running": "运行中",
			"status.stopped": "未运行",
			"state.free": "空闲",
			"state.dsh": "dsh web",
			"state.other": "被其他程序占用",
			"state.unknown": "未知",
			"port.label": "端口（1024–65535）",
			"port.save": "保存",
			"port.restart": "应用并重启服务",
			"port.saved": "已保存，点击「应用并重启服务」立即生效。",
			"port.saving": "保存中…",
			"port.restarting": "正在重启服务…",
			"port.restarted": "已应用新端口",
			"port.invalid": "端口必须是 1024–65535 之间的整数。",
			"port.saveError": "保存失败",
			"port.restartError": "重启失败",
			"port.hint": "设置写入桌面端本机配置文件；环境变量 DSH_PORT 优先级更高。",
			"scan.labelStart": "范围",
			"scan.start": "扫描占用",
			"scan.scanning": "扫描中…",
			"scan.empty": "该范围内没有端口被占用。",
			"scan.found": "共 {count} 个端口被占用。",
			"scan.invalid": "扫描范围无效。",
			"scan.tooWide": "单次最多扫描 2000 个端口。",
			"scan.error": "扫描失败",
			"scan.hint": "黄色 = dsh web 服务（可复用）；红色 = 其他程序占用。",
			"scan.colPort": "端口",
			"scan.colProcess": "占用进程",
			"scan.colPid": "PID",
			"scan.colState": "状态",
			"bridgeMissing": "未检测到桌面端桥接（请在 DeepSeek Harness Desktop 中打开）。",
			"unknownProcess": "未知"
		};
		const en = {
			"title": "DeepSeek Harness Desktop",
			"description": "Port settings & occupancy scan (via the desktop bridge)",
			"currentPort": "Server port",
			"portSource.env": "env",
			"portSource.config": "config",
			"portSource.default": "default",
			"status.running": "running",
			"status.stopped": "stopped",
			"state.free": "free",
			"state.dsh": "dsh web",
			"state.other": "occupied by another program",
			"state.unknown": "unknown",
			"port.label": "Port (1024–65535)",
			"port.save": "Save",
			"port.restart": "Apply & restart service",
			"port.saved": "Saved — click \"Apply & restart service\" to take effect.",
			"port.saving": "Saving…",
			"port.restarting": "Restarting service…",
			"port.restarted": "Applied new port",
			"port.invalid": "Port must be an integer between 1024 and 65535.",
			"port.saveError": "Save failed",
			"port.restartError": "Restart failed",
			"port.hint": "Stored in the desktop app config; DSH_PORT env var wins.",
			"scan.labelStart": "Range",
			"scan.start": "Scan occupancy",
			"scan.scanning": "Scanning…",
			"scan.empty": "No ports in use in this range.",
			"scan.found": "{count} port(s) in use.",
			"scan.invalid": "Invalid scan range.",
			"scan.tooWide": "At most 2000 ports per scan.",
			"scan.error": "Scan failed",
			"scan.hint": "Yellow = dsh web (reusable); red = occupied by another program.",
			"scan.colPort": "Port",
			"scan.colProcess": "Process",
			"scan.colPid": "PID",
			"scan.colState": "State",
			"bridgeMissing": "Desktop bridge not detected (open this in DeepSeek Harness Desktop).",
			"unknownProcess": "unknown"
		};
		//#endregion
		//#region src/client/index.tsx
		/** Locale dictionary namespace owned by this plugin. */
		const NS = "dsh-desktop-settings";
		/** Required services. */
		const inject = ["slots", "locale"];
		/** Apply the browser half. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-desktop-settings: dictionaries");
			ctx.slots.inject("web-ui.plugin.item", () => ctx.slots.register({
				name: "web-ui.plugin.item",
				id: "dsh-desktop-settings",
				order: 120,
				locale: NS,
				inject: () => ({})
			}, PortSettingsCard));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map