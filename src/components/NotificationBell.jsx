import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { formatDistanceToNow } from 'date-fns'

export default function NotificationBell() {
    const [open, setOpen] = useState(false)
    const [events, setEvents] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const dropdownRef = useRef(null)
    const openRef = useRef(open)

    useEffect(() => { openRef.current = open }, [open])

    // Load last viewed time from local storage
    const getLastViewed = () => {
        const stored = localStorage.getItem('nexus_last_notifications_view')
        return stored ? new Date(stored) : new Date(0) // Default to epoch if never opened
    }

    const markAsRead = () => {
        localStorage.setItem('nexus_last_notifications_view', new Date().toISOString())
        setUnreadCount(0)
    }

    useEffect(() => {
        // Close dropdown if clicked outside
        function handleClickOutside(e) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        async function fetchInitialEvents() {
            // Fetch tracking events
            const { data } = await supabase
                .from('tracking_events')
                .select('id, object_class, duration_seconds, created_at, first_seen_at')
                .order('created_at', { ascending: false })
                .limit(20)

            const evs = data || []
            setEvents(evs)

            const lastViewed = getLastViewed()
            const unread = evs.filter(e => new Date(e.created_at) > lastViewed).length
            setUnreadCount(unread)
        }
        fetchInitialEvents()

        // Subscribe to new tracking events
        const channel = supabase
            .channel('bell-tracking-events')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tracking_events' }, payload => {
                setEvents(prev => [payload.new, ...prev].slice(0, 20))
                // If the dropdown is currently open, automatically update the last viewed time
                if (openRef.current) {
                    markAsRead()
                } else {
                    setUnreadCount(count => count + 1)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [])

    const handleToggle = () => {
        if (!open) {
            markAsRead()
        }
        setOpen(!open)
    }

    return (
        <div ref={dropdownRef} className="notification-menu">
            {/* Bell Button */}
            <button 
                onClick={handleToggle}
                className={`notification-trigger${open ? ' active' : ''}`}
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: 6,
                        right: 8,
                        background: 'var(--red)',
                        color: 'white',
                        fontSize: 10,
                        fontWeight: 'bold',
                        borderRadius: '10px',
                        padding: '2px 6px',
                        lineHeight: 1,
                        transform: 'translate(50%, -50%)',
                        border: '2px solid var(--bg-primary)',
                    }}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                )}
            </button>

            {/* Dropdown Panel */}
            {open && (
                <div className="notification-panel" role="menu">
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-primary)' }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Notifications</h3>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {events.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-quaternary)', fontSize: 13 }}>
                                No recent alerts.
                            </div>
                        ) : (
                            events.map(ev => (
                                <div key={ev.id} style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid var(--border-primary)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                }}
                                className="notification-item"
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                                            {(ev.object_class || '?').charAt(0).toUpperCase() + (ev.object_class || '?').slice(1)} Detected
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-quaternary)', whiteSpace: 'nowrap' }}>
                                            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                                        Stayed for {ev.duration_seconds} seconds.
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
