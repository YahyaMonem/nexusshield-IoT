import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Shield, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    const handleLogin = async () => {
        if (!email || !password) { setError('Please fill in all fields'); return }
        setLoading(true)
        setError(null)

        const { error: err } = await supabase.auth.signInWithPassword({ email, password })
        if (err) {
            setError(err.message)
            setLoading(false)
        } else {
            navigate('/')
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: '#ffffff',
            display: 'flex',
        }}>
            {/* Left — Form */}
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 24px',
            }}>
                <div style={{ width: '100%', maxWidth: 360 }}>
                    {/* Logo */}
                    <div style={{ marginBottom: 32 }}>
                        <div style={{
                            width: 48, height: 48,
                            background: 'var(--brand-50)',
                            border: '1px solid var(--brand-100)',
                            borderRadius: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 24,
                        }}>
                            <Shield size={24} color="var(--brand-600)" />
                        </div>
                        <h1 style={{
                            fontSize: 24,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: 8,
                            letterSpacing: '-0.02em',
                        }}>
                            Log in to your account
                        </h1>
                        <p style={{
                            fontSize: 16,
                            color: 'var(--text-tertiary)',
                            lineHeight: 1.5,
                        }}>
                            Welcome back! Please enter your details.
                        </p>
                    </div>

                    {/* Form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div>
                            <label className="label">Email</label>
                            <input
                                className="input"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                            />
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    type={showPw ? 'text' : 'password'}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                    style={{ paddingRight: 42 }}
                                />
                                <button
                                    onClick={() => setShowPw(p => !p)}
                                    type="button"
                                    style={{
                                        position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-quaternary)', padding: 0, display: 'flex',
                                    }}
                                >
                                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div style={{
                                background: 'var(--error-50)',
                                border: '1px solid rgba(240, 68, 56, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                padding: '12px 14px',
                                fontSize: 14,
                                color: 'var(--error-700)',
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            className="btn btn-primary"
                            onClick={handleLogin}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '10px 18px',
                                fontSize: 16,
                                marginTop: 4,
                            }}
                        >
                            {loading
                                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Signing in...</>
                                : 'Sign in'
                            }
                        </button>
                    </div>

                    <p style={{
                        marginTop: 32,
                        textAlign: 'center',
                        fontSize: 14,
                        color: 'var(--text-quaternary)',
                    }}>
                        Don't have an account?{' '}
                        <span style={{ color: 'var(--brand-600)', fontWeight: 600, cursor: 'pointer' }}>
                            Contact your admin
                        </span>
                    </p>
                </div>
            </div>

            {/* Right — Branding panel (hidden on mobile) */}
            <div style={{
                width: '50%',
                background: 'linear-gradient(135deg, var(--brand-50) 0%, #ede9fe 50%, var(--brand-100) 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 64,
                borderLeft: '1px solid var(--border-primary)',
            }}
                className="login-branding"
            >
                <div style={{
                    width: 80, height: 80,
                    background: 'var(--brand-600)',
                    borderRadius: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 32,
                    boxShadow: '0 8px 32px rgba(105, 65, 198, 0.25)',
                }}>
                    <Shield size={40} color="white" />
                </div>
                <h2 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    marginBottom: 12,
                    letterSpacing: '-0.02em',
                }}>
                    NexusShield
                </h2>
                <p style={{
                    fontSize: 16,
                    color: 'var(--text-tertiary)',
                    textAlign: 'center',
                    maxWidth: 320,
                    lineHeight: 1.6,
                }}>
                    IoT security monitoring and device management for modern teams.
                </p>
            </div>
        </div>
    )
}