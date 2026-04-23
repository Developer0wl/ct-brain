import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-[420px] flex-shrink-0 flex-col justify-between bg-sidebar-bg px-10 py-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white text-sm font-bold">
            CT
          </div>
          <span className="text-sidebar-fg-active font-semibold text-base">C&T Brain</span>
        </div>

        <div>
          <blockquote className="text-sidebar-fg text-lg font-light leading-relaxed mb-8">
            "The institutional knowledge that used to live only in Kishor's head — now available to the whole team, instantly."
          </blockquote>
          <div className="space-y-3">
            {[
              'Answers grounded in real C&T documents',
              'Self-improving — gets smarter with every conversation',
              'Powered by Google Gemini + pgvector RAG',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2.5">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                <p className="text-sidebar-fg text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sidebar-fg/50 text-xs">Cloud and Things · Troy, NY</p>
      </div>

      {/* Right panel — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white text-sm font-bold">
              CT
            </div>
            <span className="font-semibold text-lg text-foreground">C&T Brain</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-1">Welcome back</h2>
          <p className="text-sm text-muted-foreground mb-8">Sign in to access the knowledge base</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 transition-all"
                placeholder="you@cloudandthings.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground/70">
            Invite-only · Contact your admin to request access
          </p>
        </div>
      </div>
    </div>
  )
}
