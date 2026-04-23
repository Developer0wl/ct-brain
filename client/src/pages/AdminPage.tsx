import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getKnowledgeSources,
  getKnowledgeChunks,
  addFAQ,
  uploadFile,
  deleteSource,
  deleteChunk,
  getFeedback,
  promoteFeedback,
} from '../lib/api'
import {
  ArrowLeft,
  Trash2,
  Upload,
  Plus,
  FileText,
  Layers,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  CheckCircle2,
  Sparkles,
} from 'lucide-react'

interface Source { id: string; name: string; type: string; chunk_count: number; created_at: string }
interface Chunk { id: string; source_name: string; source_type: string; title: string; content: string; created_at: string }
interface FeedbackEntry {
  id: string
  rating: 'good' | 'bad'
  comment?: string
  promotedToKb: boolean
  createdAt: string
  userEmail: string
  question: string
  answer: string
  sources: Array<{ name: string; similarity: number }>
  messageId: string
  conversationId: string
}

type Tab = 'sources' | 'chunks' | 'faq' | 'upload' | 'feedback'
type FeedbackFilter = 'all' | 'good' | 'bad' | 'unpromoted'

export default function AdminPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('sources')
  const [sources, setSources] = useState<Source[]>([])
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [feedbackList, setFeedbackList] = useState<FeedbackEntry[]>([])
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [loading, setLoading] = useState(false)
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const [faqQ, setFaqQ] = useState('')
  const [faqA, setFaqA] = useState('')
  const [faqLoading, setFaqLoading] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  async function loadSources() {
    setLoading(true)
    try { setSources(await getKnowledgeSources()) } catch { showToast('Failed to load sources', 'error') }
    setLoading(false)
  }

  async function loadChunks() {
    setLoading(true)
    try { setChunks(await getKnowledgeChunks()) } catch { showToast('Failed to load chunks', 'error') }
    setLoading(false)
  }

  async function loadFeedback(filter: FeedbackFilter = feedbackFilter) {
    setLoading(true)
    try { setFeedbackList(await getFeedback(filter)) } catch { showToast('Failed to load feedback', 'error') }
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'sources') loadSources()
    if (tab === 'chunks') loadChunks()
    if (tab === 'feedback') loadFeedback()
  }, [tab])

  useEffect(() => {
    if (tab === 'feedback') loadFeedback(feedbackFilter)
  }, [feedbackFilter])

  async function handleDeleteSource(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its chunks?`)) return
    try {
      await deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
      showToast('Source deleted')
    } catch { showToast('Failed to delete', 'error') }
  }

  async function handleDeleteChunk(id: string) {
    if (!confirm('Delete this chunk?')) return
    try {
      await deleteChunk(id)
      setChunks((prev) => prev.filter((c) => c.id !== id))
      showToast('Chunk deleted')
    } catch { showToast('Failed to delete', 'error') }
  }

  async function handleAddFAQ(e: React.FormEvent) {
    e.preventDefault()
    if (!faqQ.trim() || !faqA.trim()) return
    setFaqLoading(true)
    try {
      await addFAQ(faqQ, faqA)
      setFaqQ('')
      setFaqA('')
      showToast('FAQ added to knowledge base')
    } catch (err) { showToast((err as Error).message, 'error') }
    setFaqLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadLoading(true)
    try {
      const result = await uploadFile(file)
      showToast(`Ingested ${result.chunks} chunks from ${result.source}`)
      loadSources()
    } catch (err) { showToast((err as Error).message, 'error') }
    setUploadLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handlePromote(feedbackId: string) {
    setPromotingId(feedbackId)
    try {
      await promoteFeedback(feedbackId)
      setFeedbackList((prev) =>
        prev.map((f) => f.id === feedbackId ? { ...f, promotedToKb: true } : f)
      )
      showToast('Added to knowledge base successfully')
    } catch (err) { showToast((err as Error).message, 'error') }
    setPromotingId(null)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'sources', label: 'Sources', icon: <FileText size={14} />, count: sources.length || undefined },
    { id: 'chunks', label: 'Chunks', icon: <Layers size={14} />, count: chunks.length || undefined },
    { id: 'faq', label: 'Add FAQ', icon: <Plus size={14} /> },
    { id: 'upload', label: 'Upload', icon: <Upload size={14} /> },
    { id: 'feedback', label: 'Feedback', icon: <MessageSquare size={14} />, count: feedbackList.filter(f => !f.promotedToKb && f.rating === 'good').length || undefined },
  ]

  const feedbackFilters: { id: FeedbackFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'good', label: '👍 Good' },
    { id: 'bad', label: '👎 Bad' },
    { id: 'unpromoted', label: 'Pending' },
  ]

  const typeColors: Record<string, string> = {
    pdf: 'bg-red-50 text-red-600 border-red-200',
    docx: 'bg-blue-50 text-blue-600 border-blue-200',
    txt: 'bg-gray-50 text-gray-600 border-gray-200',
    faq: 'bg-purple-50 text-purple-600 border-purple-200',
    conversation: 'bg-green-50 text-green-600 border-green-200',
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* Sidebar */}
      <aside className="flex w-56 flex-shrink-0 flex-col bg-sidebar-bg">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0">CT</div>
          <div className="min-w-0">
            <p className="text-sidebar-fg-active text-sm font-semibold leading-tight">C&T Brain</p>
            <p className="text-sidebar-fg text-xs leading-tight">Knowledge Base</p>
          </div>
        </div>

        <div className="mx-4 border-t border-white/10 mb-3" />

        <nav className="flex-1 px-3 space-y-0.5">
          <button
            onClick={() => navigate('/')}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-fg hover:text-sidebar-fg-active hover:bg-sidebar-hover transition-colors"
          >
            <ArrowLeft size={14} />
            Back to chat
          </button>
          <div className="pt-2 pb-1 px-3">
            <p className="text-xs font-medium text-sidebar-fg/50 uppercase tracking-wider">Manage</p>
          </div>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                tab === t.id
                  ? 'text-sidebar-fg-active bg-sidebar-hover'
                  : 'text-sidebar-fg hover:text-sidebar-fg-active hover:bg-sidebar-hover'
              }`}
            >
              <span className="flex items-center gap-2">
                {t.icon}
                {t.label}
              </span>
              {t.count !== undefined && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs text-sidebar-fg">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3 flex-shrink-0">
          <div>
            <h1 className="text-sm font-semibold text-foreground capitalize">
              {tab === 'faq' ? 'Add FAQ' : tab === 'feedback' ? 'User Feedback' : tab}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tab === 'sources' && 'Documents ingested into the knowledge base'}
              {tab === 'chunks' && 'Individual text chunks with embeddings'}
              {tab === 'faq' && 'Add a question and answer directly'}
              {tab === 'upload' && 'Upload a .txt file to ingest'}
              {tab === 'feedback' && 'User ratings — promote good answers to the knowledge base'}
            </p>
          </div>
          {(tab === 'sources' || tab === 'chunks' || tab === 'feedback') && (
            <button
              onClick={() => tab === 'sources' ? loadSources() : tab === 'chunks' ? loadChunks() : loadFeedback()}
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto chat-scroll p-6">
          <div className="mx-auto max-w-3xl">

            {/* Sources */}
            {tab === 'sources' && (
              <div className="space-y-2">
                {sources.length === 0 && !loading && (
                  <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                    <FileText size={24} className="mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No sources yet. Upload files or add FAQ entries.</p>
                  </div>
                )}
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/30 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <FileText size={15} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${typeColors[s.type] ?? typeColors.txt}`}>
                            {s.type.toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground">{s.chunk_count} chunks</span>
                          <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSource(s.id, s.name)}
                      className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Chunks */}
            {tab === 'chunks' && (
              <div className="space-y-2">
                {chunks.map((c) => (
                  <div key={c.id} className="rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/30 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${typeColors[c.source_type] ?? typeColors.txt}`}>
                            {c.source_type.toUpperCase()}
                          </span>
                          <p className="text-xs font-medium text-primary truncate">{c.title ?? c.source_name}</p>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{c.content}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteChunk(c.id)}
                        className="flex-shrink-0 rounded-lg p-1.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add FAQ */}
            {tab === 'faq' && (
              <div className="max-w-xl">
                <p className="text-sm text-muted-foreground mb-6">
                  Add a question Kishor commonly gets asked along with the ideal answer. It will be embedded and immediately searchable.
                </p>
                <form onSubmit={handleAddFAQ} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Question</label>
                    <input
                      type="text"
                      value={faqQ}
                      onChange={(e) => setFaqQ(e.target.value)}
                      placeholder="e.g. What does C&T do for Healthcare clients?"
                      className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Answer</label>
                    <textarea
                      value={faqA}
                      onChange={(e) => setFaqA(e.target.value)}
                      rows={7}
                      placeholder="Write the answer as Kishor would explain it..."
                      className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-3 focus:ring-primary/15 transition-all resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={faqLoading || !faqQ.trim() || !faqA.trim()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-40 transition-all shadow-sm"
                  >
                    <Sparkles size={14} />
                    {faqLoading ? 'Adding...' : 'Add to Knowledge Base'}
                  </button>
                </form>
              </div>
            )}

            {/* Upload */}
            {tab === 'upload' && (
              <div className="max-w-xl">
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <strong>PDF & DOCX</strong> files require the Python CLI script:<br />
                  <code className="mt-1 block font-mono text-xs bg-amber-100 px-2 py-1 rounded mt-1">
                    python scripts/ingest.py --file path/to/doc.pdf
                  </code>
                </div>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border py-14 text-center hover:border-primary/60 hover:bg-primary/5 transition-all"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                    <Upload size={20} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Click to upload a .txt file</p>
                  <p className="text-xs text-muted-foreground mt-1">Maximum 20 MB</p>
                </div>
                <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={handleUpload} />
                {uploadLoading && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-primary">
                    <RefreshCw size={13} className="animate-spin" />
                    Ingesting document...
                  </p>
                )}
              </div>
            )}

            {/* Feedback */}
            {tab === 'feedback' && (
              <div className="space-y-4">
                {/* Filter pills */}
                <div className="flex gap-1.5">
                  {feedbackFilters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFeedbackFilter(f.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                        feedbackFilter === f.id
                          ? 'bg-primary text-white shadow-sm'
                          : 'border border-border bg-surface text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {feedbackList.length === 0 && !loading && (
                  <div className="rounded-2xl border border-dashed border-border py-16 text-center">
                    <MessageSquare size={24} className="mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">
                      {feedbackFilter === 'unpromoted'
                        ? 'No good responses waiting for promotion.'
                        : 'No feedback yet. Users rate responses with thumbs up/down in chat.'}
                    </p>
                  </div>
                )}

                {feedbackList.map((fb) => (
                  <div
                    key={fb.id}
                    className={`rounded-2xl border px-5 py-4 space-y-3 transition-colors ${
                      fb.promotedToKb
                        ? 'border-success/30 bg-success/5'
                        : 'border-border bg-surface'
                    }`}
                  >
                    {/* Meta row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {fb.rating === 'good' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                            <ThumbsUp size={10} /> Good
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
                            <ThumbsDown size={10} /> Bad
                          </span>
                        )}
                        {fb.promotedToKb && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                            <CheckCircle2 size={10} /> In KB
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {fb.userEmail} · {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Q & A */}
                    <div className="space-y-2">
                      <div className="rounded-lg bg-muted/60 px-3 py-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Question</p>
                        <p className="text-sm text-foreground leading-relaxed">{fb.question}</p>
                      </div>
                      <div className="rounded-lg bg-surface border border-border px-3 py-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Answer</p>
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{fb.answer}</p>
                      </div>
                    </div>

                    {/* Sources */}
                    {fb.sources?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {fb.sources.map((s, i) => (
                          <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                            {s.name} ({s.similarity}%)
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Comment */}
                    {fb.comment && (
                      <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                        "{fb.comment}"
                      </p>
                    )}

                    {/* Promote button */}
                    {!fb.promotedToKb && fb.rating === 'good' && (
                      <button
                        onClick={() => handlePromote(fb.id)}
                        disabled={promotingId === fb.id}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
                      >
                        <Sparkles size={12} />
                        {promotingId === fb.id ? 'Adding...' : 'Add to Knowledge Base'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium text-white shadow-xl z-50 animate-fade-in ${
          toast.type === 'error' ? 'bg-destructive' : 'bg-gray-900'
        }`}>
          {toast.type === 'success' && <CheckCircle2 size={15} className="text-success flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
