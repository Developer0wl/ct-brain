import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../lib/supabase'
import { streamChat, submitFeedback, type ChatMessage } from '../lib/api'
import {
  LogOut,
  Settings,
  Plus,
  Send,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  ChevronRight,
  Globe,
  Database,
  Mail,
  MessageSquare,
  FolderOpen,
} from 'lucide-react'

interface Message extends ChatMessage {
  id: string
  sources?: Array<{ name: string; similarity: number }>
  streaming?: boolean
  activity?: string | null   // current tool activity label
  messageId?: string | null
  feedbackState?: 'none' | 'good' | 'bad' | 'submitted'
}

const SUGGESTIONS = [
  { label: 'Services', text: "What are C&T's three core service lines?" },
  { label: 'Engagement', text: 'How does C&T approach a digital transformation engagement?' },
  { label: 'Enable AI', text: 'What is the Enable AI service?' },
  { label: 'Values', text: "What are C&T's core values?" },
]

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  )
}

function SourceIcon({ name }: { name: string }) {
  const n = name.toLowerCase()
  if (n.includes('web')) return <Globe size={10} className="flex-shrink-0" />
  if (n.includes('teams')) return <MessageSquare size={10} className="flex-shrink-0" />
  if (n.includes('email') || n.includes('outlook')) return <Mail size={10} className="flex-shrink-0" />
  if (n.includes('sharepoint') || n.includes('onedrive')) return <FolderOpen size={10} className="flex-shrink-0" />
  return <Database size={10} className="flex-shrink-0" />
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white select-none"
      style={{ background: color }}
    >
      {initials}
    </div>
  )
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [userRole, setUserRole] = useState<string>('member')
  const [userInitials, setUserInitials] = useState('U')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const email = data.user.email ?? ''
      const parts = email.split('@')[0].split('.')
      setUserInitials(
        parts.length >= 2
          ? (parts[0][0] + parts[1][0]).toUpperCase()
          : email.slice(0, 2).toUpperCase()
      )
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, display_name')
        .eq('id', data.user.id)
        .single()
      setUserRole(profile?.role ?? 'member')
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  async function handleSend(text?: string) {
    const content = (text ?? input).trim()
    if (!content || isStreaming) return

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content }
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
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
    setIsStreaming(true)

    const history: ChatMessage[] = [...messages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
    }))

    await streamChat(
      history,
      (chunk) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId
            ? { ...m, content: m.content + chunk, activity: null }
            : m
          )
        )
      },
      (result) => {
        if (result.conversationId) setConversationId(result.conversationId)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, activity: null, sources: result.sources, messageId: result.messageId, feedbackState: 'none' }
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
              ? { ...m, content: `Something went wrong: ${err}`, streaming: false, activity: null }
              : m
          )
        )
        setIsStreaming(false)
      },
      conversationId,
      // onActivity — show which tool is running
      (label) => {
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, activity: label } : m)
        )
      }
    )
  }

  async function handleFeedback(messageLocalId: string, rating: 'good' | 'bad') {
    const msg = messages.find((m) => m.id === messageLocalId)
    if (!msg?.messageId) return

    setMessages((prev) =>
      prev.map((m) => m.id === messageLocalId ? { ...m, feedbackState: rating } : m)
    )

    try {
      await submitFeedback(msg.messageId, rating)
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => m.id === messageLocalId ? { ...m, feedbackState: 'submitted' } : m)
        )
      }, 1200)
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.id === messageLocalId ? { ...m, feedbackState: 'none' } : m)
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

  function handleNewChat() {
    setMessages([])
    setConversationId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="flex w-56 flex-shrink-0 flex-col bg-sidebar-bg">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white text-xs font-bold flex-shrink-0">
            CT
          </div>
          <div className="min-w-0">
            <p className="text-sidebar-fg-active text-sm font-semibold leading-tight truncate">C&T Brain</p>
            <p className="text-sidebar-fg text-xs leading-tight truncate">Cloud and Things</p>
          </div>
        </div>

        {/* New chat button */}
        <div className="px-3 pb-3">
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-fg-active bg-sidebar-hover hover:bg-white/10 transition-colors"
          >
            <Plus size={15} />
            New conversation
          </button>
        </div>

        <div className="mx-4 border-t border-white/10 mb-3" />

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-0.5 sidebar-scroll overflow-y-auto">
          <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-fg-active bg-sidebar-hover/60">
            <Sparkles size={14} className="text-primary flex-shrink-0" />
            <span className="truncate">Chat</span>
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-fg hover:text-sidebar-fg-active hover:bg-sidebar-hover transition-colors"
            >
              <Settings size={14} className="flex-shrink-0" />
              <span className="truncate">Knowledge Base</span>
            </button>
          )}
        </nav>

        {/* User footer */}
        <div className="mt-auto border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/30 text-primary-foreground text-xs font-semibold">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sidebar-fg-active text-xs font-medium leading-tight truncate">
                {userInitials}
              </p>
              <p className="text-sidebar-fg text-xs leading-tight capitalize">{userRole}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="text-sidebar-fg hover:text-sidebar-fg-active transition-colors flex-shrink-0"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3 flex-shrink-0">
          <div>
            <h1 className="text-sm font-semibold text-foreground">Ask C&T Brain</h1>
            <p className="text-xs text-muted-foreground">Powered by C&T's knowledge base</p>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              <Plus size={12} />
              New chat
            </button>
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto chat-scroll px-6 py-6">
          <div className="mx-auto max-w-2xl space-y-6">

            {/* Empty state */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center py-16 text-center animate-fade-in">
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles size={26} className="text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  What can I help you with?
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mb-8">
                  Ask anything about Cloud and Things — services, processes, proposals, or anything you'd normally ask Kishor.
                </p>
                <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => handleSend(s.text)}
                      className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-primary/50 hover:bg-primary/5 transition-all"
                    >
                      <div>
                        <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">{s.label}</p>
                        <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">{s.text}</p>
                      </div>
                      <ChevronRight size={13} className="text-muted-foreground/50 group-hover:text-primary flex-shrink-0 ml-2 transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message list */}
            {messages.map((msg) => (
              <div key={msg.id} className="flex gap-3 animate-fade-in">
                {/* Avatar */}
                {msg.role === 'assistant' ? (
                  <Avatar initials="CT" color="hsl(221, 83%, 53%)" />
                ) : (
                  <div className="order-last ml-1">
                    <Avatar initials={userInitials} color="hsl(262, 60%, 55%)" />
                  </div>
                )}

                {/* Bubble */}
                <div className={`flex flex-col min-w-0 flex-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[88%] ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-surface border border-border text-foreground rounded-tl-sm shadow-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : msg.streaming && !msg.content ? (
                      msg.activity ? (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                          {msg.activity}
                        </span>
                      ) : (
                        <TypingIndicator />
                      )
                    ) : (
                      <div className="prose-chat">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Sources / tools used */}
                  {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                    <div className="mt-2 flex flex-wrap gap-1.5 max-w-[88%]">
                      {msg.sources.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                        >
                          <SourceIcon name={s.name} />
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Feedback */}
                  {msg.role === 'assistant' && !msg.streaming && msg.messageId && (
                    <div className="mt-1.5 flex items-center gap-0.5">
                      {msg.feedbackState === 'submitted' ? (
                        <span className="text-xs text-muted-foreground px-1">Thanks!</span>
                      ) : msg.feedbackState === 'good' || msg.feedbackState === 'bad' ? (
                        <span className="text-xs text-muted-foreground px-1 flex items-center gap-1">
                          {msg.feedbackState === 'good'
                            ? <ThumbsUp size={11} className="text-success" />
                            : <ThumbsDown size={11} className="text-destructive" />
                          }
                          Got it
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleFeedback(msg.id, 'good')}
                            className="rounded-md p-1.5 text-muted-foreground/60 hover:text-success hover:bg-success/10 transition-all"
                            title="Helpful"
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            onClick={() => handleFeedback(msg.id, 'bad')}
                            className="rounded-md p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all"
                            title="Not helpful"
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div ref={scrollRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-border bg-surface px-6 py-4">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end gap-3 rounded-2xl border border-border bg-surface shadow-sm px-4 py-3 focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-primary/10 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about C&T..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder-muted-foreground/70 outline-none leading-relaxed"
                style={{ minHeight: '22px', maxHeight: '160px' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send size={14} />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground/60">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
