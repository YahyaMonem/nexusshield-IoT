import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabaseClient'
import { enrichWithSeverity, MOTION_SEVERITY_META } from '../motionSeverity'
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { format, subDays, eachDayOfInterval } from 'date-fns'

const CHART_COLORS = ['#7f56d9', '#17b26a', '#f79009', '#f04438', '#2e90fa']
const DAYS_OPTIONS = [7, 14, 30]
const CHART_FONT = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const AXIS_TICK = { fontSize: 12, fontFamily: CHART_FONT, fill: '#667085' }
const LEGEND_STYLE = { fontSize: 12, fontFamily: CHART_FONT, color: 'var(--text-secondary)' }

function formatEventName(name = '') {
    return String(name)
        .replaceAll('_', ' ')
        .split(' ')
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null

    const visiblePayload = payload.filter(item => Number(item.value) > 0)
    const rows = visiblePayload.length > 0 ? visiblePayload : payload

    return (
        <div className="chart-tooltip">
            {label && <div className="chart-tooltip-label">{label}</div>}
            {rows.map(item => {
                const muted = Number(item.value) === 0
                return (
                    <div key={item.dataKey || item.name} className={`chart-tooltip-row${muted ? ' muted' : ''}`}>
                        <span className="chart-tooltip-dot" style={{ background: item.color }} />
                        <span>{formatEventName(item.name || item.dataKey)}</span>
                        <strong>{item.value}</strong>
                    </div>
                )
            })}
        </div>
    )
}

