import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../authContext'
import {
    Shield, Home, Baby, Dog, Building2, Package, Wrench,
    Users, UserRound, UsersRound, Mail,
    Volume2, Mic, Lightbulb, Bell,
    ChevronRight, ChevronLeft, Check, ArrowRight
} from 'lucide-react'

const USE_CASES = [
    { id: 'home_security',  icon: Home,      label: 'Home Security',           desc: 'Protect your home from intruders' },
    { id: 'child_monitor',  icon: Baby,      label: 'Child Monitoring',        desc: 'Keep an eye on your kids' },
    { id: 'pet_watching',   icon: Dog,       label: 'Pet Watching',            desc: 'Watch over your pets while away' },
    { id: 'office_camera',  icon: Building2, label: 'Office / Room Camera',    desc: 'Monitor rooms or workspaces' },
    { id: 'package_watch',  icon: Package,   label: 'Package & Delivery',      desc: 'Watch for deliveries at your door' },
    { id: 'custom',         icon: Wrench,    label: 'Custom / Other',          desc: 'Something else entirely' },
]

const ACCESS_OPTIONS = [
    { id: 'only_me',   icon: UserRound,  label: 'Only me',               desc: 'No one else can view cameras' },
    { id: 'family',    icon: UsersRound, label: 'Me and my family',      desc: 'Share access with family members' },
    { id: 'team',      icon: Users,      label: 'My whole team',         desc: 'Everyone in the organization' },
    { id: 'custom',    icon: Mail,       label: 'Specific people',       desc: 'Choose exactly who can view' },
]

const DEVICE_FEATURES = [
    { id: 'buzzer_enabled', icon: Volume2,  label: 'Buzzer / Speaker',    desc: 'Alert pets or intruders that they are being watched' },
    { id: 'mic_enabled',    icon: Mic,      label: 'Microphone',          desc: 'Listen to audio from the camera feed' },
    { id: 'led_enabled',    icon: Lightbulb,label: 'LED Indicator',       desc: 'Show a light when the camera is active' },
    { id: 'alert_enabled',  icon: Bell,     label: 'Motion Alerts',       desc: 'Get notified when motion is detected' },
]

