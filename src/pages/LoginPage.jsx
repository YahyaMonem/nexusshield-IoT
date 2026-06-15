import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Eye, EyeOff, Shield } from 'lucide-react'

export default function LoginPage() {
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [isSignUp, setIsSignUp] = useState(false)

    const handleAuth = async () => {
        if (!email || !password) { setError('Please fill in all fields'); return }
        setLoading(true)
        setError(null)

        if (isSignUp) {
            const { error: err } = await supabase.auth.signUp({ email, password })
            if (err) {
                setError(err.message)
                setLoading(false)
            } else {
                // If email confirmation is required, you might need to show a message here.
                // Assuming auto-login or simple redirect for now.
                setLoading(false)
                navigate('/')
            }
        } else {
            const { error: err } = await supabase.auth.signInWithPassword({ email, password })
            if (err) {
                setError(err.message)
                setLoading(false)
            } else {
                setLoading(false)
                navigate('/')
            }
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: 'transparent',
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
                        <div 
                            style={{
                                height: 54,
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 12,
                                marginBottom: 24,
                                cursor: 'pointer',
                            }}
                            onClick={() => navigate('/')}
                        >
                            <span className="brand-mark" aria-hidden="true">
                                <Shield size={22} strokeWidth={2.4} />
                            </span>
                            <span className="brand-name" style={{ fontSize: 22, fontWeight: 800 }}>BSAFE</span>
                        </div>
                        <h1 style={{
                            fontSize: 24,
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            marginBottom: 8,
                            letterSpacing: '-0.02em',
                        }}>
                            {isSignUp ? 'Create an account' : 'Log in to your account'}
                        </h1>
                        <p style={{
                            fontSize: 16,
                            color: 'var(--text-tertiary)',
                            lineHeight: 1.5,
                        }}>
                            {isSignUp ? 'Enter your details below to get started.' : 'Welcome back! Please enter your details.'}
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
                                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                            />
                        </div>

                        <div>
                            <label className="label">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="input"
                                    type={showPw ? 'text' : 'password'}
                                    placeholder={isSignUp ? "Create a password" : "Enter your password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
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
                            onClick={handleAuth}
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '10px 18px',
                                fontSize: 16,
                                marginTop: 4,
                            }}
                        >
                            {loading
                                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> {isSignUp ? 'Signing up...' : 'Signing in...'}</>
                                : (isSignUp ? 'Sign up' : 'Sign in')
                            }
                        </button>
                    </div>

                    <p style={{
                        marginTop: 32,
                        textAlign: 'center',
                        fontSize: 14,
                        color: 'var(--text-quaternary)',
                    }}>
                        {isSignUp ? "Already have an account?" : "Don't have an account?"}{' '}
                        <button 
                            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                            style={{ 
                                color: 'var(--brand-600)', 
                                fontWeight: 600, 
                                cursor: 'pointer',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: 'inherit',
                                fontFamily: 'inherit'
                            }}
                        >
                            {isSignUp ? "Log in" : "Sign up"}
                        </button>
                    </p>
                </div>
            </div>

            {/* Right — Branding panel (hidden on mobile) */}
            <div style={{
                width: '50%',
                background: 'linear-gradient(145deg, rgba(255,255,255,0.10), rgba(255,255,255,0.035)), var(--bg-glass)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 64,
                borderLeft: '1px solid var(--border-primary)',
                backdropFilter: 'blur(26px) saturate(130%)',
            }}
                className="login-branding"
            >
                <div style={{
                    width: 82,
                    height: 82,
                    borderRadius: 26,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 32,
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.18), rgba(255,255,255,0.04)), rgba(155,124,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: 'var(--shadow-md)',
                }}>
                    <Shield size={38} strokeWidth={2.2} />
                </div>
                <h2 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    textAlign: 'center',
                    marginBottom: 12,
                    letterSpacing: '-0.02em',
                }}>
                    BSAFE
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