export default function AnalyticsPage() {
    const [days, setDays] = useState(7)
    const [loading, setLoading] = useState(true)

    const [events, setEvents] = useState([])
    const [devices, setDevices] = useState([])

    useEffect(() => {
        let isMounted = true

        async function fetchAll() {
            setLoading(true)
            const from = subDays(new Date(), days).toISOString()

            const [eventsRes, trackingRes, devicesRes] = await Promise.all([
                supabase.from('events').select('id, event_type, severity, created_at, device_id').gte('created_at', from),
                supabase.from('tracking_events').select('object_class, created_at, device_id').gte('created_at', from),
                supabase.from('devices').select('id, name'),
            ])

            const fetchedEvents = eventsRes.data || []
            const aiEvents = trackingRes.data || []
            const fetchedDevices = devicesRes.data || []

            // Enrich motion events with computed severity
            const enrichedSensorEvents = enrichWithSeverity(fetchedEvents)
            
            // Map AI events to standard format
            const mappedAiEvents = aiEvents.map(te => ({
                event_type: te.object_class,
                _severity: te.object_class === 'person' ? 'high' : 'medium',
                created_at: te.created_at,
                device_id: te.device_id
            }))

            // Combine both data streams
            const enriched = [...enrichedSensorEvents, ...mappedAiEvents]

            if (!isMounted) return
            setEvents(enriched)
            setDevices(fetchedDevices)
            setLoading(false)
        }
        fetchAll()

        return () => { isMounted = false }
    }, [days])

    const {
        lineData,
        donutData,
        peakData,
        heatmapData,
        uptimeData,
        severityData,
        severityLineData
    } = useMemo(() => {
        const dayRange = eachDayOfInterval({ start: subDays(new Date(), days - 1), end: new Date() })

        // ── 1. Events over time (line chart) ──────────────────────────────────
        const byDay = {}
        dayRange.forEach(d => { byDay[format(d, 'MMM d')] = 0 })
        events.forEach(ev => {
            const key = format(new Date(ev.created_at), 'MMM d')
            if (byDay[key] !== undefined) byDay[key]++
        })
        const lineData = Object.entries(byDay).map(([date, count]) => ({ date, count }))

        // ── 2. Event type breakdown (donut) ────────────────────────────────────
        const typeCounts = {}
        events.forEach(ev => { typeCounts[ev.event_type] = (typeCounts[ev.event_type] || 0) + 1 })
        const donutData = Object.entries(typeCounts).map(([name, value]) => ({
            name: formatEventName(name),
            value,
        }))

        // ── 3. Peak hours (bar chart, 0-23) ───────────────────────────────────
        const hourCounts = Array(24).fill(0)
        events.forEach(ev => { hourCounts[new Date(ev.created_at).getHours()]++ })
        const peakData = hourCounts.map((count, hour) => ({
            hour: `${String(hour).padStart(2, '0')}:00`,
            count,
        }))

        // ── 4. Heatmap: day-of-week × hour ────────────────────────────────────
        const DAYS_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        const grid = Array(7).fill(null).map(() => Array(24).fill(0))
        events.forEach(ev => {
            const d = new Date(ev.created_at)
            grid[d.getDay()][d.getHours()]++
        })
        const heatmapData = grid.map((hours, di) => ({ day: DAYS_LABELS[di], hours }))

        // ── 5. Device uptime (from events / heartbeats count) ─────────────────
        const devEventCounts = {}
        devices.forEach(d => { devEventCounts[d.id] = { name: d.name, events: 0 } })
        events.forEach(ev => {
            if (devEventCounts[ev.device_id]) devEventCounts[ev.device_id].events++
        })
        const uptimeData = Object.values(devEventCounts).map(d => ({ name: d.name, events: d.events }))

        // ── 6. Security event severity breakdown (all classifiable events) ────────
        const securityEvents = events.filter(ev => ev._severity !== null)
        const sevCounts = { high: 0, medium: 0, low: 0 }
        securityEvents.forEach(ev => { sevCounts[ev._severity]++ })
        const severityData = { ...sevCounts, total: securityEvents.length }

        // Per-day severity stacked line
        const byDaySev = {}
        dayRange.forEach(d => { byDaySev[format(d, 'MMM d')] = { date: format(d, 'MMM d'), high: 0, medium: 0, low: 0 } })
        securityEvents.forEach(ev => {
            const key = format(new Date(ev.created_at), 'MMM d')
            if (byDaySev[key]) byDaySev[key][ev._severity]++
        })
        const severityLineData = Object.values(byDaySev)

        return {
            lineData,
            donutData,
            peakData,
            heatmapData,
            uptimeData,
            severityData,
            severityLineData
        }
    }, [events, devices, days])

    if (loading) return <div className="empty-state"><div className="spinner" /></div>

    // Heatmap max value for color scaling
    const heatMax = Math.max(1, ...heatmapData.flatMap(row => row.hours))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Day range toggle */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {DAYS_OPTIONS.map(d => (
                    <button
                        key={d}
                        onClick={() => setDays(d)}
                        className="btn"
                        style={{
                            padding: '5px 14px', fontSize: 13,
                            background: days === d ? 'var(--brand-50)' : 'transparent',
                            border: `1px solid ${days === d ? 'var(--brand-600)' : 'var(--border-secondary)'}`,
                            color: days === d ? 'var(--brand-600)' : 'var(--text-tertiary)',
                            fontWeight: days === d ? 600 : 500,
                        }}
                    >
                        {d}D
                    </button>
                ))}
            </div>

            {/* Row 1: Line + Donut */}
            <div className="grid-2">
                {/* Events over time */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Events Over Time</span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={lineData}>
                            <defs>
                                <linearGradient id="eventsGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#7f56d9" stopOpacity={0.28} />
                                    <stop offset="95%" stopColor="#7f56d9" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
                            <Area type="monotone" dataKey="count" name="Events" stroke="#7f56d9" fill="url(#eventsGradient)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Event type donut */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Event Breakdown</span>
                    </div>
                    {donutData.length === 0
                        ? <div className="empty-state">No data</div>
                        : (
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                                        {donutData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
                                    <Legend
                                        iconType="circle"
                                        iconSize={8}
                                        wrapperStyle={LEGEND_STYLE}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        )
                    }
                </div>
            </div>

            {/* Row 2: Peak hours */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Peak Activity Hours</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={peakData} barSize={22} maxBarSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="hour" tick={AXIS_TICK} interval={1} axisLine={false} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
                        <Bar dataKey="count" name="Events" fill="#7f56d9" radius={[4, 4, 0, 0]} fillOpacity={0.88} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Row 3: Heatmap */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Activity Heatmap — Day × Hour</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ width: 32 }} />
                        {Array(24).fill(0).map((_, h) => (
                            <div key={h} style={{
                                width: 22, textAlign: 'center',
                                fontSize: 10, fontWeight: 600,
                                color: 'var(--text-quaternary)',
                            }}>
                                {h % 4 === 0 ? String(h).padStart(2, '0') : ''}
                            </div>
                        ))}
                    </div>
                    {heatmapData.map(({ day, hours }) => (
                        <div key={day} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                            <div style={{
                                width: 32, fontSize: 11, fontWeight: 600,
                                color: 'var(--text-tertiary)', textAlign: 'right', paddingRight: 6,
                            }}>
                                {day}
                            </div>
                            {hours.map((count, h) => {
                                const intensity = count / heatMax
                                return (
                                    <div
                                        key={h}
                                        title={`${day} ${h}:00 — ${count} events`}
                                        style={{
                                            width: 22, height: 16,
                                            borderRadius: 3,
                                            background: count === 0
                                                ? '#eef2f6'
                                                : `rgba(127, 86, 217, ${0.14 + intensity * 0.78})`,
                                            border: '1px solid var(--border)',
                                            cursor: 'default',
                                        }}
                                    />
                                )
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Row 4: Device event count */}
            <div className="card">
                <div className="card-header">
                    <span className="card-title">Events per Device</span>
                </div>
                {uptimeData.length === 0
                    ? <div className="empty-state">No devices</div>
                    : (
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={uptimeData} layout="vertical" barSize={18} maxBarSize={34}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                                <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                                <YAxis type="category" dataKey="name" tick={{ ...AXIS_TICK, fill: '#344054' }} width={130} axisLine={false} tickLine={false} />
                                <Tooltip content={<ChartTooltip />} isAnimationActive={false} cursor={{ fill: 'var(--bg-tertiary)' }} />
                                <Bar dataKey="events" name="Events" fill="var(--green)" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )
                }
            </div>

            {/* Row 5: Security Event Severity Breakdown */}
            <div className="grid-2">
                {/* Severity stat pills */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Security Event Severity</span>
                        <span style={{ fontSize: 12, color: 'var(--text-quaternary)', fontWeight: 600 }}>
                            {severityData.total} classified events
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[['high', 'High — Night (00:00–05:59)'], ['medium', 'Medium — Rapid Repeat (< 30s)'], ['low', 'Low — Normal']].map(([key, desc]) => {
                            const meta = MOTION_SEVERITY_META[key]
                            const count = severityData[key]
                            const pct = severityData.total > 0 ? Math.round((count / severityData.total) * 100) : 0
                            return (
                                <div key={key}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <span style={{ fontSize: 12, color: meta.color, fontWeight: 600 }}>{desc}</span>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                                            {count} <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span>
                                        </span>
                                    </div>
                                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%', width: `${pct}%`,
                                            background: meta.color,
                                            borderRadius: 3,
                                            transition: 'width 0.6s ease',
                                        }} />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Severity over time stacked line */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Severity Over Time</span>
                    </div>
                    {severityLineData.length === 0
                        ? <div className="empty-state">No motion data</div>
                        : (
                            <ResponsiveContainer width="100%" height={200}>
                                <AreaChart data={severityLineData}>
                                    <defs>
                                        <linearGradient id="highGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f87171" stopOpacity={0.22} />
                                            <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="mediumGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="lowGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                                    <YAxis tick={AXIS_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
                                    <Tooltip content={<ChartTooltip />} isAnimationActive={false} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={LEGEND_STYLE} />
                                    <Area type="monotone" dataKey="high" stroke="#f87171" fill="url(#highGradient)" strokeWidth={2} dot={false} name="High" />
                                    <Area type="monotone" dataKey="medium" stroke="#fbbf24" fill="url(#mediumGradient)" strokeWidth={2} dot={false} name="Medium" />
                                    <Area type="monotone" dataKey="low" stroke="#60a5fa" fill="url(#lowGradient)" strokeWidth={2} dot={false} name="Low" />
                                </AreaChart>
                            </ResponsiveContainer>
                        )
                    }
                </div>
            </div>
        </div>
    )
}
