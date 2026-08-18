/**
 * The dsh-desktop-settings card: custom server port, port-occupancy scan and
 * apply-and-restart, driven entirely through the Electron-injected
 * `window.__dshDesktop__` bridge. Registers into the `web-ui.plugin.item`
 * slot of the Web UI Plugins group.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { DshDesktopBridge, DshDesktopPortScanEntry, DshDesktopSettingsInfo } from './bridge.d.ts'

function bridge(): DshDesktopBridge | undefined {
  return typeof window === 'undefined' ? undefined : window.__dshDesktop__
}

const st = {
  card: { display: 'grid' as const, gap: 12 },
  row: { display: 'flex' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
  field: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  input: {
    width: 110,
    padding: '6px 8px',
    background: '#2b2d31',
    border: '1px solid #4a4d54',
    borderRadius: 6,
    color: '#e6e6e6',
    fontSize: 13,
  },
  btn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: 6,
    background: '#4f8cff',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  },
  btnSecondary: {
    background: '#33363b',
    border: '1px solid #4a4d54',
    color: '#e6e6e6',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 12,
    marginLeft: 6,
    color: '#9aa0a6',
    background: 'rgba(154,160,166,.15)',
  },
  badgeGreen: { color: '#4caf50', background: 'rgba(76,175,80,.15)' },
  badgeYellow: { color: '#d29922', background: 'rgba(210,153,34,.15)' },
  badgeRed: { color: '#e5534b', background: 'rgba(229,83,75,.15)' },
  label: { color: '#9aa0a6', fontSize: 13 },
  muted: { color: '#9aa0a6', fontSize: 12 },
  msg: { minHeight: 16, fontSize: 12, marginTop: 4 },
  msgOk: { color: '#4caf50' },
  msgErr: { color: '#e5534b' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: 8, fontSize: 12 },
  th: { textAlign: 'left' as const, padding: '5px 8px', color: '#9aa0a6', fontWeight: 500, borderBottom: '1px solid #3a3d42' },
  td: { textAlign: 'left' as const, padding: '5px 8px', borderBottom: '1px solid #3a3d42' },
}

function badge(kind: string): { text: string; style: CSSProperties } {
  switch (kind) {
    case 'free': return { text: '空闲', style: st.badgeGreen }
    case 'dsh': return { text: 'dsh web', style: st.badgeYellow }
    case 'other': return { text: '其他程序', style: st.badgeRed }
    default: return { text: '未知', style: st.badge }
  }
}

export function PortSettingsCard(): ReactNode {
  const [info, setInfo] = useState<DshDesktopSettingsInfo | null>(null)
  const [ident, setIdent] = useState<{ kind: string; name: string | null } | null>(null)
  const [portInput, setPortInput] = useState('')
  const [msg, setMsg] = useState<{ text: string; err: boolean }>({ text: '', err: false })
  const [busy, setBusy] = useState(false)

  // scan
  const [scanStart, setScanStart] = useState('3000')
  const [scanEnd, setScanEnd] = useState('3100')
  const [scanRows, setScanRows] = useState<DshDesktopPortScanEntry[] | null>(null)
  const [scanMsg, setScanMsg] = useState<{ text: string; err: boolean }>({ text: '', err: false })
  const [scanning, setScanning] = useState(false)

  const refresh = async (): Promise<void> => {
    const b = bridge()
    if (!b) return
    try {
      const i = await b.get()
      setInfo(i)
      setPortInput(String(i.configPort ?? i.port))
      const id = await b.identify(i.port)
      setIdent({ kind: id.kind, name: id.name })
    } catch {
      /* bridge error — keep last state */
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!bridge()) {
    return <div style={{ ...st.muted, padding: 8 }}>未检测到桌面端桥接（请在 DeepSeek Harness Desktop 中打开）。</div>
  }

  const sourceText =
    info?.portSource === 'env' ? '环境变量' :
    info?.portSource === 'config' ? '配置文件' : '默认'

  const identBadge = ident ? badge(ident.kind) : null

  const save = async (): Promise<void> => {
    const raw = parseInt(portInput, 10)
    if (!Number.isInteger(raw) || raw < 1024 || raw > 65535) {
      setMsg({ text: '端口必须是 1024–65535 之间的整数。', err: true })
      return
    }
    setBusy(true)
    try {
      const b = bridge()!
      const res = await b.setPort(raw)
      if (res.ok) {
        setMsg({ text: '已保存，点击「应用并重启服务」立即生效。', err: false })
      } else {
        setMsg({ text: '保存失败：' + (res.error || '未知错误'), err: true })
      }
    } catch (err) {
      setMsg({ text: '保存失败：' + String(err), err: true })
    } finally {
      setBusy(false)
    }
  }

  const restart = async (): Promise<void> => {
    setBusy(true)
    setMsg({ text: '正在重启服务…', err: false })
    try {
      const b = bridge()!
      const res = await b.restart()
      if (res.ok) {
        setMsg({ text: '已应用新端口 ' + res.port, err: false })
        await refresh()
      } else {
        setMsg({ text: '重启失败：' + (res.error || '未知错误'), err: true })
      }
    } catch (err) {
      setMsg({ text: '重启失败：' + String(err), err: true })
    } finally {
      setBusy(false)
    }
  }

  const scan = async (): Promise<void> => {
    const s = parseInt(scanStart, 10)
    const e = parseInt(scanEnd, 10)
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e > 65535 || s > e) {
      setScanMsg({ text: '扫描范围无效。', err: true })
      return
    }
    if (e - s + 1 > 2000) {
      setScanMsg({ text: '单次最多扫描 2000 个端口。', err: true })
      return
    }
    setScanning(true)
    setScanMsg({ text: '扫描中…', err: false })
    try {
      const b = bridge()!
      const res = await b.scanPorts(s, e)
      if (res.error) {
        setScanMsg({ text: res.error, err: true })
        return
      }
      const rows = res.list ?? []
      setScanRows(rows)
      setScanMsg(
        rows.length === 0
          ? { text: '该范围内没有端口被占用。', err: false }
          : { text: '共 ' + rows.length + ' 个端口被占用。', err: false }
      )
    } catch (err) {
      setScanMsg({ text: '扫描失败：' + String(err), err: true })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={st.card}>
      <div style={st.row}>
        <span style={st.label}>服务端口</span>
        <strong>{info?.port ?? '—'}</strong>
        <span style={st.badge}>{sourceText}</span>
        <span style={st.badge}>{info?.running ? '运行中' : '未运行'}</span>
        {identBadge && <span style={identBadge.style}>{identBadge.text}</span>}
      </div>

      <div style={st.field}>
        <span style={st.label}>端口（1024–65535）</span>
        <input
          type="number"
          min={1024}
          max={65535}
          style={st.input}
          value={portInput}
          onChange={(e) => setPortInput(e.target.value)}
        />
        <button style={st.btn} disabled={busy} onClick={() => void save()}>保存</button>
        <button style={{ ...st.btn, ...st.btnSecondary }} disabled={busy} onClick={() => void restart()}>
          应用并重启服务
        </button>
      </div>
      <div style={{ ...st.msg, ...(msg.err ? st.msgErr : st.msgOk) }}>{msg.text}</div>
      <div style={st.muted}>设置写入桌面端本机配置文件；环境变量 DSH_PORT 优先级更高。</div>

      <div style={{ ...st.row, marginTop: 8 }}>
        <span style={st.label}>范围</span>
        <input type="number" min={1} max={65535} style={st.input} value={scanStart} onChange={(e) => setScanStart(e.target.value)} />
        <span style={st.muted}>—</span>
        <input type="number" min={1} max={65535} style={st.input} value={scanEnd} onChange={(e) => setScanEnd(e.target.value)} />
        <button style={{ ...st.btn, ...st.btnSecondary }} disabled={scanning} onClick={() => void scan()}>扫描占用</button>
      </div>
      <div style={{ ...st.msg, ...(scanMsg.err ? st.msgErr : st.msgOk) }}>{scanMsg.text}</div>
      {scanRows !== null && scanRows.length > 0 && (
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>端口</th>
              <th style={st.th}>占用进程</th>
              <th style={st.th}>PID</th>
              <th style={st.th}>状态</th>
            </tr>
          </thead>
          <tbody>
            {scanRows.map((r) => {
              const b = badge(r.kind)
              return (
                <tr key={r.port}>
                  <td style={st.td}>{r.port}</td>
                  <td style={st.td}>{r.name || '未知'}</td>
                  <td style={st.td}>{r.pid ?? '-'}</td>
                  <td style={st.td}><span style={b.style}>{b.text}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div style={st.muted}>黄色 = dsh web 服务（可复用）；红色 = 其他程序占用。</div>
    </div>
  )
}
