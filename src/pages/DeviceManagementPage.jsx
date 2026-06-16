import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../authContext'
import { useToast } from '../toastContext'
import { formatDistanceToNow } from 'date-fns'
import { Plus, Pencil, Trash2, X, HardDrive, MapPin, AlertTriangle } from 'lucide-react'

export default function DeviceManagementPage() {
    const { session } = useAuth()
    const { addToast } = useToast()
    const [profile, setProfile] = useState(null)
    const [devices, setDevices] = useState([])
    const [loading, setLoading] = useState(true)
    const [modalOpen, setModalOpen] = useState(false)
    const [editingDevice, setEditingDevice] = useState(null) // null = add mode
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)

    // Form fields
    const [formName, setFormName] = useState('')
    const [formLocation, setFormLocation] = useState('')
    const [formStatus, setFormStatus] = useState('offline')
    const [formError, setFormError] = useState('')

    const isMounted = useRef(true)
    useEffect(() => {
        isMounted.current = true
        return () => { isMounted.current = false }
    }, [])

    useEffect(() => {
        fetchProfile()
        fetchDevices()
    }, [])

    async function fetchProfile() {
        if (!session?.user?.id) return
        const { data } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .maybeSingle()
        if (isMounted.current) {
            setProfile(data)
        }
    }

    async function fetchDevices() {
        try {
            if (!session?.user?.id) return
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .order('name')
            if (!isMounted.current) return
            if (error) {
                addToast({ type: 'high', title: 'Load Failed', message: error.message })
            }
            setDevices(data || [])
        } catch (e) {
            console.error(e)
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    function openAddModal() {
        setEditingDevice(null)
        setFormName('')
        setFormLocation('')
        setFormStatus('offline')
        setFormError('')
        setModalOpen(true)
    }

    function openEditModal(device) {
        setEditingDevice(device)
        setFormName(device.name || '')
        setFormLocation(device.location || '')
        setFormStatus(device.status || 'offline')
        setFormError('')
        setModalOpen(true)
    }

    async function handleSave() {
        // Validate
        if (!formName.trim()) {
            setFormError('Device name is required')
            return
        }
        if (!formLocation.trim()) {
            setFormError('Location is required')
            return
        }

        setSaving(true)
        setFormError('')

        if (editingDevice) {
            // Update
            const { error } = await supabase
                .from('devices')
                .update({
                    name: formName.trim(),
                    location: formLocation.trim(),
                    status: formStatus,
                })
                .eq('id', editingDevice.id)

            if (!isMounted.current) return
            if (error) {
                setFormError(error.message)
                setSaving(false)
                return
            }
            addToast({ type: 'low', title: 'Device Updated', message: `${formName} updated successfully` })
        } else {
            // Insert
            const { error } = await supabase
                .from('devices')
                .insert({
                    name: formName.trim(),
                    location: formLocation.trim(),
                    status: formStatus,
                })

            if (!isMounted.current) return
            if (error) {
                setFormError(error.message)
                setSaving(false)
                return
            }
            addToast({ type: 'low', title: 'Device Added', message: `${formName} added successfully` })
        }

        setSaving(false)
        setModalOpen(false)
        fetchDevices()
    }

    async function handleDelete() {
        if (!deleteTarget) return
        setDeleting(true)

        const { error } = await supabase
            .from('devices')
            .delete()
            .eq('id', deleteTarget.id)

        if (!isMounted.current) return
        if (error) {
            addToast({ type: 'high', title: 'Delete Failed', message: error.message })
        } else {
            addToast({ type: 'info', title: 'Device Removed', message: `${deleteTarget.name} deleted` })
        }

        setDeleting(false)
        setDeleteTarget(null)
        fetchDevices()
    }

    // ── Access guard ─────────────────────────────────────────────────────
    if (loading) {
        return <div className="empty-state"><div className="spinner" /></div>
    }



    const STATUS_STYLE = {
        online: { label: 'Online', color: 'var(--green)', bg: 'rgba(16,185,129,0.12)', dot: 'var(--green)' },
        offline: { label: 'Offline', color: 'var(--text-muted)', bg: 'var(--bg-hover)', dot: 'var(--text-muted)' },
    }

    return (
        <div>
            {/* Header */}
            {/* <div className="page-toolbar page-toolbar--spaced">
                <div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                        {devices.length} device{devices.length !== 1 ? 's' : ''} registered
                    </div>
                </div>
                <button className="btn btn-primary" onClick={openAddModal}>
                    <Plus size={14} /> Add Device
                </button>
            </div> */}

            {/* Devices table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {devices.length === 0 ? (
                    <div className="empty-state">
                        <HardDrive size={28} style={{ opacity: 0.3 }} />
                        <span>No devices registered yet</span>
                        <button className="btn btn-ghost" onClick={openAddModal} style={{ marginTop: 8 }}>
                            <Plus size={13} /> Add your first device
                        </button>
                    </div>
                ) : (
                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Location</th>
                                    <th>Status</th>
                                    <th>Last Seen</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {devices.map(dev => {
                                    const s = STATUS_STYLE[dev.status] || STATUS_STYLE.offline
                                    return (
                                        <tr key={dev.id}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{
                                                        width: 32, height: 32, borderRadius: 8,
                                                        background: dev.status === 'online' ? 'rgba(16,185,129,0.1)' : 'var(--bg-hover)',
                                                        border: `1px solid ${dev.status === 'online' ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        <HardDrive size={14} color={s.color} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{dev.name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <MapPin size={12} color="var(--text-muted)" />
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                                                        {dev.location || '—'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge" style={{ color: s.color, background: s.bg }}>
                                                    <span className="badge-dot" style={{ background: s.dot }} />
                                                    {s.label}
                                                </span>
                                            </td>
                                            <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
                                                {dev.last_seen_at
                                                    ? formatDistanceToNow(new Date(dev.last_seen_at), { addSuffix: true })
                                                    : '—'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '6px 10px' }}
                                                        onClick={() => openEditModal(dev)}
                                                        title="Edit device"
                                                        aria-label="Edit device"
                                                    >
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '6px 10px', color: 'var(--red)' }}
                                                        onClick={() => setDeleteTarget(dev)}
                                                        title="Delete device"
                                                        aria-label="Delete device"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
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

            {/* ── Add / Edit Modal ──────────────────────────────────────── */}
            {modalOpen && (
                <div className="modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>
                                {editingDevice ? 'Edit Device' : 'Add New Device'}
                            </div>
                            <button
                                onClick={() => setModalOpen(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div>
                                <label className="label">Device Name *</label>
                                <input
                                    className="input"
                                    value={formName}
                                    onChange={e => setFormName(e.target.value)}
                                    placeholder="e.g. Front Door Camera"
                                />
                            </div>
                            <div>
                                <label className="label">Location *</label>
                                <input
                                    className="input"
                                    value={formLocation}
                                    onChange={e => setFormLocation(e.target.value)}
                                    placeholder="e.g. Main Entrance"
                                />
                            </div>
                            <div>
                                <label className="label">Status</label>
                                <select
                                    className="input"
                                    value={formStatus}
                                    onChange={e => setFormStatus(e.target.value)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <option value="offline">Offline</option>
                                    <option value="online">Online</option>
                                </select>
                            </div>

                            {formError && (
                                <div style={{
                                    background: 'rgba(239,68,68,0.1)',
                                    border: '1px solid rgba(239,68,68,0.3)',
                                    borderRadius: 'var(--radius)',
                                    padding: '10px 14px',
                                    fontSize: 12,
                                    color: 'var(--red)',
                                    fontFamily: 'var(--font-mono)',
                                }}>
                                    {formError}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                                <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{ opacity: saving ? 0.7 : 1 }}
                                >
                                    {saving
                                        ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Saving...</>
                                        : editingDevice ? 'Update Device' : 'Add Device'
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirmation Modal ─────────────────────────────── */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <div style={{ textAlign: 'center', padding: '8px 0' }}>
                            <div style={{
                                width: 52, height: 52,
                                borderRadius: 14,
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                margin: '0 auto 16px',
                            }}>
                                <Trash2 size={22} color="var(--red)" />
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                                Delete Device
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                                Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
                                <br />
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    This action cannot be undone. Associated events may be affected.
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    style={{
                                        background: 'var(--red)',
                                        color: '#fff',
                                        opacity: deleting ? 0.7 : 1,
                                    }}
                                >
                                    {deleting
                                        ? <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Deleting...</>
                                        : <><Trash2 size={13} /> Delete</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
