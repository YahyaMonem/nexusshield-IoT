import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabaseClient'
import { ensureUserProfile } from '../authProfile'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useAuth } from '../authContext'

const AUTH_TIMEOUT_MS = 10000

function promiseWithTimeout(promise, message) {
    let timeoutId
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), AUTH_TIMEOUT_MS)
    })

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

// authFetch removed in favor of standard supabase.auth methods

export default function LoginPage() {
    const navigate = useNavigate()
    const { session } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPw, setShowPw] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [message, setMessage] = useState(null)
    const [isSignUp, setIsSignUp] = useState(false)

    const isMounted = useRef(true)
    useEffect(() => {
        return () => { isMounted.current = false }
    }, [])

    useEffect(() => {
        if (session) {
            navigate('/', { replace: true })
        }
    }, [session, navigate])

    const goToDashboard = async (user) => {
        try {
            await promiseWithTimeout(ensureUserProfile(user), 'Profile check timed out')
            await promiseWithTimeout(
                supabase.from('profiles').update({ onboarding_complete: true }).eq('id', user.id),
                'Profile update timed out'
            )
        } catch (err) {
            console.error('Profile bootstrap failed:', err)
        }

        if (!isMounted.current) return
        setError(null)
        setMessage('Login successful. Opening dashboard...')
        setLoading(false)
        // Navigation handled by the session useEffect
    }

    const handleAuth = async () => {
        if (loading) return
        const normalizedEmail = email.trim().toLowerCase()
        if (!normalizedEmail || !password) { setError('Please fill in all fields'); return }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            setError('Enter a valid email address')
            return
        }
        if (isSignUp && password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }
        setLoading(true)
        setError(null)
        setMessage(null)

        try {
            if (isSignUp) {
                const { data, error: signUpError } = await promiseWithTimeout(
                    supabase.auth.signUp({ email: normalizedEmail, password }),
                    'Sign up timed out. Check your connection and try again.'
                )
                if (!isMounted.current) return
                if (signUpError) throw signUpError

                if (data?.session) {
                    await goToDashboard(data.user)
                    return
                }

                setMessage('Check your email to confirm your account, then log in.')
                setIsSignUp(false)
                setPassword('')
                setLoading(false)
            } else {
                const { data, error: signInError } = await promiseWithTimeout(
                    supabase.auth.signInWithPassword({ email: normalizedEmail, password }),
                    'Sign in timed out. Check your connection and try again.'
                )
                if (!isMounted.current) return
                if (signInError) throw signInError

                await goToDashboard(data.user)
            }
        } catch (err) {
            if (!isMounted.current) return
            setMessage(null)
            setError(err.message || 'Login failed. Please check your email and password.')
            setLoading(false)
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
                            <img src="/logos/nexusshield.png" alt="NexusShield Logo" style={{ maxHeight: '48px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px' }} />
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
                            <label className="label" htmlFor="email">Email</label>
                            <input
                                id="email"
                                className="input"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAuth()}
                            />
                        </div>

                        <div>
                            <label className="label" htmlFor="password">Password</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    id="password"
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
                                    aria-label="Toggle password visibility"
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

                        {message && (
                            <div style={{
                                background: 'var(--success-50)',
                                border: '1px solid rgba(18, 183, 106, 0.2)',
                                borderRadius: 'var(--radius-md)',
                                padding: '12px 14px',
                                fontSize: 14,
                                color: 'var(--success-700)',
                            }}>
                                {message}
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
                            onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
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
                    <img src="/logos/nexusshield.png" alt="NexusShield Logo" style={{ maxHeight: '80px', maxWidth: '100%', objectFit: 'contain', borderRadius: '12px' }} />
                </div>
                <h2 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#ffffff',
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
