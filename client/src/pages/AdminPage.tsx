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
  MessageSquare,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Star,
  CheckCircle,
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
  const [toast, setToast] = useState('')

  // FAQ form
  const [faqQ, setFaqQ] = useState('')
  const [faqA, setFaqA] = useState('')
  const [faqLoading, setFaqLoading] = useState(false)

  // Upload
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  async function loadSources() {
    setLoading(true)
    try { setSources(await getKnowledgeSources()) } catch { showToast('Failed to load sources') }
    setLoading(false)
  }

  async function loadChunks() {
    setLoading(true)
    try { setChunks(await getKnowledgeChunks()) } catch { showToast('Failed to load chunks') }
    setLoading(false)
  }

  async function loadFeedback(filter: FeedbackFilter = feedbackFilter) {
    setLoading(true)
    try { setFeedbackList(await getFeedback(filter)) } catch { showToast('Failed to load feedback') }
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
    } catch { showToast('Failed to delete') }
  }

  async function handleDeleteChunk(id: string) {
    if (!confirm('Delete this chunk?')) return
    try {
      await deleteChunk(id)
      setChunks((prev) => prev.filter((c) => c.id !== id))
      showToast('Chunk deleted')
    } catch { showToast('Failed to delete') }
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
    } catch (err) {
      showToast((err as Error).message)
    }
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
    } catch (err) {
      showToast((err as Error).message)
    }
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
      showToast('Added to knowledge base! Future similar questions will use this answer.')
    } catch (err) {
      showToast((err as Error).message)
    }
    setPromotingId(null)
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'sources', label: 'Sources', icon: <FileText size={15} /> },
    { id: 'chunks', label: 'Chunks', icon: <MessageSquare size={15} /> },
    { id: 'faq', label: 'Add FAQ', icon: <Plus size={15} /> },
    { id: 'upload', label: 'Upload', icon: <Upload size={15} /> },
    { id: 'feedback', label: 'Feedback', icon: <Star size={15} /> },
  ]

  const feedbackFilters: { id: FeedbackFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'good', label: '👍 Good' },
    { id: 'bad', label: '👎 Bad' },
    { id: 'unpromoted', label: 'Not yet promoted' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <ArrowLeft size={16} />
          Back to chat
        </button>
        <span className="text-gray-300">/</span>
        <h1 className="font-semibold text-gray-900">Knowledge Base</h1>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-white border border-gray-200 p-1 mb-6 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Sources tab */}
        {tab === 'sources' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Uploaded Sources ({sources.length})</h2>
              <button onClick={loadSources} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            {sources.length === 0 && !loading && (
              <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400">
                No knowledge sources yet. Upload a .txt file or add FAQ entries.
              </p>
            )}
            {sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl bg-white border border-gray-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {s.type.toUpperCase()} · {s.chunk_count} chunks · {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteSource(s.id, s.name)}
                  className="text-gray-400 hover:text-red-500 transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Chunks tab */}
        {tab === 'chunks' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Knowledge Chunks ({chunks.length})</h2>
              <button onClick={loadChunks} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
            {chunks.map((c) => (
              <div key={c.id} className="rounded-xl bg-white border border-gray-200 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-primary truncate">{c.title ?? c.source_name}</p>
                    <p className="mt-1 text-sm text-gray-700 line-clamp-3 leading-relaxed">{c.content}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteChunk(c.id)}
                    className="flex-shrink-0 text-gray-400 hover:text-red-500 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* FAQ tab */}
        {tab === 'faq' && (
          <div className="max-w-xl">
            <h2 className="font-semibold text-gray-800 mb-4">Add FAQ Entry</h2>
            <p className="text-sm text-gray-500 mb-6">
              Type a question Kishor commonly gets and the ideal answer. This gets added directly to the knowledge base.
            </p>
            <form onSubmit={handleAddFAQ} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                <input
                  type="text"
                  value={faqQ}
                  onChange={(e) => setFaqQ(e.target.value)}
                  placeholder="e.g. What does C&T do for Healthcare clients?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
                <textarea
                  value={faqA}
                  onChange={(e) => setFaqA(e.target.value)}
                  rows={6}
                  placeholder="Write the answer as Kishor would explain it..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={faqLoading || !faqQ.trim() || !faqA.trim()}
                className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {faqLoading ? 'Adding...' : 'Add to Knowledge Base'}
              </button>
            </form>
          </div>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div className="max-w-xl">
            <h2 className="font-semibold text-gray-800 mb-4">Upload Document</h2>
            <p className="text-sm text-gray-500 mb-2">
              Upload a <strong>.txt</strong> file to add it to the knowledge base. The document will be chunked and embedded automatically.
            </p>
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
              For <strong>PDF</strong> and <strong>DOCX</strong> files, use the Python ingestion script:<br />
              <code className="font-mono text-xs">python scripts/ingest.py --file path/to/doc.pdf</code>
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-12 text-center hover:border-primary hover:bg-primary/5 transition"
            >
              <Upload size={24} className="mb-2 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">Click to select a .txt file</p>
              <p className="text-xs text-gray-400 mt-1">Max 20 MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={handleUpload}
            />
            {uploadLoading && (
              <p className="mt-3 text-sm text-primary animate-pulse">Ingesting document...</p>
            )}
          </div>
        )}

        {/* Feedback tab */}
        {tab === 'feedback' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-800">
                User Feedback
                {feedbackList.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({feedbackList.length} entries)</span>
                )}
              </h2>
              <button onClick={() => loadFeedback()} className="text-gray-400 hover:text-gray-600">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
              {feedbackFilters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFeedbackFilter(f.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    feedbackFilter === f.id
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Empty state */}
            {feedbackList.length === 0 && !loading && (
              <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-400">
                {feedbackFilter === 'unpromoted'
                  ? 'No good responses waiting for promotion yet.'
                  : 'No feedback collected yet. Users can rate responses with thumbs up/down in the chat.'}
              </p>
            )}

            {/* Feedback entries */}
            {feedbackList.map((fb) => (
              <div
                key={fb.id}
                className={`rounded-xl bg-white border px-5 py-4 space-y-3 ${
                  fb.promotedToKb ? 'border-green-200 bg-green-50/30' : 'border-gray-200'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {fb.rating === 'good' ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <ThumbsUp size={11} /> Good
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                        <ThumbsDown size={11} /> Bad
                      </span>
                    )}
                    {fb.promotedToKb && (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircle size={11} /> In KB
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {fb.userEmail} · {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Question */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Question</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{fb.question}</p>
                </div>

                {/* Answer preview */}
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Answer</p>
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">{fb.answer}</p>
                </div>

                {/* Sources */}
                {fb.sources && fb.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {fb.sources.map((s, i) => (
                      <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        {s.name} ({s.similarity}%)
                      </span>
                    ))}
                  </div>
                )}

                {/* Optional comment */}
                {fb.comment && (
                  <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">
                    "{fb.comment}"
                  </p>
                )}

                {/* Add to KB button */}
                {!fb.promotedToKb && fb.rating === 'good' && (
                  <button
                    onClick={() => handlePromote(fb.id)}
                    disabled={promotingId === fb.id}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {promotingId === fb.id ? 'Adding to KB...' : 'Add to Knowledge Base'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-900 px-5 py-3 text-sm text-white shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
