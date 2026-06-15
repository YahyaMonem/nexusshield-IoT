import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import {
  LayoutDashboard, BarChart3, Settings,
  Shield, LogOut, Tv2, History,
  HardDrive, ShieldCheck, Download
} from 'lucide-react'

import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import LiveFeedPage from './pages/LiveFeedPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import DeviceManagementPage from './pages/DeviceManagementPage'
import UserManagementPage from './pages/UserManagementPage'
import NotificationBell from './components/NotificationBell'
import { sendSecurityAlertEmail } from './alertEmail'

import { AuthContext, useAuth } from './authContext'
import { ToastProvider, useToast } from './toastContext'
import { ThemeProvider } from './themeContext'

function DownloadAppDropdown() {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const { addToast } = useToast()

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDownload = (os, fileUrl) => {
    setOpen(false)
    addToast({
      type: 'success',
      title: 'Download Started',
      message: `Downloading NexusShield for ${os}...`,
    })
    
    // Trigger actual download securely
    window.location.assign(fileUrl)
  }

  return (
    <div ref={dropdownRef} className="download-menu">
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-secondary download-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={14} />
        <span className="desktop-download-label">Desktop App</span>
      </button>

      {open && (
        <div className="download-menu-panel" role="menu">
          <button 
            onClick={() => handleDownload('macOS', 'https://github.com/yahyabamo/nexusshield-dashboard2/releases/download/v1.0.0/NexusShield-1.0.0-arm64.dmg')}
            className="download-menu-item"
            role="menuitem"
          >
            Download for macOS (Apple Silicon)
          </button>
          <button 
            onClick={() => handleDownload('Windows', '/NexusShield-Windows-x64.exe')}
            className="download-menu-item"
            role="menuitem"
          >
            Download for Windows
          </button>
        </div>
      )}
    </div>
  )
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, flexDirection: 'column' }}>
        <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        <span style={{ fontSize: 14, color: 'var(--text-quaternary)' }}>Loading...</span>
      </div>
    )
  }

  return <AuthContext.Provider value={{ session }}>{children}</AuthContext.Provider>
}

function Protected({ children }) {
  const { session } = useAuth()
  return session ? children : <Navigate to="/login" replace />
}

/* ── Onboarding gate ── */
function OnboardingGate({ children }) {
  const { session } = useAuth()
  const [checked, setChecked] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('onboarding_complete').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        setNeedsOnboarding(!data?.onboarding_complete)
        setChecked(true)
      })
  }, [session])

  if (!checked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12, flexDirection: 'column' }}>
        <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
      </div>
    )
  }

  if (needsOnboarding) {
    return <OnboardingPage />
  }

  return children
}

/* ── Navigation ── */
const MAIN_NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/history',   icon: History,         label: 'Event History' },
  { to: '/live',      icon: Tv2,             label: 'Live Feed' },
  { to: '/analytics', icon: BarChart3,       label: 'Analytics' },
]

const MANAGE_NAV = [
  { to: '/devices',      icon: HardDrive,   label: 'Devices' },
  { to: '/access',       icon: ShieldCheck,  label: 'Access Control' },
]

const PAGE_TITLES = {
  '/':          'Dashboard',
  '/history':   'Event History',
  '/live':      'Live Feed',
  '/analytics': 'Analytics',
  '/devices':   'Devices',
  '/access':    'Access Control',
  '/settings':  'Settings',
}

const EMAIL_ALERT_EVENTS = new Set([
  'door',
  'person_detected',
  'dog_detected',
  'cat_detected',
  'unknown_face_detected',
  'child_awake',
  'child_movement',
])

function buildSecurityEmailPayload(event) {
  const deviceName = event.devices?.name || 'Unknown device'

  switch (event.event_type) {
    case 'door':
      return {
        alertTitle: 'Door opened',
        alertMessage: `Door opened on ${deviceName}`,
        alertType: 'door',
        objectClass: 'Door',
        details: 'Door sensor reported an open event.',
      }
    case 'person_detected':
      return {
        alertTitle: 'Person detected',
        alertMessage: `Person detected on ${deviceName}`,
        alertType: 'person',
        objectClass: 'Person',
        details: 'Human presence detected by the edge device.',
      }
    case 'dog_detected':
    case 'cat_detected': {
      const animal = event.event_type === 'dog_detected' ? 'Dog' : 'Cat'
      return {
        alertTitle: `${animal} detected`,
        alertMessage: `${animal} detected on ${deviceName}`,
        alertType: 'pet',
        objectClass: animal,
        details: 'Pet movement detected by the edge device.',
      }
    }
    case 'unknown_face_detected':
      return {
        alertTitle: 'Unknown face detected',
        alertMessage: `Unknown face detected on ${deviceName}`,
        alertType: 'unknown_face',
        objectClass: 'Unknown Face',
        details: 'Face recognition did not match a trusted person.',
      }
    case 'child_awake':
      return {
        alertTitle: 'Child awake',
        alertMessage: `Child awake detected on ${deviceName}`,
        alertType: 'child_monitor',
        objectClass: 'Child',
        details: 'Child monitoring rule detected waking or sustained movement.',
      }
    case 'child_movement':
      return {
        alertTitle: 'Child movement detected',
        alertMessage: `Child movement detected on ${deviceName}`,
        alertType: 'child_monitor',
        objectClass: 'Child',
        details: 'Child monitoring rule detected movement.',
      }
    default:
      return {
        alertTitle: 'Security Alert',
        alertMessage: `Security event detected on ${deviceName}`,
        alertType: 'security',
        objectClass: 'Unknown',
        details: 'Security event reported by the edge device.',
      }
  }
}

