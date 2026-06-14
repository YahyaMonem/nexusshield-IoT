import { useState, useEffect, useRef } from 'react'
import { supabase, EVENT_TYPES, SEVERITY } from '../supabaseClient'
import { formatDistanceToNow, format } from 'date-fns'
import { Maximize2, Minimize2, Camera, Wifi, Save, Volume2, Mic, Lightbulb, BrainCircuit } from 'lucide-react'
import { computeMotionSeverity, MOTION_SEVERITY_META } from '../motionSeverity'
import { useToast } from '../toastContext'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import emailjs from '@emailjs/browser'

export default function LiveFeedPage() {
    const [devices, setDevices] = useState([])
    const [configs, setConfigs] = useState({}) // keyed by device_id
    const [selectedId, setSelectedId] = useState(null)
    const [streamError, setStreamError] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [events, setEvents] = useState([])
    const [loadingDevices, setLoadingDevices] = useState(true)
    const [loadingEvents, setLoadingEvents] = useState(false)
    const channelRef = useRef(null)
    const { addToast } = useToast()

    // ── Editable config state ─────────────────────────────────────────────
    const [editSensitivity, setEditSensitivity] = useState(5)
    const [editCooldown, setEditCooldown] = useState(30)
    const [editAlertEnabled, setEditAlertEnabled] = useState(true)
    const [editBuzzerEnabled, setEditBuzzerEnabled] = useState(false)
    const [editMicEnabled, setEditMicEnabled] = useState(false)
    const [editLedEnabled, setEditLedEnabled] = useState(true)
    const [savingConfig, setSavingConfig] = useState(false)
    const [configDirty, setConfigDirty] = useState(false)
    
    // ── AI overlay states ────────────────────────────────────────────────
    const [currentTime, setCurrentTime] = useState(new Date())
    const [aiModel, setAiModel] = useState(null)
    const [aiLoading, setAiLoading] = useState(true)
    const [aiTerminalLog, setAiTerminalLog] = useState([])
    
    const streamImgRef = useRef(null)
    const aiCanvasRef = useRef(null)
    
    // ── AI Tracking State
    const trackingMapRef = useRef({}) // { id: { class, first_seen, last_seen, active } }
    const nextTrackerIdRef = useRef(1)
    const detectionLoopRef = useRef(null)
    const lastEmailSentRef = useRef(0) // timestamp of last email sent

    // ── Device Status & Stream State ─────────────────────────────────────────
    const selectedDevice = devices.find(d => d.id === selectedId) || null
    const selectedConfig = selectedId ? configs[selectedId] : null

    const STALE_MS = 2 * 60 * 1000
    const lastSeen = selectedDevice?.last_seen_at ? new Date(selectedDevice.last_seen_at) : null
    const isRecentlySeen = lastSeen && (Date.now() - lastSeen.getTime()) <= STALE_MS

    let deviceStatusKey = 'offline'
    if (selectedDevice?.status === 'online' && isRecentlySeen) deviceStatusKey = 'online'
    else if (selectedDevice?.status === 'online' && !isRecentlySeen) deviceStatusKey = 'stale'

    const DEVICE_STATUS = {
        online:  { label: 'Online',        color: 'var(--green)',      bg: 'rgba(16,185,129,0.12)', dot: 'var(--green)'       },
        stale:   { label: 'Disconnected',  color: '#fbbf24',           bg: 'rgba(251,191,36,0.12)', dot: '#fbbf24'            },
        offline: { label: 'Offline',       color: 'var(--text-muted)', bg: 'var(--bg-hover)',       dot: 'var(--text-muted)'  },
    }
    const deviceStatus = DEVICE_STATUS[deviceStatusKey]

    const isOnline = deviceStatusKey === 'online'
    const hasStream = !!(selectedDevice?.stream_url)
    const streamLive = hasStream && !streamError && isOnline

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        
        // Request desktop notification permission on mount
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission()
        }
        
        return () => clearInterval(timer)
    }, [])

    // ── Load AI Model on Mount ──────────────────────────────────────────────
    useEffect(() => {
        async function loadModel() {
            try {
                const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
                setAiModel(model)
                setAiLoading(false)
            } catch (err) {
                console.error("Failed to load TF.js Model:", err)
            }
        }
        loadModel()
    }, [])

    // ── AI Detection & Tracking Loop ────────────────────────────────────────
    useEffect(() => {
        // Only run if the model is loaded, we're on the page, and stream is live
        if (!aiModel || !streamLive) return

        let running = true

        // Utility to compute bounding box overlap (Intersection over Union)
        function getIoU(box1, box2) {
            const [x1, y1, w1, h1] = box1
            const [x2, y2, w2, h2] = box2
            const xA = Math.max(x1, x2)
            const yA = Math.max(y1, y2)
            const xB = Math.min(x1 + w1, x2 + w2)
            const yB = Math.min(y1 + h1, y2 + h2)
            const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA)
            const box1Area = w1 * h1
            const box2Area = w2 * h2
            return interArea / parseFloat(box1Area + box2Area - interArea)
        }

        async function analyzeFrame() {
            if (!running) return

            const img = streamImgRef.current
            const canvas = aiCanvasRef.current

            if (img && canvas && img.complete && img.naturalWidth > 0) {
                // Ensure canvas size matches image container size
                if (canvas.width !== img.clientWidth) {
                    canvas.width = img.clientWidth
                    canvas.height = img.clientHeight
                }
                
                const ctx = canvas.getContext('2d')
                
                try {
                    // Detect objects
                    const predictions = await aiModel.detect(img)
                    const targetClasses = ['person', 'dog', 'cat']
                    
                    // Filter down to humans/pets with decent confidence
                    const validPreds = predictions.filter(p => targetClasses.includes(p.class) && p.score > 0.5)

                    // Clear previous drawings
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    
                    const now = new Date()
                    const activeTrackers = new Set()

                    // Match predictions to existing trackers (centroid/IoU tracking)
                    for (const pred of validPreds) {
                        let bestMatchId = null
                        let bestIoU = 0.3 // minimum overlap to consider it the same object

                        for (const [tId, tracker] of Object.entries(trackingMapRef.current)) {
                            if (tracker.class === pred.class) {
                                const iou = getIoU(pred.bbox, tracker.last_bbox)
                                if (iou > bestIoU) {
                                    bestIoU = iou
                                    bestMatchId = tId
                                }
                            }
                        }

                        let tId = bestMatchId
                        if (!tId) {
                            // New object!
                            tId = nextTrackerIdRef.current++
                            trackingMapRef.current[tId] = {
                                class: pred.class,
                                first_seen: now,
                            }
                            
                            // Log to UI Terminal
                            setAiTerminalLog(prev => [`[${format(now, 'HH:mm:ss')}] > New ${pred.class.toUpperCase()} detected (ID: ${tId})`, ...prev].slice(0, 20))
                            
                            // Native Desktop Notification
                            if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification(`NexusShield Alert`, {
                                    body: `${pred.class.toUpperCase()} detected on ${selectedDevice?.name || 'Camera'}!`,
                                    icon: '/vite.svg'
                                })
                            }
                            
                            // EmailJS Notification (with cooldown)
                            const cooldownMs = (selectedConfig?.detection_cooldown || 30) * 1000
                            if (now.getTime() - lastEmailSentRef.current > cooldownMs) {
                                lastEmailSentRef.current = now.getTime()
                                
                                // To make this work, replace these with your actual EmailJS keys
                                emailjs.send(
                                    'service_gewyj2y', 
                                    'template_tpovemp', 
                                    {
                                        object_class: pred.class.toUpperCase(),
                                        device_name: selectedDevice?.name || 'Camera',
                                        time: format(now, 'HH:mm:ss')
                                    }, 
                                    'Zmdyuo3yIL4Iav2ZU'
                                ).then(
                                    () => console.log('SUCCESS: Email sent via EmailJS'),
                                    (error) => console.log('FAILED to send email via EmailJS (Did you add your keys?)', error)
                                )
                            }
                        }

                        // Update tracker state
                        trackingMapRef.current[tId].last_seen = now
                        trackingMapRef.current[tId].last_bbox = pred.bbox
                        activeTrackers.add(tId.toString())

                        // Draw bounding box
                        const [x, y, w, h] = pred.bbox
                        // Scale bbox from natural image size to container size
                        const scaleX = canvas.width / img.naturalWidth
                        const scaleY = canvas.height / img.naturalHeight
                        
                        const drawX = x * scaleX
                        const drawY = y * scaleY
                        const drawW = w * scaleX
                        const drawH = h * scaleY

                        ctx.strokeStyle = '#00ff00'
                        ctx.lineWidth = 2
                        ctx.strokeRect(drawX, drawY, drawW, drawH)
                        
                        // Draw label
                        ctx.fillStyle = '#00ff00'
                        ctx.fillRect(drawX, drawY - 20, drawW, 20)
                        ctx.fillStyle = '#000000'
                        ctx.font = '12px monospace'
                        ctx.fontWeight = 'bold'
                        ctx.fillText(`${pred.class.toUpperCase()} #${tId}`, drawX + 4, drawY - 6)
                    }

                    // Check for disappeared objects
                    for (const [tId, tracker] of Object.entries(trackingMapRef.current)) {
                        if (!activeTrackers.has(tId)) {
                            const timeSinceSeen = (now - tracker.last_seen) / 1000
                            if (timeSinceSeen > 5) {
                                // Object has been gone for 5 seconds. Log it and remove it.
                                const duration = Math.round((tracker.last_seen - tracker.first_seen) / 1000)
                                
                                setAiTerminalLog(prev => [`[${format(now, 'HH:mm:ss')}] > ${tracker.class.toUpperCase()} #${tId} left. Stayed ${duration}s`, ...prev].slice(0, 20))
                                
                                // Fire and forget upload to Supabase
                                supabase.from('tracking_events').insert({
                                    device_id: selectedId,
                                    object_class: tracker.class,
                                    tracking_id: parseInt(tId),
                                    first_seen_at: tracker.first_seen.toISOString(),
                                    last_seen_at: tracker.last_seen.toISOString(),
                                    duration_seconds: duration
                                }).then(({ error }) => {
                                    if (error) console.error("Failed to upload tracking event:", error)
                                })
                                
                                delete trackingMapRef.current[tId]
                            }
                        }
                    }

                } catch (e) {
                    console.error("AI Detection Error", e)
                }
            }

            // Loop immediately after processing this frame
            if (running) {
                detectionLoopRef.current = requestAnimationFrame(analyzeFrame)
            }
        }

        // Start the loop
        analyzeFrame()

        return () => {
            running = false
            if (detectionLoopRef.current) cancelAnimationFrame(detectionLoopRef.current)
        }
    }, [aiModel, streamLive, selectedId])

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

    // ── 3. Sync editable config state when selectedId or configs change ────
    useEffect(() => {
        if (!selectedId) return
        const cfg = configs[selectedId]
        if (cfg) {
            setEditSensitivity(cfg.sensitivity ?? 5)
            setEditCooldown(cfg.detection_cooldown ?? 30)
            setEditAlertEnabled(cfg.alert_enabled ?? true)
            setEditBuzzerEnabled(cfg.buzzer_enabled ?? false)
            setEditMicEnabled(cfg.mic_enabled ?? false)
            setEditLedEnabled(cfg.led_enabled ?? true)
        } else {
            // defaults for a device with no config row
            setEditSensitivity(5)
            setEditCooldown(30)
            setEditAlertEnabled(true)
            setEditBuzzerEnabled(false)
            setEditMicEnabled(false)
            setEditLedEnabled(true)
        }
        setConfigDirty(false)
    }, [selectedId, configs])

    // ── Save config handler ───────────────────────────────────────────────
    async function saveConfig() {
        if (!selectedId) return
        setSavingConfig(true)
        const payload = {
            device_id: selectedId,
            sensitivity: editSensitivity,
            detection_cooldown: editCooldown,
            alert_enabled: editAlertEnabled,
            buzzer_enabled: editBuzzerEnabled,
            mic_enabled: editMicEnabled,
            led_enabled: editLedEnabled,
        }
        const { error } = await supabase
            .from('device_config')
            .upsert(payload, { onConflict: 'device_id' })

        if (error) {
            addToast({ type: 'high', title: 'Config Save Failed', message: error.message })
        } else {
            // Update local cache
            setConfigs(prev => ({ ...prev, [selectedId]: payload }))
            setConfigDirty(false)
            addToast({ type: 'low', title: 'Config Saved', message: 'Device configuration updated' })
        }
        setSavingConfig(false)
    }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>

            {/* ── Camera selector bar ─────────────────────────────────────── */}
            {devices.length > 1 && (
                <div style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>

                    {/* Stream container */}
                    <div style={{
                        position: 'relative',
                        flex: 1,
                        minHeight: 320,
                        background: 'var(--bg-elevated)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                    }}>
                        {/* Stream or offline overlay */}
                        {streamLive ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <img
                                    ref={streamImgRef}
                                    key={selectedDevice?.stream_url}
                                    src={selectedDevice.stream_url}
                                    crossOrigin="anonymous"
                                    alt="Live Stream"
                                    onError={() => setStreamError(true)}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        display: 'block',
                                    }}
                                />
                                {/* --- High-Tech Sec Cam Overlays --- */}
                                {/* AI Canvas Layer */}
                                <canvas
                                    ref={aiCanvasRef}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        pointerEvents: 'none',
                                    }}
                                />
                                {/* Crosshairs */}
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    pointerEvents: 'none',
                                }}>
                                    <div style={{ position: 'absolute', top: -20, left: 0, width: 1, height: 10, background: 'rgba(0, 255, 0, 0.5)' }} />
                                    <div style={{ position: 'absolute', top: 10, left: 0, width: 1, height: 10, background: 'rgba(0, 255, 0, 0.5)' }} />
                                    <div style={{ position: 'absolute', top: 0, left: -20, width: 10, height: 1, background: 'rgba(0, 255, 0, 0.5)' }} />
                                    <div style={{ position: 'absolute', top: 0, left: 10, width: 10, height: 1, background: 'rgba(0, 255, 0, 0.5)' }} />
                                    <div style={{ position: 'absolute', top: -3, left: -3, width: 6, height: 6, borderRadius: '50%', border: '1px solid rgba(0, 255, 0, 0.5)' }} />
                                </div>
                                {/* Corner Brackets */}
                                <div style={{ position: 'absolute', top: 20, left: 20, width: 20, height: 20, borderTop: '2px solid rgba(0,255,0,0.4)', borderLeft: '2px solid rgba(0,255,0,0.4)', pointerEvents: 'none' }} />
                                <div style={{ position: 'absolute', top: 20, right: 20, width: 20, height: 20, borderTop: '2px solid rgba(0,255,0,0.4)', borderRight: '2px solid rgba(0,255,0,0.4)', pointerEvents: 'none' }} />
                                <div style={{ position: 'absolute', bottom: 20, left: 20, width: 20, height: 20, borderBottom: '2px solid rgba(0,255,0,0.4)', borderLeft: '2px solid rgba(0,255,0,0.4)', pointerEvents: 'none' }} />
                                <div style={{ position: 'absolute', bottom: 20, right: 20, width: 20, height: 20, borderBottom: '2px solid rgba(0,255,0,0.4)', borderRight: '2px solid rgba(0,255,0,0.4)', pointerEvents: 'none' }} />
                                
                                {/* Bottom Right Timestamp */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 12,
                                    right: 16,
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    textShadow: '0px 0px 4px rgba(0,0,0,0.8)',
                                    pointerEvents: 'none',
                                }}>
                                    {format(currentTime, 'yyyy-MM-dd HH:mm:ss')}
                                </div>

                                {/* Placeholder for AI Bounding Boxes */}
                                {/* Removed old placeholder since we have the native canvas now */}
                            </div>
                        ) : (
                            <OfflineOverlay />
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
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 20,
                        padding: '10px 16px',
                        background: 'var(--bg-surface)',
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        flexWrap: 'wrap',
                    }}>
                        {/* Device name */}
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                                {selectedDevice?.name || '—'}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
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

                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Wifi size={13} color={streamLive ? 'var(--green)' : 'var(--text-muted)'} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: streamLive ? 'var(--green)' : 'var(--text-muted)' }}>
                                {streamLive ? 'Stream OK' : 'No Signal'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Info + Events panel ───────────────────────── */}
                {!isFullscreen && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', paddingRight: 4, paddingBottom: 14 }}>

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

                        {/* ── Device Actions card (Realtime Toggles) ────────── */}
                        <div className="card" style={{ flexShrink: 0 }}>
                            <div className="card-header">
                                <span className="card-title">Device Actions</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                {/* Buzzer */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Volume2 size={16} color="var(--text-secondary)" />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Activate Buzzer
                                        </span>
                                    </div>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={editBuzzerEnabled}
                                            onChange={e => {
                                                setEditBuzzerEnabled(e.target.checked)
                                                setConfigDirty(true)
                                            }}
                                        />
                                        <span className="toggle-track" />
                                    </label>
                                </div>

                                {/* Mic */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Mic size={16} color="var(--text-secondary)" />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Activate Microphone
                                        </span>
                                    </div>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={editMicEnabled}
                                            onChange={e => {
                                                setEditMicEnabled(e.target.checked)
                                                setConfigDirty(true)
                                            }}
                                        />
                                        <span className="toggle-track" />
                                    </label>
                                </div>

                                {/* LED */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <Lightbulb size={16} color="var(--text-secondary)" />
                                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            LED Indicator
                                        </span>
                                    </div>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={editLedEnabled}
                                            onChange={e => {
                                                setEditLedEnabled(e.target.checked)
                                                setConfigDirty(true)
                                            }}
                                        />
                                        <span className="toggle-track" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* ── Device Config card (Editable) ───────────────── */}
                        <div className="card" style={{ flexShrink: 0 }}>
                            <div className="card-header">
                                <span className="card-title">Device Config</span>
                                {configDirty && (
                                    <span className="badge" style={{
                                        color: 'var(--yellow)',
                                        background: 'rgba(245,158,11,0.12)',
                                        fontSize: 10,
                                    }}>
                                        Unsaved
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {/* Sensitivity slider */}
                                <div>
                                    <div style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                        marginBottom: 8,
                                    }}>
                                        Sensitivity
                                    </div>
                                    <input
                                        type="range"
                                        className="slider"
                                        min={0}
                                        max={10}
                                        step={1}
                                        value={editSensitivity}
                                        onChange={e => {
                                            setEditSensitivity(Number(e.target.value))
                                            setConfigDirty(true)
                                        }}
                                    />
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        marginTop: 4,
                                    }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>0</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                                            {editSensitivity} / 10
                                        </span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>10</span>
                                    </div>
                                </div>

                                {/* Detection cooldown */}
                                <div>
                                    <div style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                        marginBottom: 6,
                                    }}>
                                        Detection Cooldown
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            className="input"
                                            type="number"
                                            min={0}
                                            max={600}
                                            value={editCooldown}
                                            onChange={e => {
                                                setEditCooldown(Number(e.target.value))
                                                setConfigDirty(true)
                                            }}
                                            style={{ width: 80, textAlign: 'center' }}
                                        />
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                            seconds
                                        </span>
                                    </div>
                                </div>

                                {/* Alert enabled toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: 10,
                                        letterSpacing: '0.1em',
                                        textTransform: 'uppercase',
                                        color: 'var(--text-muted)',
                                    }}>
                                        Alerts Enabled
                                    </span>
                                    <label className="toggle">
                                        <input
                                            type="checkbox"
                                            checked={editAlertEnabled}
                                            onChange={e => {
                                                setEditAlertEnabled(e.target.checked)
                                                setConfigDirty(true)
                                            }}
                                        />
                                        <span className="toggle-track" />
                                    </label>
                                </div>

                                {/* Save button */}
                                <button
                                    className="btn btn-primary"
                                    onClick={saveConfig}
                                    disabled={savingConfig || !configDirty}
                                    style={{
                                        opacity: (!configDirty || savingConfig) ? 0.5 : 1,
                                        justifyContent: 'center',
                                    }}
                                >
                                    {savingConfig
                                        ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</>
                                        : <><Save size={13} /> Save Config</>
                                    }
                                </button>
                            </div>
                        </div>

                        {/* AI Event Terminal card */}
                        <div className="card" style={{ flex: 1, minHeight: 200, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0, background: '#0a0a0a', border: '1px solid #333' }}>
                            <div className="card-header" style={{ padding: '14px 16px 0', marginBottom: 0, borderBottom: '1px solid #222', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <span className="card-title" style={{ color: '#0f0', fontFamily: 'var(--font-mono)' }}>AI_VISION_TERMINAL</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>REALTIME</span>
                                </div>
                                {aiLoading ? (
                                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-quaternary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> Loading...
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#0f0', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <BrainCircuit size={12} /> ONLINE
                                    </span>
                                )}
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0 4px' }}>
                                {aiTerminalLog.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '28px 16px' }}>
                                        {aiLoading ? 'Initializing AI Engine...' : 'Waiting for detections...'}
                                    </div>
                                ) : (
                                    aiTerminalLog.map((logStr, i) => (
                                        <div key={i} className="new-row" style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '4px 16px',
                                        }}>
                                            <span style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: '#0f0' }}>
                                                {logStr}
                                            </span>
                                        </div>
                                    ))
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
function OfflineOverlay() {
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
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-muted)',
                textAlign: 'center',
                maxWidth: 240,
                lineHeight: 1.6,
            }}>
                Device may be outside your network range
            </div>
        </div>
    )
}

// ── Status pill for status bar ─────────────────────────────────────────────
function StatusPill({ label, value, color }) {
    return (
        <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                {label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color }}>
                {value}
            </div>
        </div>
    )
}

// ── Info row for device info panel ─────────────────────────────────────────
function InfoRow({ label, value }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', flexShrink: 0 }}>
                {label}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', wordBreak: 'break-word' }}>
                {value}
            </span>
        </div>
    )
}