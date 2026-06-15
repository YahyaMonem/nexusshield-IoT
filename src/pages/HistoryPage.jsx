import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase, EVENT_TYPES, SEVERITY } from '../supabaseClient'
import { formatDistanceToNow, format } from 'date-fns'
import { Download, X, Image, Filter } from 'lucide-react'
import { useToast } from '../toastContext'
import { computeMotionSeverity, MOTION_SEVERITY_META } from '../motionSeverity'

export default function HistoryPage() {
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(true)
    const [snapshot, setSnapshot] = useState(null)  // selected event for modal
    const [filterType, setFilterType] = useState('all')
    const [filterSev, setFilterSev] = useState('all')
    const [devices, setDevices] = useState([])
    const [filterDev, setFilterDev] = useState('all')
    const [highlightedEventIds, setHighlightedEventIds] = useState(new Set())
    const activeTimeouts = useRef(new Set())
    const { addToast } = useToast()

    useEffect(() => {
        supabase.from('devices').select('id, name').then(({ data }) => setDevices(data || []))
        fetchEvents()

        // Realtime subscription
        const channel = supabase
            .channel('events-live')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'events',
            }, async (payload) => {
                // Fetch the full row with joins
                const { data } = await supabase
                    .from('events')
                    .select('*, devices(name), snapshots(image_url)')
                    .eq('id', payload.new.id)
                    .single()

                if (data) {
                    setHighlightedEventIds(prev => {
                        const next = new Set(prev)
                        next.add(data.id)
                        return next
                    })
                    setEvents(prev => [data, ...prev].slice(0, 100))

                    // Toast notification
                    const et = EVENT_TYPES[data.event_type]
                    addToast({
                        type: data.severity,
                        title: et?.label || data.event_type,
                        message: data.devices?.name
                            ? `Detected on ${data.devices.name}`
                            : 'New security event',
                    })

                    // Remove "new" highlight after 2s
                    const id = setTimeout(() => {
                        setHighlightedEventIds(prev => {
                            const next = new Set(prev)
                            next.delete(data.id)
                            return next
                        })
                        activeTimeouts.current.delete(id)
                    }, 2000)
                    activeTimeouts.current.add(id)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
            activeTimeouts.current.forEach(clearTimeout)
            activeTimeouts.current.clear()
        }
    }, [])

    async function fetchEvents() {
        const [eventsRes, trackingRes] = await Promise.all([
            supabase
                .from('events')
                .select('*, devices(name), snapshots(image_url)')
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('tracking_events')
                .select('*, devices(name)')
                .order('created_at', { ascending: false })
                .limit(100)
        ])

        const basicEvents = eventsRes.data || []
        
        // Map tracking events to match the basic shape so they can share the table
        const aiEvents = (trackingRes.data || []).map(te => ({
            id: te.id,
            device_id: te.device_id,
            devices: te.devices,
            event_type: te.object_class,
            // Automatically classify persons as high severity, animals as medium
            severity: te.object_class === 'person' ? 'high' : 'medium',
            created_at: te.created_at,
            snapshots: [],
            is_ai: true,
            duration: te.duration_seconds
        }))

        // Merge and sort
        const merged = [...basicEvents, ...aiEvents].sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        ).slice(0, 100)

        setEvents(merged)
        setLoading(false)
    }

    // CSV injection prevention helper
    function escapeCSV(value) {
        const str = String(value ?? '')
        // Prefix values starting with formula-triggering characters
        const sanitized = /^[=+\-@\t\r]/.test(str) ? "'" + str : str
        // Wrap in double quotes, escaping internal double quotes
        return '"' + sanitized.replace(/"/g, '""') + '"'
    }

    // CSV export
    function exportCSV() {
        const rows = [
            ['ID', 'Device', 'Event Source', 'Event Type/Object', 'Severity', 'Duration (Seconds)', 'Created At'].map(escapeCSV),
            ...filtered.map(ev => [
                escapeCSV(ev.id),
                escapeCSV(ev.devices?.name || ''),
                escapeCSV(ev.is_ai ? 'AI Vision' : 'Hardware Sensor'),
                escapeCSV(ev.event_type),
                escapeCSV(ev.severity),
                escapeCSV(ev.is_ai ? ev.duration : 'N/A'),
                escapeCSV(format(new Date(ev.created_at), 'yyyy-MM-dd HH:mm:ss')),
            ])
        ]
        const csv = rows.map(r => r.join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url
        a.download = `nexusshield_full_summary_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
        a.click(); URL.revokeObjectURL(url)
    }

    const filtered = useMemo(() => {
        return events.filter(ev => {
            if (filterType !== 'all' && ev.event_type !== filterType) return false
            if (filterSev !== 'all' && ev.severity !== filterSev) return false
            if (filterDev !== 'all' && ev.device_id !== filterDev) return false
            return true
        })
    }, [events, filterType, filterDev, filterSev])

    return (
        <div>
            {/* Toolbar */}
            <div className="page-toolbar">
                <Filter size={14} color="var(--text-muted)" />
                <Select value={filterType} onChange={setFilterType}>
                    <option value="all">All Types</option>
                    {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
                <Select value={filterSev} onChange={setFilterSev}>
                    <option value="all">All Severities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </Select>
                <Select value={filterDev} onChange={setFilterDev}>
                    <option value="all">All Devices</option>
                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
                <div className="page-toolbar-actions">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                        {filtered.length} events
                    </span>
                    <button className="btn btn-ghost" onClick={exportCSV}>
                        <Download size={13} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Events table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div className="empty-state"><div className="spinner" /></div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">No events match your filters</div>
                ) : (
                    <div className="table-scroll"><table className="data-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Device</th>
                                <th>Severity</th>
                                <th>Details</th>
                                <th>Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(ev => {
                                const et = EVENT_TYPES[ev.event_type] || { label: ev.event_type, color: '#fff' }
                                // Use time-based motion severity if applicable (e.g. HIGH after midnight)
                                const motionSev = computeMotionSeverity(ev, events)
                                const sv = motionSev
                                    ? MOTION_SEVERITY_META[motionSev]
                                    : (SEVERITY[ev.severity] || SEVERITY.low)
                                const img = ev.snapshots?.[0]?.image_url
                                return (
                                    <tr key={ev.id} style={{ background: highlightedEventIds.has(ev.id) ? 'var(--bg-hover)' : 'transparent' }}>
                                        <td>
                                            <span className="badge" style={{ color: et.color, background: et.color + '18' }}>
                                                <span className="badge-dot" style={{ background: et.color }} />
                                                {et.label}
                                            </span>
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                            {ev.devices?.name || 'Unknown'}
                                        </td>
                                        <td>
                                            <span className="badge" style={{ color: sv.color, background: sv.bg }}>
                                                {sv.label}
                                            </span>
                                        </td>
                                        <td>
                                            {ev.is_ai ? (
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--brand-500)', fontWeight: 600 }}>
                                                    Stayed {ev.duration}s
                                                </span>
                                            ) : img ? (
                                                <button
                                                    onClick={() => setSnapshot(ev)}
                                                    style={{
                                                        background: 'var(--brand-50)', border: '1px solid var(--brand-200)',
                                                        borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                                                        color: 'var(--brand-600)', fontSize: 13, fontWeight: 500,
                                                        display: 'flex', alignItems: 'center', gap: 5,
                                                    }}
                                                >
                                                    <Image size={11} /> View
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                            {format(new Date(ev.created_at), 'E d MMM h:mm a')}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table></div>
                )}
            </div>

            {/* Snapshot Modal */}
            {snapshot && (
                <div className="modal-overlay" onClick={() => setSnapshot(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>
                                    {EVENT_TYPES[snapshot.event_type]?.label || snapshot.event_type}
                                </div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {snapshot.devices?.name} · {format(new Date(snapshot.created_at), 'E d MMM yyyy, h:mm a')}
                                </div>
                            </div>
                            <button
                                onClick={() => setSnapshot(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <img
                            src={snapshot.snapshots?.[0]?.image_url}
                            alt="Snapshot"
                            style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border)' }}
                        />
                        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                            <span className="badge" style={{
                                color: SEVERITY[snapshot.severity]?.color,
                                background: SEVERITY[snapshot.severity]?.bg,
                            }}>
                                {snapshot.severity} severity
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function Select({ value, onChange, children }) {
    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 500,
                padding: '8px 12px',
                outline: 'none',
                cursor: 'pointer',
            }}
        >
            {children}
        </select>
    )
}
