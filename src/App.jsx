import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import {
  LayoutDashboard, BarChart3, Settings,
  Shield, LogOut, User, Tv2, History,
  HardDrive, ShieldCheck, ChevronDown
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

import { AuthContext, useAuth } from './authContext'
import { ToastProvider } from './toastContext'

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

function Layout({ children }) {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [realtimeOk, setRealtimeOk] = useState(true)
  const [profile, setProfile] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('full_name, role').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setProfile(data))

    const channel = supabase.channel('health')
    channel.subscribe(status => setRealtimeOk(status === 'SUBSCRIBED'))
    return () => supabase.removeChannel(channel)
  }, [session])

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
        <div className="sidebar-logo">
          <div className="brand">
            <Shield size={20} color="var(--brand-600)" />
            NexusShield
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
            style={{ marginBottom: 12 }}
          >
            <Settings size={20} className="icon" />
            Settings
          </NavLink>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 12px 4px',
            borderTop: '1px solid var(--border-primary)',
            marginTop: 4,
            paddingTop: 16,
          }}>
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {profile?.full_name || session?.user?.email?.split('@')[0]}
              </div>
              <div style={{
                fontSize: 14, color: 'var(--text-tertiary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {session?.user?.email}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-quaternary)', padding: 4,
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-quaternary)'}
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
            <NotificationBell />
            <div className="connection-badge" style={
              realtimeOk
                ? { background: 'var(--success-50)', color: 'var(--success-700)' }
                : { background: 'var(--bg-tertiary)', color: 'var(--text-quaternary)' }
            }>
              <div className={`connection-dot${realtimeOk ? '' : ' offline'}`} />
              <span className="connection-label">{realtimeOk ? 'Connected' : 'Disconnected'}</span>
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
  )
}