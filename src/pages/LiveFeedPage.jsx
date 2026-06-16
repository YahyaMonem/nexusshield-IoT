import { useState, useEffect, useRef } from 'react'
import { supabase, EVENT_TYPES, SEVERITY } from '../supabaseClient'
import { formatDistanceToNow } from 'date-fns'
import { Maximize2, Minimize2, Camera, Wifi, RefreshCw } from 'lucide-react'
import { computeMotionSeverity, MOTION_SEVERITY_META } from '../motionSeverity'
import { useToast } from '../toastContext'

function ClockOverlay() {
    const [time, setTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <div className="video-overlay">
            <div className="overlay-badge">REC</div>
            <div className="overlay-time">{time.toLocaleString()}</div>
        </div>
    );
}

export default function LiveFeedPage() {
    const [devices, setDevices] = useState([])
    const [configs, setConfigs] = useState({}) // keyed by device_id
    const [selectedId, setSelectedId] = useState(null)
    const [streamError, setStreamError] = useState(false)
    const [streamReloadKey, setStreamReloadKey] = useState(0)
    const [retryingStream, setRetryingStream] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [events, setEvents] = useState([])
    const [loadingDevices, setLoadingDevices] = useState(true)
    const [loadingEvents, setLoadingEvents] = useState(false)
    const channelRef = useRef(null)
    const { addToast } = useToast()

    const streamImgRef = useRef(null)

    // ── Device Status & Stream State ─────────────────────────────────────────
    const selectedDevice = devices.find(d => d.id === selectedId) || null
    const selectedConfig = selectedId ? configs[selectedId] : null

    const configRef = useRef(selectedConfig);
    const selectedIdRef = useRef(selectedId);
    useEffect(() => {
        configRef.current = selectedConfig;
        selectedIdRef.current = selectedId;
    }, [selectedConfig, selectedId]);

    const STALE_MS = 2 * 60 * 1000
    const lastSeen = selectedDevice?.last_seen_at ? new Date(selectedDevice.last_seen_at) : null
    const isRecentlySeen = lastSeen && (Date.now() - lastSeen.getTime()) <= STALE_MS

    let deviceStatusKey = 'offline'
    if (selectedDevice?.status === 'online' && isRecentlySeen) deviceStatusKey = 'online'
    else if (selectedDevice?.status === 'online' && !isRecentlySeen) deviceStatusKey = 'stale'

    const DEVICE_STATUS = {
        online:  { label: 'Online',        color: 'var(--green)',      bg: 'rgba(16,185,129,0.12)', dot: 'var(--green)'       },
        stale:   { label: 'Disconnected',  color: 'var(--red)',        bg: 'rgba(239,68,68,0.10)',  dot: 'var(--red)'         },
        offline: { label: 'Offline',       color: 'var(--text-muted)', bg: 'var(--bg-hover)',       dot: 'var(--text-muted)'  },
    }
    const deviceStatus = DEVICE_STATUS[deviceStatusKey]

    const isOnline = deviceStatusKey === 'online'
    const hasStream = !!(selectedDevice?.stream_url)
    const streamLive = hasStream && !streamError && isOnline

    function getStreamSrc(url) {
        if (!url) return ''
        if (!streamReloadKey) return url

        try {
            const parsedUrl = new URL(url, window.location.href)
            parsedUrl.searchParams.set('retry', String(streamReloadKey))
            return parsedUrl.toString()
        } catch {
            const separator = url.includes('?') ? '&' : '?'
            return `${url}${separator}retry=${streamReloadKey}`
        }
    }

    async function refreshSelectedDevice() {
        if (!selectedId || retryingStream) return
        const initialId = selectedId;

        setRetryingStream(true)
        setStreamError(false)
        setStreamReloadKey(Date.now())

        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('id, name, location, status, last_seen_at, stream_url')
            .eq('id', selectedId)
            .maybeSingle()

        if (initialId !== selectedIdRef.current) return;

        if (deviceError) {
            addToast({
                type: 'high',
                title: 'Reconnect Failed',
                message: deviceError.message,
            })
            setRetryingStream(false)
            return
        }

        if (device) {
            setDevices(prev => prev.map(item => item.id === selectedId ? device : item))
        }

        const { data: cfgData } = await supabase
            .from('device_config')
            .select('device_id, sensitivity, detection_cooldown, alert_enabled, buzzer_enabled, mic_enabled, led_enabled')
            .eq('device_id', selectedId)
            .maybeSingle()

        if (cfgData) {
            setConfigs(prev => ({ ...prev, [selectedId]: cfgData }))
        }

        const { data: eventData } = await supabase
            .from('events')
            .select('id, event_type, severity, created_at')
            .eq('device_id', selectedId)
            .order('created_at', { ascending: false })
            .limit(8)

        setEvents(eventData || [])

        const refreshedLastSeen = device?.last_seen_at ? new Date(device.last_seen_at) : null
        const refreshedOnline = device?.status === 'online'
            && refreshedLastSeen
            && (Date.now() - refreshedLastSeen.getTime()) <= STALE_MS

        if (refreshedOnline && device?.stream_url) {
            addToast({
                type: 'low',
                title: 'Connection Refreshed',
                message: 'Device status and stream were refreshed.',
            })
        } else {
            addToast({
                type: 'medium',
                title: 'Device Still Offline',
                message: 'No fresh heartbeat from the hardware yet. Check ESP32 power, Wi-Fi, and stream URL.',
            })
        }

        setRetryingStream(false)
    }



    // ── 1. Fetch devices + configs on mount ──────────────────────────────────
    useEffect(() => {
        async function fetchDevices() {
            const { data: devData } = await supabase
                .from('devices')
                .select('id, name, location, status, last_seen_at, stream_url')
                .order('name')

            const devs = devData || []
            setDevices(devs)

            if (devs.length > 0) {
                setSelectedId(devs[0].id)
            }

            if (devs.length > 0) {
                const ids = devs.map(d => d.id)
                const { data: cfgData } = await supabase
                    .from('device_config')
                    .select('device_id, sensitivity, detection_cooldown, alert_enabled, buzzer_enabled, mic_enabled, led_enabled')
                    .in('device_id', ids)

                const map = {}
                for (const cfg of cfgData || []) {
                    map[cfg.device_id] = cfg
                }
                setConfigs(map)
            }

            setLoadingDevices(false)
        }

        fetchDevices()
    }, [])

    // ── 2. Fetch events + realtime subscription when selectedId changes ───────
    useEffect(() => {
        if (!selectedId) return

        setStreamError(false)
        setLoadingEvents(true)

        async function fetchEvents() {
            const { data } = await supabase
                .from('events')
                .select('id, event_type, severity, created_at')
                .eq('device_id', selectedId)
                .order('created_at', { ascending: false })
                .limit(8)
            setEvents(data || [])
            setLoadingEvents(false)
        }

        fetchEvents()

        // Clean up previous channel
        if (channelRef.current) {
            supabase.removeChannel(channelRef.current)
            channelRef.current = null
        }

        const channel = supabase
            .channel(`monitor-events-${selectedId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'events',
                filter: `device_id=eq.${selectedId}`,
            }, (payload) => {
                setEvents(prev => [payload.new, ...prev].slice(0, 8))
            })
            .subscribe()

        channelRef.current = channel

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current)
                channelRef.current = null
            }
        }
    }, [selectedId])

    // The constants (selectedConfig, DEVICE_STATUS, streamLive, etc.) have been moved to the top.

    if (loadingDevices) {
        return <div className="empty-state"><div className="spinner" /></div>
    }

    if (devices.length === 0) {
        return (
            <div className="empty-state">
                <Camera size={32} style={{ opacity: 0.3 }} />
                <span>No devices registered</span>
            </div>
        )
    }

    return (
        <div className="live-feed-page">

            {/* ── Camera selector bar ─────────────────────────────────────── */}
            {devices.length > 1 && (
                <div className="camera-selector-bar">
                    <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginRight: 4,
                    }}>
                        Channel
                    </span>
                    {devices.map((dev, idx) => {
                        const active = dev.id === selectedId
                        const online = dev.status === 'online'
                        return (
                            <button
                                key={dev.id}
                                aria-label={`Select ${dev.name}`}
                                aria-pressed={active}
                                onClick={() => setSelectedId(dev.id)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 14px',
                                    borderRadius: 'var(--radius)',
                                    border: active
                                        ? '1px solid rgba(0,229,255,0.4)'
                                        : '1px solid var(--border-accent)',
                                    background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                            >
                                <span style={{
                                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                    background: online ? 'var(--green)' : 'var(--text-muted)',
                                    boxShadow: online ? '0 0 5px var(--green)' : 'none',
                                }} />
                                CAM_{String(idx + 1).padStart(2, '0')}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* ── Two-column layout ────────────────────────────────────────── */}
            <div className={`monitor-grid${isFullscreen ? ' fullscreen' : ''}`}>

                {/* ── LEFT: Stream area ─────────────────────────────────── */}
                <div className="stream-column">

                    {/* Stream container */}
                    <div className="stream-panel">
                        {/* Stream or offline overlay */}
                        {streamLive ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <img
                                    ref={streamImgRef}
                                    key={`${selectedDevice?.stream_url || ''}-${streamReloadKey}`}
                                    src={getStreamSrc(selectedDevice.stream_url)}
                                    alt="Live Stream"
                                    onError={() => setStreamError(true)}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                    }}
                                />
                                <ClockOverlay />
                            </div>
                        ) : (
                            <OfflineOverlay onRetry={refreshSelectedDevice} retrying={retryingStream} />
                        )}

                        {/* Fullscreen toggle */}
                        <button
                            onClick={() => setIsFullscreen(f => !f)}
                            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                            style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 34,
                                height: 34,
                                borderRadius: 'var(--radius)',
                                background: 'rgba(8,11,15,0.75)',
                                border: '1px solid var(--border-accent)',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                backdropFilter: 'blur(4px)',
                                transition: 'all 0.15s',
                                zIndex: 10,
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(8,11,15,0.9)'
                                e.currentTarget.style.color = 'var(--text-primary)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(8,11,15,0.75)'
                                e.currentTarget.style.color = 'var(--text-secondary)'
                            }}
                        >
                            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                        </button>

                        {/* REC badge */}
                        <div style={{
                            position: 'absolute',
                            top: 12,
                            left: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 4,
                            background: streamLive ? 'rgba(0,0,0,0.6)' : 'rgba(8,11,15,0.75)',
                            border: streamLive ? '1px solid rgba(255,0,0,0.3)' : '1px solid var(--border-accent)',
                            backdropFilter: 'blur(4px)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: streamLive ? '#ff4444' : 'var(--text-muted)',
                        }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: streamLive ? '#ff4444' : 'var(--text-muted)',
                                boxShadow: streamLive ? '0 0 8px #ff4444' : 'none',
                                animation: streamLive ? 'pulse 1.5s infinite' : 'none',
                                flexShrink: 0,
                            }} />
                            {streamLive ? 'REC' : 'OFFLINE'}
                        </div>
                    </div>

                    {/* ── Status bar ───────────────────────────────────── */}
                    <div className="live-status-bar">
                        {/* Device name */}
                        <div className="live-status-device">
                            <div className="live-status-device-name">
                                {selectedDevice?.name || '—'}
                            </div>
                            <div className="live-status-device-location">
                                {selectedDevice?.location || 'No location'}
                            </div>
                        </div>

                        <StatusPill label="Status" value={deviceStatus.label}
                            color={deviceStatus.color} />

                        {selectedDevice?.last_seen_at && (
                            <StatusPill
                                label="Last Seen"
                                value={formatDistanceToNow(new Date(selectedDevice.last_seen_at), { addSuffix: true })}
                                color="var(--text-secondary)"
                            />
                        )}

                        {selectedConfig && (
                            <StatusPill
                                label="Sensitivity"
                                value={`${selectedConfig.sensitivity ?? '—'} / 10`}
                                color="var(--accent)"
                            />
                        )}

                        <div className="live-status-spacer">
                            <Wifi size={13} color={streamLive ? 'var(--green)' : 'var(--text-muted)'} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: streamLive ? 'var(--green)' : 'var(--text-muted)' }}>
                                {streamLive ? 'Stream OK' : 'No Signal'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Info + Events panel ───────────────────────── */}
                {!isFullscreen && (
                    <div className="monitor-side-panel">

                        {/* Device Info card */}
                        <div className="card" style={{ flexShrink: 0 }}>
                            <div className="card-header">
                                <span className="card-title">Device Info</span>
                                <span className="badge" style={{
                                    color: deviceStatus.color,
                                    background: deviceStatus.bg,
                                }}>
                                    <span className="badge-dot" style={{
                                        background: deviceStatus.dot,
                                    }} />
                                    {deviceStatus.label}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <InfoRow label="Name" value={selectedDevice?.name || '—'} />
                                <InfoRow label="Location" value={selectedDevice?.location || '—'} />
                                {selectedDevice?.last_seen_at && (
                                    <InfoRow
                                        label="Last Seen"
                                        value={formatDistanceToNow(new Date(selectedDevice.last_seen_at), { addSuffix: true })}
                                    />
                                )}
                            </div>
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}

// ── Offline overlay ────────────────────────────────────────────────────────
function OfflineOverlay({ onRetry, retrying }) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minHeight: 320,
            gap: 12,
            background: 'var(--bg-base)',
        }}>
            <div style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <Camera size={24} style={{ color: 'var(--text-muted)' }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-secondary)' }}>
                Stream Unavailable
            </div>
            <div style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                textAlign: 'center',
                maxWidth: 260,
                lineHeight: 1.6,
            }}>
                Device may be outside your network range
            </div>
            <button className="btn" onClick={onRetry} disabled={retrying}>
                {retrying ? (
                    <>
                        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        Checking...
                    </>
                ) : (
                    <>
                        <RefreshCw size={14} /> Retry Connection
                    </>
                )}
            </button>
        </div>
    )
}

// ── Status pill for status bar ─────────────────────────────────────────────
function StatusPill({ label, value, color }) {
    return (
        <div className="status-pill">
            <div className="status-pill-label">
                {label}
            </div>
            <div className="status-pill-value" style={{ color }}>
                {value}
            </div>
        </div>
    )
}

// ── Info row for device info panel ─────────────────────────────────────────
function InfoRow({ label, value }) {
    return (
        <div className="info-row">
            <span className="info-row-label">
                {label}
            </span>
            <span className="info-row-value">
                {value}
            </span>
        </div>
    )
}