function Layout({ children }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [realtimeOk, setRealtimeOk] = useState(true)
  const [profile, setProfile] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const emailedEventIdsRef = useRef(new Set())

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('full_name, role, email_notifications').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data))

    const channel = supabase.channel('health')
    channel.subscribe(status => setRealtimeOk(status === 'SUBSCRIBED'))
    return () => supabase.removeChannel(channel)
  }, [session])

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel('global-alert-emails')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'events',
      }, async (payload) => {
        if (profile?.email_notifications === false) return
        if (emailedEventIdsRef.current.has(payload.new.id)) return

        const { data: event } = await supabase
          .from('events')
          .select('id, event_type, severity, created_at, devices(name)')
          .eq('id', payload.new.id)
          .single()

        if (!event || !EMAIL_ALERT_EVENTS.has(event.event_type)) return

        emailedEventIdsRef.current.add(event.id)
        if (emailedEventIdsRef.current.size > 1000) emailedEventIdsRef.current.clear()
        const emailPayload = buildSecurityEmailPayload(event)

        sendSecurityAlertEmail({
          ...emailPayload,
          eventType: event.event_type,
          deviceName: event.devices?.name || 'Unknown device',
          severity: event.severity,
          time: new Date(event.created_at).toLocaleString(),
        }).then(
          () => console.log('SUCCESS: Security alert email sent'),
          (error) => console.log('FAILED to send security alert email', error)
        )
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session, profile?.email_notifications])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const userInitial = (profile?.full_name || session?.user?.email || 'U')[0].toUpperCase()

  return (
    <div className="layout">
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div 
          className="sidebar-logo" 
          onClick={() => navigate('/')} 
          style={{ cursor: 'pointer' }}
          aria-label="Go to dashboard"
        >
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Shield size={22} strokeWidth={2.4} />
            </span>
            <span className="brand-name">BSAFE</span>
          </div>
        </div>

        <nav className="sidebar-nav" onClick={() => setSidebarOpen(false)}>
          {MAIN_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={20} className="icon" />
              {label}
            </NavLink>
          ))}

          <div className="nav-section-label">Management</div>

          {MANAGE_NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={20} className="icon" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Settings size={20} className="icon" />
            Settings
          </NavLink>

          <div className="sidebar-user">
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--brand-50)',
              border: '1px solid var(--border-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 600, color: 'var(--brand-600)',
              flexShrink: 0,
            }}>
              {userInitial}
            </div>
            <div className="sidebar-user-meta">
              <div className="sidebar-user-name">
                {profile?.full_name || session?.user?.email?.split('@')[0]}
              </div>
              <div className="sidebar-user-email">
                {session?.user?.email}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="signout-btn"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="hamburger"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle navigation"
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>
            <h1 className="page-title">{PAGE_TITLES[location.pathname] || 'Dashboard'}</h1>
          </div>
          <div className="topbar-right">
            <DownloadAppDropdown />
            <NotificationBell />
            <div className="connection-badge" style={
              realtimeOk
                ? { background: 'var(--success-50)', color: 'var(--success-700)' }
                : { background: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }
            }>
              <div className={`connection-dot${realtimeOk ? '' : ' offline'}`} />
              <span className="connection-label">{realtimeOk ? 'Cloud Connected' : 'Cloud Offline'}</span>
            </div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={
                <Protected>
                  <OnboardingGate>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/history" element={<HistoryPage />} />
                        <Route path="/live" element={<LiveFeedPage />} />
                        <Route path="/analytics" element={<AnalyticsPage />} />
                        <Route path="/devices" element={<DeviceManagementPage />} />
                        <Route path="/access" element={<UserManagementPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                      </Routes>
                    </Layout>
                  </OnboardingGate>
                </Protected>
              } />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
