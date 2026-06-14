import { useState, useEffect } from 'react'
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

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        const [profRes, usersRes] = await Promise.all([
            supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle(),
            supabase.from('profiles').select('*').order('created_at', { ascending: true }),
        ])
        setProfile(profRes.data)
        setUsers(usersRes.data || [])
        setLoading(false)
    }

    async function handleRoleChange(userId, newRole) {
        setUpdatingId(userId)
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId)

        if (error) {
            addToast({ type: 'high', title: 'Update Failed', message: error.message })
        } else {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
            addToast({ type: 'low', title: 'Role Updated', message: `Role changed to ${newRole}` })
        }
        setUpdatingId(null)
    }

    // ── Access guard ─────────────────────────────────────────────────────
    if (loading) {
        return <div className="empty-state"><div className="spinner" /></div>
    }

    if (profile?.role !== 'admin') {
        return (
            <div className="empty-state">
                <AlertTriangle size={32} style={{ color: 'var(--red)', opacity: 0.6 }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>
                    Access Denied
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Only administrators can manage users
                </span>
            </div>
        )
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
            <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
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
                            {users.length} person{users.length !== 1 ? 's' : ''} with access
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
                                        {users.map(user => {
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
                                                                <div style={{ fontWeight: 600, fontSize: 13 }}>
                                                                    {user.full_name || 'Unnamed User'}
                                                                    {isCurrentUser && (
                                                                        <span style={{
                                                                            marginLeft: 8,
                                                                            fontSize: 10,
                                                                            fontFamily: 'var(--font-mono)',
                                                                            color: 'var(--accent)',
                                                                            opacity: 0.7,
                                                                        }}>
                                                                            YOU
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{
                                                                    fontFamily: 'var(--font-mono)',
                                                                    fontSize: 11,
                                                                    color: 'var(--text-muted)',
                                                                }}>
                                                                    {user.email || user.id.slice(0, 8)}
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

                    {/* Info note */}
                    <div style={{
                        marginTop: 16,
                        padding: '12px 16px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 1.6,
                    }}>
                        <strong style={{ color: 'var(--text-secondary)' }}>Note:</strong> Removing users from the authentication system requires Supabase Admin API access.
                        Use your Supabase dashboard to fully delete user accounts.
                    </div>
                </div>
            )}

            {/* ── INVITE TAB ── */}
            {activeTab === 'invite' && (
                <div className="card" style={{ maxWidth: 480 }}>
                    <div className="card-header">
                        <span className="card-title">Grant Access to User</span>
                    </div>

                    <div style={{
                        padding: '14px 16px',
                        background: 'rgba(0,229,255,0.06)',
                        border: '1px solid rgba(0,229,255,0.15)',
                        borderRadius: 'var(--radius)',
                        marginBottom: 20,
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                    }}>
                        <strong style={{ color: 'var(--brand-600)' }}>ℹ Important:</strong>{' '}
                        User invitations require the Supabase Auth Admin API, which cannot be called securely from the browser.
                        Use your <strong>Supabase dashboard</strong> or a <strong>secure backend function</strong> to create new user accounts and grant them access.
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
                            disabled
                            style={{ alignSelf: 'flex-start', opacity: 0.5 }}
                            title="Requires server-side implementation"
                        >
                            <UserPlus size={13} /> Grant Access
                        </button>

                        <div style={{
                            fontSize: 11,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            lineHeight: 1.6,
                        }}>
                            This form is a placeholder. To invite users, go to your Supabase project → Authentication → Users → Invite user.
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
