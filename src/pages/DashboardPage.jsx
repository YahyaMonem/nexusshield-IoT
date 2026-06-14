import { useState, useEffect } from 'react'
import { supabase, EVENT_TYPES, SEVERITY } from '../supabaseClient'
import { formatDistanceToNow } from 'date-fns'
import { Activity, Camera, AlertTriangle, Clock } from 'lucide-react'
import { useToast } from '../toastContext'
import { computeMotionSeverity, MOTION_SEVERITY_META } from '../motionSeverity'

export default function DashboardPage() {
    const [stats, setStats] = useState({ todayEvents: 0, activeDevices: 0, highSeverity: 0, lastEvent: null })
    const [recentEvents, setRecent] = useState([])
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [channelStatus, setChannelStatus] = useState('CONNECTING')
    const { addToast } = useToast()

    useEffect(() => {
        fetchAll()

        // Refresh device status every 60 seconds (lightweight)
        const interval = setInterval(() => {
            supabase.from('devices').select('*').then(({ data }) => {
                if (data) {
                    const activeCount = data.filter(d => d.status === 'online').length
                    setDevices(data)
                    setStats(prev => ({ ...prev, activeDevices: activeCount }))
                }
            })
        }, 60000)

        // ── Realtime: listen for new events ───────────────────────────────
        const channel = supabase
            .channel('dashboard-events')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'events',
            }, async (payload) => {
                // Fetch the full row with joins so we have device name etc.
                const { data: newEvent } = await supabase
                    .from('events')
                    .select('*, devices(name), snapshots(image_url)')
                    .eq('id', payload.new.id)
                    .single()

                if (newEvent) {
                    // Prepend to recent events list (keep max 8)
                    setRecent(prev => [newEvent, ...prev].slice(0, 8))

                    // Increment today counters
                    const today = new Date(); today.setHours(0, 0, 0, 0)
                    const isToday = new Date(newEvent.created_at) >= today
                    setStats(prev => ({
                        ...prev,
                        todayEvents: isToday ? prev.todayEvents + 1 : prev.todayEvents,
                        highSeverity: (isToday && newEvent.severity === 'high')
                            ? prev.highSeverity + 1
                            : prev.highSeverity,
                        lastEvent: newEvent.created_at,
                    }))

                    // Toast notification
                    const et = EVENT_TYPES[newEvent.event_type]
                    addToast({
                        type: newEvent.severity,
                        title: et?.label || newEvent.event_type,
                        message: newEvent.devices?.name
                            ? `Detected on ${newEvent.devices.name}`
                            : 'New security event',
                    })
                }
            })
            .subscribe((status, err) => {
                console.log('[Realtime] dashboard-events status:', status, err ?? '')
                setChannelStatus(status)
            })

        return () => {
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function fetchAll() {
        const today = new Date(); today.setHours(0, 0, 0, 0)

        const [eventsRes, devicesRes, recentRes, highRes] = await Promise.all([
            supabase.from('events').select('id', { count: 'exact' })
                .gte('created_at', today.toISOString()),
            supabase.from('devices').select('*'),
            supabase.from('events').select('*, devices(name), snapshots(image_url)')
                .order('created_at', { ascending: false }).limit(8),
            supabase.from('events').select('id', { count: 'exact' })
                .eq('severity', 'high').gte('created_at', today.toISOString()),
        ])

        const activeCount = devicesRes.data?.filter(d => d.status === 'online').length || 0
        const lastEventTime = recentRes.data?.[0]?.created_at

        setStats({
            todayEvents: eventsRes.count || 0,
            activeDevices: activeCount,
            highSeverity: highRes.count || 0,
            lastEvent: lastEventTime,
        })
        setDevices(devicesRes.data || [])
        setRecent(recentRes.data || [])
        setLoading(false)
    }

    if (loading) return (
        <div className="empty-state"><div className="spinner" /></div>
    )

    return (
        <div>
            {/* Stats row */}
            <div className="stats-grid">
                <StatCard
                    label="Events Today"
                    value={stats.todayEvents}
                    sub="motion detections"
                    color="var(--accent)"
                    icon={<Activity size={16} />}
                />
                <StatCard
                    label="Active Cameras"
                    value={`${stats.activeDevices}/${devices.length}`}
                    sub="devices online"
                    color="var(--green)"
                    icon={<Camera size={16} />}
                />
                <StatCard
                    label="High Severity"
                    value={stats.highSeverity}
                    sub="today"
                    color="var(--red)"
                    icon={<AlertTriangle size={16} />}
                />
                <StatCard
                    label="Last Activity"
                    value={stats.lastEvent ? formatDistanceToNow(new Date(stats.lastEvent), { addSuffix: false }) : '—'}
                    sub="ago"
                    color="var(--purple)"
                    icon={<Clock size={16} />}
                />
            </div>

            <div className="grid-2" style={{ marginTop: 8 }}>
                {/* Recent Events */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Recent Events</span>
                    </div>
                    {recentEvents.length === 0
                        ? <div className="empty-state">No events yet</div>
                        : (
                            <div className="table-scroll"><table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Type</th>
                                        <th>Device</th>
                                        <th>Severity</th>
                                        <th>Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentEvents.map(ev => {
                                        const et = EVENT_TYPES[ev.event_type] || { label: ev.event_type, color: '#fff' }
                                        const motionSev = computeMotionSeverity(ev, recentEvents)
                                        const sv = motionSev
                                            ? MOTION_SEVERITY_META[motionSev]
                                            : (SEVERITY[ev.severity] || SEVERITY.low)
                                        return (
                                            <tr key={ev.id}>
                                                <td>
                                                    <span className="badge" style={{ color: et.color, background: et.color + '18' }}>
                                                        <span className="badge-dot" style={{ background: et.color }} />
                                                        {et.label}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>
                                                    {ev.devices?.name || 'Unknown'}
                                                </td>
                                                <td>
                                                    <span className="badge" style={{ color: sv.color, background: sv.bg }}>
                                                        {sv.label}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--text-quaternary)', fontSize: 13 }}>
                                                    {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table></div>
                        )
                    }
                </div>

                {/* Device Status */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Device Status</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {devices.length === 0
                            ? <div className="empty-state">No devices registered</div>
                            : devices.map(dev => (
                                <DeviceStatusRow key={dev.id} device={dev} />
                            ))
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}

function StatCard({ label, value, sub, color, icon }) {
    return (
        <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="stat-label">{label}</div>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${color}10`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: color,
                }}>{icon}</div>
            </div>
            <div className="stat-value">{value}</div>
            <div className="stat-sub">{sub}</div>
        </div>
    )
}

function DeviceStatusRow({ device }) {
    // Three-state status:
    //   online  → status=online  AND last_seen_at within the last 2 minutes
    //   stale   → status=online  BUT last_seen_at is > 2 minutes ago (lost power / crashed)
    //   offline → status=offline (or no last_seen_at)
    const STALE_MS = 2 * 60 * 1000   // 2 minutes
    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null
    const isRecentlySeen = lastSeen && (Date.now() - lastSeen.getTime()) <= STALE_MS

    let statusKey
    if (device.status === 'online' && isRecentlySeen) statusKey = 'online'
    else if (device.status === 'online' && !isRecentlySeen) statusKey = 'stale'
    else statusKey = 'offline'

    const STATUS_STYLE = {
        online:  { label: 'Online',       color: 'var(--green)',    dot: 'var(--green)',    bg: 'rgba(16,185,129,0.12)',  icon: 'var(--green)'    },
        stale:   { label: 'Disconnected', color: '#fbbf24',         dot: '#fbbf24',         bg: 'rgba(251,191,36,0.12)', icon: '#fbbf24'         },
        offline: { label: 'Offline',      color: 'var(--text-muted)', dot: 'var(--text-muted)', bg: 'var(--bg-hover)',    icon: 'var(--text-muted)' },
    }
    const s = STATUS_STYLE[statusKey]

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: statusKey === 'online' ? 'rgba(16,185,129,0.1)' : statusKey === 'stale' ? 'rgba(251,191,36,0.1)' : 'var(--bg-hover)',
                    border: `1px solid ${statusKey === 'online' ? 'rgba(16,185,129,0.3)' : statusKey === 'stale' ? 'rgba(251,191,36,0.3)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Camera size={14} color={s.icon} />
                </div>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{device.name}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-quaternary)' }}>
                        {device.location || 'No location set'}
                    </div>
                </div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <span className="badge" style={{ color: s.color, background: s.bg }}>
                    <span className="badge-dot" style={{ background: s.dot }} />
                    {s.label}
                </span>
                {lastSeen && (
                    <div style={{ fontSize: 13, color: 'var(--text-quaternary)', marginTop: 3 }}>
                        {formatDistanceToNow(lastSeen, { addSuffix: true })}
                    </div>
                )}
            </div>
        </div>
    )
}