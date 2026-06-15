import { useState, useEffect } from 'react'
import { supabase, EVENT_TYPES, SEVERITY } from '../supabaseClient'
import { format, formatDistanceToNow } from 'date-fns'
import { Activity, Camera, AlertTriangle, Clock, Search, Plus, UserCheck } from 'lucide-react'
import { useToast } from '../toastContext'
import { computeMotionSeverity, MOTION_SEVERITY_META } from '../motionSeverity'

const STALE_MS = 2 * 60 * 1000

function getDeviceStatusKey(device) {
    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null
    const isRecentlySeen = lastSeen && (Date.now() - lastSeen.getTime()) <= STALE_MS

    if (device.status === 'online' && isRecentlySeen) return 'online'
    if (device.status === 'online' && !isRecentlySeen) return 'stale'
    return 'offline'
}

function countOnlineDevices(devices) {
    return devices.filter(d => getDeviceStatusKey(d) === 'online').length
}

export default function DashboardPage() {
    const [stats, setStats] = useState({ todayEvents: 0, activeDevices: 0, highSeverity: 0, lastEvent: null })
    const [recentEvents, setRecent] = useState([])
    const [devices, setDevices] = useState([])
    const [faces, setFaces] = useState([])
    const [faceSearch, setFaceSearch] = useState('')
    const [addingFace, setAddingFace] = useState(false)
    const [newFaceName, setNewFaceName] = useState('')
    const [newFaceRel, setNewFaceRel] = useState('child')
    const [loading, setLoading] = useState(true)
    const [channelStatus, setChannelStatus] = useState('CONNECTING')
    const { addToast } = useToast()

    useEffect(() => {
        let isMounted = true;

        async function fetchAll() {
            const today = new Date(); today.setHours(0, 0, 0, 0)

            const [eventsRes, devicesRes, recentRes, highRes, facesRes] = await Promise.all([
                supabase.from('events').select('id', { count: 'exact' })
                    .gte('created_at', today.toISOString()),
                supabase.from('devices').select('*'),
                supabase.from('events').select('*, devices(name), snapshots(image_url)')
                    .order('created_at', { ascending: false }).limit(8),
                supabase.from('events').select('id', { count: 'exact' })
                    .eq('severity', 'high').gte('created_at', today.toISOString()),
                supabase.from('known_faces').select('*').order('created_at', { ascending: false }),
            ])

            if (isMounted) {
                const activeCount = countOnlineDevices(devicesRes.data || [])
                const lastEventTime = recentRes.data?.[0]?.created_at

                setStats({
                    todayEvents: eventsRes.count || 0,
                    activeDevices: activeCount,
                    highSeverity: highRes.count || 0,
                    lastEvent: lastEventTime,
                })
                setDevices(devicesRes.data || [])
                setRecent(recentRes.data || [])
                setFaces(facesRes.data || [])
                setLoading(false)
            }
        }

        fetchAll()

        // Refresh device status every 60 seconds (lightweight)
        const interval = setInterval(() => {
            fetchAll()
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
            isMounted = false;
            clearInterval(interval)
            supabase.removeChannel(channel)
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    async function handleAddFace() {
        if (!newFaceName.trim()) return
        const { data, error } = await supabase.from('known_faces').insert({
            name: newFaceName.trim(),
            relationship: newFaceRel,
            is_trusted: true,
        }).select().single()

        if (error) {
            addToast({ type: 'high', title: 'Error', message: error.message })
        } else {
            setFaces([data, ...faces])
            setAddingFace(false)
            setNewFaceName('')
            addToast({ type: 'success', title: 'Face Added', message: `${data.name} added to Known Faces.` })
        }
    }

    async function handleTestEvent() {
        const testDeviceId = devices.length > 0 ? devices[0].id : null
        
        const { error } = await supabase.from('events').insert({
            event_type: 'person_detected',
            severity: 'high',
            device_id: testDeviceId,
        })
        
        if (error) {
            addToast({ type: 'high', title: 'Test Failed', message: error.message })
        } else {
            console.log('Inserted test event successfully')
        }
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
                    icon={<Activity size={16} aria-hidden="true" />}
                />
                <StatCard
                    label="Active Cameras"
                    value={`${stats.activeDevices}/${devices.length}`}
                    sub="devices online"
                    color="var(--green)"
                    icon={<Camera size={16} aria-hidden="true" />}
                />
                <StatCard
                    label="High Severity"
                    value={stats.highSeverity}
                    sub="today"
                    color="var(--red)"
                    icon={<AlertTriangle size={16} aria-hidden="true" />}
                />
                <StatCard
                    label="Last Activity"
                    value={stats.lastEvent ? formatDistanceToNow(new Date(stats.lastEvent), { addSuffix: false }) : '—'}
                    sub="ago"
                    color="var(--purple)"
                    icon={<Clock size={16} aria-hidden="true" />}
                />
            </div>

            <div className="grid-2" style={{ marginTop: 8 }}>
                {/* Recent Events */}
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="card-title">Recent Events</span>
                        <button className="btn btn-primary" onClick={handleTestEvent} style={{ padding: '4px 10px', fontSize: 12 }}>
                            Test Event & Email
                        </button>
                    </div>
                    {recentEvents.length === 0
                        ? <div className="empty-state">No events yet</div>
                        : (
                            <div className="table-scroll dashboard-table-scroll"><table className="data-table dashboard-events-table">
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
                                                <td
                                                    style={{ color: 'var(--text-quaternary)', fontSize: 13 }}
                                                    title={formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                                                >
                                                    {format(new Date(ev.created_at), 'E d MMM h:mm a')}
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

            {/* Known Faces Section */}
            <div className="card" style={{ marginTop: 24 }}>
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <span className="card-title">Familiar Faces & Monitoring</span>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
                            <input 
                                type="text" 
                                placeholder="Search faces..." 
                                value={faceSearch}
                                onChange={e => setFaceSearch(e.target.value)}
                                style={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
                                    borderRadius: 'var(--radius)', padding: '6px 12px 6px 30px',
                                    color: 'var(--text-primary)', fontSize: 13, width: 200, fontFamily: 'var(--font-sans)', outline: 'none'
                                }}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={() => setAddingFace(!addingFace)} style={{ padding: '6px 12px' }}>
                            <Plus size={14} /> Add Face
                        </button>
                    </div>
                </div>

                {addingFace && (
                    <div style={{ display: 'flex', gap: 12, padding: '16px', borderBottom: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input 
                            type="text" 
                            placeholder="Person's Name" 
                            value={newFaceName}
                            onChange={e => setNewFaceName(e.target.value)}
                            style={{
                                flex: 1, minWidth: 200,
                                background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius)', padding: '8px 12px',
                                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none'
                            }}
                        />
                        <select 
                            value={newFaceRel} 
                            onChange={e => setNewFaceRel(e.target.value)} 
                            style={{
                                width: 160,
                                background: 'var(--bg-surface)', border: '1px solid var(--border-primary)',
                                borderRadius: 'var(--radius)', padding: '8px 12px',
                                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none'
                            }}
                        >
                            <option value="child">Child</option>
                            <option value="family">Family Member</option>
                            <option value="friend">Friend</option>
                            <option value="service">Service Worker</option>
                            <option value="trusted">Other Trusted</option>
                        </select>
                        <button className="btn btn-primary" onClick={handleAddFace} style={{ padding: '8px 16px' }}>Save Profile</button>
                        <button className="btn btn-ghost" onClick={() => setAddingFace(false)} style={{ padding: '8px 16px' }}>Cancel</button>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: 20 }}>
                    {faces.filter(f => f.name.toLowerCase().includes(faceSearch.toLowerCase())).map(f => (
                        <div key={f.id} style={{
                            border: '1px solid var(--border-primary)', borderRadius: 'var(--radius)',
                            padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
                            background: 'var(--bg-surface)'
                        }}>
                            <div style={{
                                width: 50, height: 50, borderRadius: '50%', background: 'var(--brand-50)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-600)',
                                border: '1px solid var(--brand-200)'
                            }}>
                                <UserCheck size={24} />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 15 }}>{f.name}</div>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize', marginTop: 4 }}>
                                    {f.relationship}
                                </div>
                                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)', marginTop: 8 }}>
                                    {f.visit_count} Visits Registered
                                </div>
                            </div>
                        </div>
                    ))}
                    {faces.length === 0 && !addingFace && (
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0' }}>
                            No familiar faces added yet. Click "Add Face" to start monitoring.
                        </div>
                    )}
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
    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at) : null

    const statusKey = getDeviceStatusKey(device)

    const STATUS_STYLE = {
        online:  { label: 'Online',       color: 'var(--green)',    dot: 'var(--green)',    bg: 'rgba(16,185,129,0.12)',  icon: 'var(--green)'    },
        stale:   { label: 'Disconnected', color: 'var(--red)',      dot: 'var(--red)',      bg: 'rgba(239,68,68,0.10)', icon: 'var(--red)'      },
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
                    background: statusKey === 'online' ? 'rgba(16,185,129,0.1)' : statusKey === 'stale' ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)',
                    border: `1px solid ${statusKey === 'online' ? 'rgba(16,185,129,0.3)' : statusKey === 'stale' ? 'rgba(239,68,68,0.22)' : 'var(--border)'}`,
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
