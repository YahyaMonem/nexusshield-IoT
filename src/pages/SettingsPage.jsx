import { useState, useEffect, useRef, useId } from 'react'
import { supabase, LOG_LEVELS } from '../supabaseClient'
import { MOTION_SEVERITY_META } from '../motionSeverity'
import { useAuth } from '../authContext'
import { useToast } from '../toastContext'
import { format } from 'date-fns'
import { Save, User, Terminal, Bell, Send, Info, Moon, Sun } from 'lucide-react'
import { useTheme } from '../themeContext'

export default function SettingsPage() {
    const { session } = useAuth()
    const { addToast } = useToast()
    const [profile, setProfile] = useState({ full_name: '' })
    const [logs, setLogs] = useState([])
    const [savingProfile, setSavingProfile] = useState(false)
    const [logFilter, setLogFilter] = useState('all')
    const [activeTab, setActiveTab] = useState('profile')
    const { theme, setTheme } = useTheme()

    // ── Notification preferences ──────────────────────────────────────────
    const [notifPrefs, setNotifPrefs] = useState({
        email_notifications: true,
        push_notifications: false,
        sms_notifications: false,
        high_severity_alerts: true,
        telegram_chat_id: '',
        telegram_enabled: false,
    })
    const [savingNotif, setSavingNotif] = useState(false)
    const [notifLoaded, setNotifLoaded] = useState(false)

    const isMounted = useRef(true)
    useEffect(() => {
        return () => { isMounted.current = false }
    }, [])

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        const [profRes, logRes] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
            supabase.from('system_logs').select('*, devices(name)').order('created_at', { ascending: false }).limit(100),
        ])

        setLogs(logRes.data || [])
        if (profRes.data) {
            setProfile(profRes.data)
            // Load notification preferences from profile
            setNotifPrefs({
                email_notifications: profRes.data.email_notifications ?? true,
                push_notifications: profRes.data.push_notifications ?? false,
                sms_notifications: profRes.data.sms_notifications ?? false,
                high_severity_alerts: profRes.data.high_severity_alerts ?? true,
                telegram_chat_id: profRes.data.telegram_chat_id ?? '',
                telegram_enabled: profRes.data.telegram_enabled ?? false,
            })
        }
        setNotifLoaded(true)
    }

    async function saveProfile() {
        setSavingProfile(true)
        const { error } = await supabase.from('profiles').update({ full_name: profile.full_name }).eq('id', session.user.id)
        if (!isMounted.current) return
        if (error) {
            addToast({ type: 'high', title: 'Save Failed', message: error.message })
        } else {
            addToast({ type: 'low', title: 'Profile Saved', message: 'Your profile has been updated' })
        }
        setSavingProfile(false)
    }

    async function saveNotifications() {
        setSavingNotif(true)
        const { error } = await supabase.from('profiles').update({
            email_notifications: notifPrefs.email_notifications,
            push_notifications: notifPrefs.push_notifications,
            sms_notifications: notifPrefs.sms_notifications,
            high_severity_alerts: notifPrefs.high_severity_alerts,
            telegram_chat_id: notifPrefs.telegram_chat_id,
            telegram_enabled: notifPrefs.telegram_enabled,
        }).eq('id', session.user.id)

        if (!isMounted.current) return
        if (error) {
            addToast({ type: 'high', title: 'Save Failed', message: error.message })
        } else {
            addToast({ type: 'low', title: 'Preferences Saved', message: 'Notification settings updated' })
        }
        setSavingNotif(false)
    }

    const filteredLogs = logFilter === 'all'
        ? logs
        : logFilter === 'high' || logFilter === 'medium' || logFilter === 'low'
            ? logs.filter(l => l._severity === logFilter)
            : logs.filter(l => l.log_level === logFilter)

    const tabs = [
        { id: 'profile', label: 'Profile', icon: <User size={13} /> },
        { id: 'notifications', label: 'Notifications', icon: <Bell size={13} /> },
        { id: 'logs', label: 'System Logs', icon: <Terminal size={13} /> },
    ]

    return (
        <div>
            {/* Tabs */}
            <div className="tabs-scroll">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            padding: '9px 16px',
                            background: 'none', border: 'none',
                            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--brand-600)' : 'transparent'}`,
                            color: activeTab === tab.id ? 'var(--brand-600)' : 'var(--text-secondary)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 13, fontWeight: 600,
                            cursor: 'pointer',
                            marginBottom: -1,
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>


            {/* ── PROFILE TAB ── */}
            {activeTab === 'profile' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 480 }}>
                    <div className="card">
                        <div className="card-header"><span className="card-title">Appearance</span></div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            <button
                                className="btn"
                                onClick={() => setTheme('light')}
                                style={{
                                    flex: 1, padding: 16, height: 'auto',
                                    flexDirection: 'column', gap: 12,
                                    borderColor: theme === 'light' ? 'var(--brand-600)' : 'var(--border-secondary)',
                                    background: theme === 'light' ? 'var(--brand-50)' : 'transparent',
                                    color: theme === 'light' ? 'var(--brand-600)' : 'var(--text-secondary)'
                                }}
                            >
                                <Sun size={24} />
                                <span>Light Theme</span>
                            </button>
                            <button
                                className="btn"
                                onClick={() => setTheme('dark')}
                                style={{
                                    flex: 1, padding: 16, height: 'auto',
                                    flexDirection: 'column', gap: 12,
                                    borderColor: theme === 'dark' ? 'var(--brand-600)' : 'var(--border-secondary)',
                                    background: theme === 'dark' ? 'var(--brand-50)' : 'transparent',
                                    color: theme === 'dark' ? 'var(--brand-600)' : 'var(--text-secondary)'
                                }}
                            >
                                <Moon size={24} />
                                <span>Dark Theme</span>
                            </button>
                        </div>
                    </div>

                    <div className="card">
                        <div className="card-header"><span className="card-title">Your Profile</span></div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    className="input"
                                    value={profile.full_name || ''}
                                    onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))}
                                    placeholder="Your name"
                                />
                            </div>
                            <div>
                                <label className="label">Email</label>
                                <input className="input" value={session.user.email} disabled style={{ opacity: 0.5 }} />
                            </div>
                            <div>
                                <label className="label">Role</label>
                                <input className="input" value={profile.role || 'viewer'} disabled style={{ opacity: 0.5 }} />
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={saveProfile}
                                disabled={savingProfile}
                                style={{ alignSelf: 'flex-start' }}
                            >
                                {savingProfile ? 'Saving...' : <><Save size={13} /> Save Profile</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {activeTab === 'notifications' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
                    {/* Alert Preferences */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Alert Preferences</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <ToggleRow
                                label="Email Notifications"
                                description="Receive alerts via email"
                                checked={notifPrefs.email_notifications}
                                onChange={v => setNotifPrefs(p => ({ ...p, email_notifications: v }))}
                            />
                            <ToggleRow
                                label="Push Notifications"
                                description="Browser push notifications"
                                checked={notifPrefs.push_notifications}
                                onChange={v => setNotifPrefs(p => ({ ...p, push_notifications: v }))}
                            />
                            <ToggleRow
                                label="SMS Notifications"
                                description="Text message alerts"
                                checked={notifPrefs.sms_notifications}
                                onChange={v => setNotifPrefs(p => ({ ...p, sms_notifications: v }))}
                            />
                            <ToggleRow
                                label="High Severity Only"
                                description="Only send alerts for high severity events"
                                checked={notifPrefs.high_severity_alerts}
                                onChange={v => setNotifPrefs(p => ({ ...p, high_severity_alerts: v }))}
                            />
                        </div>
                    </div>

                    {/* Telegram Section */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">Telegram Alerts</span>
                            <span className="badge" style={{
                                color: 'var(--yellow)',
                                background: 'rgba(245,158,11,0.12)',
                                fontSize: 10,
                            }}>
                                Coming Next
                            </span>
                        </div>

                        {/* <div style={{
                            padding: '12px 14px',
                            background: 'var(--brand-50)',
                            border: '1px solid var(--brand-200)',
                            borderRadius: 'var(--radius)',
                            marginBottom: 16,
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                        }}>
                            <Info size={14} color="var(--brand-600)" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                Telegram bot message sending is handled by a <strong>secure backend</strong> (Supabase Edge Function or edge device script).
                                <strong style={{ color: 'var(--red)' }}> Never put the bot token in the frontend.</strong>
                            </div>
                        </div> */}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <ToggleRow
                                label="Enable Telegram Alerts"
                                description="Send event notifications to your Telegram"
                                checked={notifPrefs.telegram_enabled}
                                onChange={v => setNotifPrefs(p => ({ ...p, telegram_enabled: v }))}
                            />

                            <div>
                                <label className="label">Telegram Chat ID</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Send size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                    <input
                                        className="input"
                                        value={notifPrefs.telegram_chat_id}
                                        onChange={e => setNotifPrefs(p => ({ ...p, telegram_chat_id: e.target.value }))}
                                        placeholder="e.g. 123456789"
                                        style={{ flex: 1 }}
                                    />
                                </div>
                                <div style={{
                                    fontSize: 11,
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--text-muted)',
                                    marginTop: 6,
                                    lineHeight: 1.5,
                                }}>
                                    Message @userinfobot on Telegram to get your chat ID
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Save button */}
                    <button
                        className="btn btn-primary"
                        onClick={saveNotifications}
                        disabled={savingNotif || !notifLoaded}
                        style={{ alignSelf: 'flex-start', opacity: savingNotif ? 0.7 : 1 }}
                    >
                        {savingNotif
                            ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</>
                            : <><Save size={13} /> Save Preferences</>
                        }
                    </button>
                </div>
            )}

            {/* ── SYSTEM LOGS TAB ── */}
            {activeTab === 'logs' && (
                <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                        {[
                            { key: 'all', label: 'All', color: 'var(--text-secondary)' },
                            { key: 'high', label: 'High', color: '#f87171' },
                            { key: 'medium', label: 'Medium', color: '#fbbf24' },
                            { key: 'low', label: 'Low', color: '#60a5fa' },
                            { key: 'info', label: 'Info', color: '#60a5fa' },
                            { key: 'warn', label: 'Warn', color: 'var(--yellow)' },
                            { key: 'error', label: 'Error', color: 'var(--red)' },
                        ].map(({ key, label, color }) => (
                            <button
                                key={key}
                                onClick={() => setLogFilter(key)}
                                className="btn"
                                style={{
                                    padding: '5px 12px', fontSize: 11, textTransform: 'uppercase',
                                    fontFamily: 'var(--font-mono)',
                                    background: logFilter === key ? 'var(--brand-50)' : 'transparent',
                                    border: `1px solid ${logFilter === key ? 'var(--brand-600)' : 'var(--border-secondary)'}`,
                                    color: logFilter === key ? 'var(--brand-600)' : color,
                                }}
                            >
                                {label}
                            </button>
                        ))}
                        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                            {filteredLogs.length} entries
                        </span>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {filteredLogs.length === 0
                            ? <div className="empty-state">No logs found</div>
                            : (
                                <div className="table-scroll"><table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Level</th>
                                            <th>Device</th>
                                            <th>Message</th>
                                            <th>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLogs.map(log => {
                                            const sev = log._severity ? MOTION_SEVERITY_META[log._severity] : null
                                            const lc = sev || LOG_LEVELS[log.log_level] || { color: '#fff' }
                                            const displayLabel = sev ? sev.label : log.log_level
                                            return (
                                                <tr key={log.id}>
                                                    <td>
                                                        <span className="badge mono" style={{
                                                            color: lc.color, background: lc.color + '18',
                                                            textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.1em',
                                                        }}>
                                                            {displayLabel}
                                                        </span>
                                                    </td>
                                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        {log.devices?.name || '—'}
                                                    </td>
                                                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 400 }}>
                                                        {log.message}
                                                    </td>
                                                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                        {format(new Date(log.created_at), 'E d MMM h:mm a')}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table></div>
                            )
                        }
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Toggle Row component ──────────────────────────────────────────────────
function ToggleRow({ label, description, checked, onChange }) {
    const id = useId()
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
        }}>
            <div>
                <label htmlFor={id} style={{ fontSize: 13, fontWeight: 600, display: 'block', cursor: 'pointer' }}>{label}</label>
                <div style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    marginTop: 2,
                }}>
                    {description}
                </div>
            </div>
            <label className="toggle">
                <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                />
                <span className="toggle-track" />
            </label>
        </div>
    )
}
