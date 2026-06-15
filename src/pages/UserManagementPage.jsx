import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../authContext'
import { useToast } from '../toastContext'
import { format } from 'date-fns'
import { AlertTriangle, Users, UserPlus, Shield, Mail } from 'lucide-react'

const ROLES = ['admin', 'viewer', 'operator']

export default function UserManagementPage() {
    const { session } = useAuth()
    const { addToast } = useToast()
    const [profile, setProfile] = useState(null)
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [updatingId, setUpdatingId] = useState(null)
    const [activeTab, setActiveTab] = useState('users')

    // Invite form
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('viewer')
    const [pendingInvites, setPendingInvites] = useState(() => {
        try { return JSON.parse(localStorage.getItem('nexus_pending_invites') || '[]') }
        catch { return [] }
    })

    useEffect(() => {
        localStorage.setItem('nexus_pending_invites', JSON.stringify(pendingInvites))
    }, [pendingInvites])

    const isMounted = useRef(true)
    useEffect(() => {
        isMounted.current = true
        return () => { isMounted.current = false }
    }, [])

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        try {
            if (!session?.user?.id) return
            const [profRes, usersRes] = await Promise.all([
                supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
                supabase.from('profiles').select('*').order('created_at', { ascending: true }),
            ])
            if (!isMounted.current) return
            setProfile(profRes.data)
            setUsers(usersRes.data || [])
        } catch (e) {
            console.error(e)
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    async function handleRoleChange(userId, newRole) {
        // Handle pending invites
        if (String(userId).startsWith('pending-')) {
            setPendingInvites(prev => prev.map(inv => inv.id === userId ? { ...inv, role: newRole } : inv))
            addToast({ type: 'low', title: 'Role Updated', message: `Pending invite role changed to ${newRole}` })
            return
        }

        setUpdatingId(userId)
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)

        if (!isMounted.current) return
        if (error) {
            addToast({ type: 'high', title: 'Update Failed', message: error.message })
        } else {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
            addToast({ type: 'low', title: 'Role Updated', message: `Role changed to ${newRole}` })
        }
        setUpdatingId(null)
    }

    function handleGrantAccess() {
        if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
            addToast({ type: 'high', title: 'Invalid Email', message: 'Please enter a valid email address.' })
            return
        }

        const newInvite = {
            id: 'pending-' + Date.now(),
            email: inviteEmail.trim(),
            role: inviteRole,
            full_name: 'Pending Invite',
            created_at: new Date().toISOString(),
            isPending: true
        }

        setPendingInvites(prev => [newInvite, ...prev])
        addToast({ type: 'success', title: 'Access Granted', message: `Invitation sent to ${inviteEmail.trim()}` })
        setInviteEmail('')
        setActiveTab('users')
    }

    // ── Access guard ─────────────────────────────────────────────────────
    if (loading) {
        return <div className="empty-state"><div className="spinner" /></div>
    }



    const ROLE_STYLE = {
        admin:    { color: 'var(--brand-700)', bg: 'var(--brand-50)' },
        viewer:   { color: 'var(--success-700)',  bg: 'var(--success-50)' },
        operator: { color: '#6941c6', bg: '#f4f3ff' },
    }

    const tabs = [
        { id: 'users', label: 'Camera Access', icon: <Users size={13} /> },
        { id: 'invite', label: 'Grant Access', icon: <UserPlus size={13} /> },
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
                            borderBottom: `2px solid ${activeTab === tab.id ? 'var(--accent)' : 'transparent'}`,
                            color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
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

            {/* ── USERS TAB ── */}
            {activeTab === 'users' && (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 11,
                            color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase',
                        }}>
                            {users.length + pendingInvites.length} person{users.length + pendingInvites.length !== 1 ? 's' : ''} with access
                        </span>
                    </div>

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        {users.length === 0 ? (
                            <div className="empty-state">
                                <Users size={28} style={{ opacity: 0.3 }} />
                                <span>No users found</span>
                            </div>
                        ) : (
                            <div className="table-scroll">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            <th>Role</th>
                                            <th>Joined</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...pendingInvites, ...users].map(user => {
                                            const rs = ROLE_STYLE[user.role] || ROLE_STYLE.viewer
                                            const isCurrentUser = user.id === session.user.id
                                            return (
                                                <tr key={user.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <div style={{
                                                                width: 32, height: 32, borderRadius: '50%',
                                                                background: rs.bg,
                                                                border: `1px solid ${rs.color}30`,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                flexShrink: 0,
                                                            }}>
                                                                <Shield size={14} color={rs.color} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                    {user.full_name || 'Unnamed User'}
                                                                    {isCurrentUser && (
                                                                        <span style={{
                                                                            fontSize: 10,
                                                                            fontFamily: 'var(--font-mono)',
                                                                            color: 'var(--accent)',
                                                                            opacity: 0.7,
                                                                        }}>
                                                                            YOU
                                                                        </span>
                                                                    )}
                                                                    {user.isPending && (
                                                                        <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', fontSize: 10, padding: '2px 6px' }}>
                                                                            Pending
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{
                                                                    fontFamily: 'var(--font-mono)',
                                                                    fontSize: 11,
                                                                    color: 'var(--text-muted)',
                                                                }}>
                                                                    {user.email || String(user.id).slice(0, 8)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="badge" style={{
                                                            color: rs.color,
                                                            background: rs.bg,
                                                            textTransform: 'capitalize',
                                                            border: `1px solid ${rs.color}30`,
                                                        }}>
                                                            {user.role || 'viewer'}
                                                        </span>
                                                    </td>
                                                    <td style={{
                                                        fontFamily: 'var(--font-mono)',
                                                        fontSize: 11,
                                                        color: 'var(--text-muted)',
                                                    }}>
                                                        {user.created_at
                                                            ? format(new Date(user.created_at), 'MMM d, yyyy')
                                                            : '—'}
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                                                            {isCurrentUser ? (
                                                                <span style={{
                                                                    fontFamily: 'var(--font-mono)',
                                                                    fontSize: 10,
                                                                    color: 'var(--text-muted)',
                                                                }}>
                                                                    —
                                                                </span>
                                                            ) : (
                                                                <select
                                                                    value={user.role || 'viewer'}
                                                                    onChange={e => handleRoleChange(user.id, e.target.value)}
                                                                    disabled={updatingId === user.id}
                                                                    aria-label="Change user role"
                                                                    style={{
                                                                        background: 'var(--bg-surface)',
                                                                        border: '1px solid var(--border-accent)',
                                                                        borderRadius: 'var(--radius)',
                                                                        color: 'var(--text-primary)',
                                                                        fontFamily: 'var(--font-mono)',
                                                                        fontSize: 11,
                                                                        padding: '5px 8px',
                                                                        cursor: 'pointer',
                                                                        outline: 'none',
                                                                        opacity: updatingId === user.id ? 0.5 : 1,
                                                                        textTransform: 'capitalize',
                                                                    }}
                                                                >
                                                                    {ROLES.map(r => (
                                                                        <option key={r} value={r}>{r}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            {user.isPending && (
                                                                <button 
                                                                    className="btn btn-ghost" 
                                                                    style={{ padding: '4px', color: 'var(--red)' }}
                                                                    onClick={() => setPendingInvites(prev => prev.filter(inv => inv.id !== user.id))}
                                                                    title="Cancel Invitation"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── INVITE TAB ── */}
            {activeTab === 'invite' && (
                <div className="card" style={{ maxWidth: 480 }}>
                    <div className="card-header">
                        <span className="card-title">Grant Access to User</span>
                    </div>



                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <label className="label">Email Address</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    type="email"
                                    value={inviteEmail}
                                    onChange={e => setInviteEmail(e.target.value)}
                                    placeholder="user@example.com"
                                    style={{ paddingLeft: 36 }}
                                />
                                <Mail size={14} color="var(--text-muted)" style={{
                                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                                }} />
                            </div>
                        </div>
                        <div>
                            <label className="label">Assigned Role</label>
                            <select
                                className="input"
                                value={inviteRole}
                                onChange={e => setInviteRole(e.target.value)}
                                style={{ cursor: 'pointer' }}
                            >
                                {ROLES.map(r => (
                                    <option key={r} value={r} style={{ textTransform: 'capitalize' }}>{r}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            className="btn btn-primary"
                            onClick={handleGrantAccess}
                            style={{ alignSelf: 'flex-start' }}
                        >
                            <UserPlus size={13} /> Grant Access
                        </button>
                        
                        <div style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            lineHeight: 1.6,
                        }}>
                            Note: This adds them to a pending list. They will need to create an account at this URL to fully access the dashboard.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
