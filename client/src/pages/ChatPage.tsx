import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { streamChat, submitFeedback, type ChatMessage } from '../lib/api'
import { LogOut, Settings, RotateCcw, Send, Brain, ThumbsUp, ThumbsDown } from 'lucide-react'

interface Message extends ChatMessage {
  id: string
  sources?: Array<{ name: string; similarity: number }>
  streaming?: boolean
  messageId?: string | null      // DB message ID for feedback
  feedbackState?: 'none' | 'good' | 'bad' | 'submitted'
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [userRole, setUserRole] = useState<string>('member')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()
      setUserRole(profile?.role ?? 'member')
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantId = crypto.randomUUID()
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      feedbackState: 'none',
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput('')
    setIsStreaming(true)

    const history: ChatMessage[] = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    await streamChat(
      history,
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        )
      },
      (result) => {
        // Save conversationId for subsequent messages
        if (result.conversationId) setConversationId(result.conversationId)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  streaming: false,
                  sources: result.sources,
                  messageId: result.messageId,
                  feedbackState: 'none',
                }
              : m
          )
        )
        setIsStreaming(false)
        inputRef.current?.focus()
      },
      (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Sorry, something went wrong: ${err}`, streaming: false }
              : m
          )
        )
        setIsStreaming(false)
      },
      conversationId
    )
  }

  async function handleFeedback(messageLocalId: string, rating: 'good' | 'bad') {
    const msg = messages.find((m) => m.id === messageLocalId)
    if (!msg?.messageId) return

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageLocalId ? { ...m, feedbackState: rating } : m
      )
    )

    try {
      await submitFeedback(msg.messageId, rating)
      // Show "submitted" state after 1.5s
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageLocalId ? { ...m, feedbackState: 'submitted' } : m
          )
        )
      }, 1500)
    } catch (err) {
      console.error('Feedback error:', err)
      // Revert on failure
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageLocalId ? { ...m, feedbackState: 'none' } : m
        )
      )
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  function handleClear() {
    setMessages([])
    setConversationId(null)
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold">
            CT
          </div>
          <span className="font-semibold text-gray-900">C&T Brain</span>
        </div>
        <div className="flex items-center gap-2">
          {userRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              <Settings size={15} />
              Knowledge Base
            </button>
          )}
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition"
          >
            <RotateCcw size={15} />
            Clear
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Brain size={32} className="text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800">Ask C&T Brain anything</h2>
              <p className="mt-2 max-w-sm text-sm text-gray-500">
                Ask about C&T's services, processes, values, how to approach a client situation, or anything you'd normally ask Kishor.
              </p>
              <div className="mt-6 grid gap-2 text-left w-full max-w-sm">
                {[
                  "What are C&T's three core service lines?",
                  'How does C&T approach a digital transformation engagement?',
                  'What is the Enable AI service?',
                  "What are C&T's core values?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => { setInput(suggestion); inputRef.current?.focus() }}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:border-primary hover:text-primary transition"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.content || (msg.streaming && (
                  <span className="flex gap-1">
                    <span className="animate-bounce delay-0 h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span className="animate-bounce delay-100 h-1.5 w-1.5 rounded-full bg-gray-400" />
                    <span className="animate-bounce delay-200 h-1.5 w-1.5 rounded-full bg-gray-400" />
                  </span>
                ))}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-2">
                    <p className="text-xs text-gray-400 mb-1">Sources used:</p>
                    <div className="flex flex-wrap gap-1">
                      {msg.sources.map((s, i) => (
                        <span
                          key={i}
                          className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500"
                        >
                          {s.name} ({s.similarity}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Feedback buttons — shown on assistant messages after streaming */}
              {msg.role === 'assistant' && !msg.streaming && msg.messageId && (
                <div className="mt-1.5 flex items-center gap-1">
                  {msg.feedbackState === 'submitted' ? (
                    <span className="text-xs text-gray-400">Thanks for the feedback!</span>
                  ) : msg.feedbackState === 'good' || msg.feedbackState === 'bad' ? (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      {msg.feedbackState === 'good' ? (
                        <ThumbsUp size={12} className="text-green-500" />
                      ) : (
                        <ThumbsDown size={12} className="text-red-400" />
                      )}
                      Got it
                    </span>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400 mr-1">Helpful?</span>
                      <button
                        onClick={() => handleFeedback(msg.id, 'good')}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 transition"
                        title="Helpful"
                      >
                        <ThumbsUp size={13} />
                      </button>
                      <button
                        onClick={() => handleFeedback(msg.id, 'bad')}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                        title="Not helpful"
                      >
                        <ThumbsDown size={13} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about C&T..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none leading-relaxed max-h-32"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white hover:bg-blue-700 disabled:opacity-40 transition flex-shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-gray-400">
            Grounded in C&T's knowledge base · Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