export default function OnboardingPage() {
    const { session } = useAuth()
    const navigate = useNavigate()
    const [step, setStep] = useState(0)
    const [saving, setSaving] = useState(false)

    // Step 1 state
    const [selectedUseCases, setSelectedUseCases] = useState([])

    // Step 2 state
    const [accessLevel, setAccessLevel] = useState('only_me')
    const [customEmails, setCustomEmails] = useState('')

    // Step 3 state
    const [features, setFeatures] = useState({
        buzzer_enabled: false,
        mic_enabled: false,
        led_enabled: true,
        alert_enabled: true,
    })

    function toggleUseCase(id) {
        setSelectedUseCases(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        )
    }

    function toggleFeature(id) {
        setFeatures(prev => ({ ...prev, [id]: !prev[id] }))
    }

    async function finishOnboarding() {
        setSaving(true)
        const emailList = customEmails
            .split(',')
            .map(e => e.trim())
            .filter(e => e.length > 0)

        const { error } = await supabase.from('profiles').update({
            onboarding_complete: true,
            use_case: selectedUseCases,
            camera_access: accessLevel,
            camera_access_emails: emailList,
        }).eq('id', session.user.id)

        if (error) {
            console.error("Onboarding Save Error:", error)
            alert("Failed to save: " + error.message + "\n\nDid you run the SQL migration to add these columns?")
            setSaving(false)
            return
        }

        setSaving(false)
        navigate('/')
    }

    const canProceed = [
        selectedUseCases.length > 0,
        !!accessLevel,
        true, // features always valid
        true, // final step
    ]

    const STEPS = [
        { title: 'Use Case',     number: 1 },
        { title: 'Access',       number: 2 },
        { title: 'Features',     number: 3 },
        { title: 'Ready',        number: 4 },
    ]

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '48px 24px',
        }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
                <div style={{
                    width: 48, height: 48,
                    background: 'var(--brand-50)',
                    border: '1px solid var(--brand-100)',
                    borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                }}>
                    <Shield size={24} color="var(--brand-600)" />
                </div>
                <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    Welcome to NexusShield
                </h1>
                <p style={{ fontSize: 16, color: 'var(--text-tertiary)' }}>
                    Let's set things up. This only takes a minute.
                </p>
            </div>

            {/* Progress Steps */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                marginBottom: 40, width: '100%', maxWidth: 480, justifyContent: 'center',
            }}>
                {STEPS.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 13, fontWeight: 600,
                            background: i < step ? 'var(--brand-600)' : i === step ? 'var(--brand-600)' : 'var(--bg-primary)',
                            color: i <= step ? 'white' : 'var(--text-quaternary)',
                            border: i <= step ? '2px solid var(--brand-600)' : '2px solid var(--border-primary)',
                            transition: 'all 0.2s',
                        }}>
                            {i < step ? <Check size={14} /> : s.number}
                        </div>
                        {i < STEPS.length - 1 && (
                            <div style={{
                                width: 48, height: 2,
                                background: i < step ? 'var(--brand-600)' : 'var(--border-primary)',
                                transition: 'background 0.2s',
                            }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div style={{
                width: '100%', maxWidth: 600,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 16,
                padding: 32,
                boxShadow: 'var(--shadow-sm)',
            }}>

                {/* ── STEP 1: Use Case ── */}
                {step === 0 && (
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                            What will you use NexusShield for?
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
                            Select all that apply. This helps us customize your experience.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                            {USE_CASES.map(uc => {
                                const selected = selectedUseCases.includes(uc.id)
                                const Icon = uc.icon
                                return (
                                    <button
                                        key={uc.id}
                                        onClick={() => toggleUseCase(uc.id)}
                                        style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 12,
                                            padding: 16, borderRadius: 12, cursor: 'pointer',
                                            textAlign: 'left',
                                            background: selected ? 'var(--brand-50)' : 'var(--bg-primary)',
                                            border: `2px solid ${selected ? 'var(--brand-600)' : 'var(--border-primary)'}`,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                            background: selected ? 'var(--brand-100)' : 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Icon size={20} color={selected ? 'var(--brand-600)' : 'var(--text-quaternary)'} />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {uc.label}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                {uc.desc}
                                            </div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* ── STEP 2: Camera Access ── */}
                {step === 1 && (
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                            Who can access your cameras?
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
                            Control who is allowed to view your camera feeds.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {ACCESS_OPTIONS.map(opt => {
                                const selected = accessLevel === opt.id
                                const Icon = opt.icon
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => setAccessLevel(opt.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                                            textAlign: 'left',
                                            background: selected ? 'var(--brand-50)' : 'var(--bg-primary)',
                                            border: `2px solid ${selected ? 'var(--brand-600)' : 'var(--border-primary)'}`,
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                            background: selected ? 'var(--brand-100)' : 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <Icon size={20} color={selected ? 'var(--brand-600)' : 'var(--text-quaternary)'} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {opt.label}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                {opt.desc}
                                            </div>
                                        </div>
                                        <div style={{
                                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                                            border: `2px solid ${selected ? 'var(--brand-600)' : 'var(--border-secondary)'}`,
                                            background: selected ? 'var(--brand-600)' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {selected && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />}
                                        </div>
                                    </button>
                                )
                            })}
                        </div>

                        {accessLevel === 'custom' && (
                            <div style={{ marginTop: 16 }}>
                                <label className="label">Email addresses (comma separated)</label>
                                <textarea
                                    className="input"
                                    value={customEmails}
                                    onChange={e => setCustomEmails(e.target.value)}
                                    placeholder="partner@email.com, friend@email.com"
                                    rows={3}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* ── STEP 3: Device Features ── */}
                {step === 2 && (
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                            Enable device features
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 24 }}>
                            Choose what your cameras can do. You can change these later.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {DEVICE_FEATURES.map((feat, i) => {
                                const Icon = feat.icon
                                const enabled = features[feat.id]
                                return (
                                    <div
                                        key={feat.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '16px 0',
                                            borderBottom: i < DEVICE_FEATURES.length - 1 ? '1px solid var(--border-primary)' : 'none',
                                        }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                            background: enabled ? 'var(--brand-50)' : 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'background 0.15s',
                                        }}>
                                            <Icon size={20} color={enabled ? 'var(--brand-600)' : 'var(--text-quaternary)'} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {feat.label}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>
                                                {feat.desc}
                                            </div>
                                        </div>
                                        <label className="toggle">
                                            <input
                                                type="checkbox"
                                                checked={enabled}
                                                onChange={() => toggleFeature(feat.id)}
                                            />
                                            <span className="toggle-track" />
                                        </label>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* ── STEP 4: All Set ── */}
                {step === 3 && (
                    <div style={{ textAlign: 'center', padding: '24px 0' }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: 'var(--success-50)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 24px',
                        }}>
                            <Check size={32} color="var(--success-600)" />
                        </div>
                        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                            You're all set!
                        </h2>
                        <p style={{ fontSize: 14, color: 'var(--text-tertiary)', marginBottom: 32, maxWidth: 360, margin: '0 auto 32px' }}>
                            Your NexusShield dashboard is ready. You can change any of these settings later.
                        </p>

                        {/* Summary */}
                        <div style={{
                            textAlign: 'left',
                            background: 'var(--bg-secondary)',
                            borderRadius: 12,
                            padding: 20,
                            marginBottom: 32,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-quaternary)', marginBottom: 12, textTransform: 'uppercase' }}>
                                Your setup summary
                            </div>
                            <SummaryRow label="Use case" value={selectedUseCases.map(id => USE_CASES.find(u => u.id === id)?.label).join(', ') || 'None selected'} />
                            <SummaryRow label="Camera access" value={ACCESS_OPTIONS.find(a => a.id === accessLevel)?.label || 'Only me'} />
                            <SummaryRow label="Buzzer" value={features.buzzer_enabled ? 'Enabled' : 'Disabled'} />
                            <SummaryRow label="Microphone" value={features.mic_enabled ? 'Enabled' : 'Disabled'} />
                            <SummaryRow label="LED indicator" value={features.led_enabled ? 'Enabled' : 'Disabled'} />
                            <SummaryRow label="Motion alerts" value={features.alert_enabled ? 'Enabled' : 'Disabled'} last />
                        </div>
                    </div>
                )}

                {/* ── Navigation Buttons ── */}
                <div style={{
                    display: 'flex',
                    justifyContent: step === 0 ? 'flex-end' : 'space-between',
                    marginTop: 32,
                    paddingTop: 20,
                    borderTop: '1px solid var(--border-primary)',
                }}>
                    {step > 0 && (
                        <button className="btn" onClick={() => setStep(s => s - 1)}>
                            <ChevronLeft size={16} /> Back
                        </button>
                    )}
                    {step < 3 ? (
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep(s => s + 1)}
                            disabled={!canProceed[step]}
                        >
                            Continue <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            onClick={finishOnboarding}
                            disabled={saving}
                            style={{ padding: '10px 24px' }}
                        >
                            {saving
                                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Setting up...</>
                                : <>Go to Dashboard <ArrowRight size={16} /></>
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function SummaryRow({ label, value, last }) {
    return (
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 0',
            borderBottom: last ? 'none' : '1px solid var(--border-primary)',
        }}>
            <span style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{value}</span>
        </div>
    )
}
