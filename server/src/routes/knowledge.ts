import { Router, Response } from 'express'
import multer from 'multer'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requireAdmin, AuthedRequest } from '../middleware/auth'
import { embedText, embedBatch, chunkText } from '../services/embeddings'
import { v4 as uuidv4 } from 'uuid'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/knowledge — list all sources
router.get('/sources', requireAuth, async (_req: AuthedRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('knowledge_sources')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// GET /api/knowledge/chunks — list all chunks (admin)
router.get('/chunks', requireAdmin, async (_req: AuthedRequest, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('knowledge_chunks')
    .select('id, source_name, source_type, title, content, created_at')
    .order('created_at', { ascending: false })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json(data)
})

// POST /api/knowledge/faq — add a manual FAQ entry
router.post('/faq', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { question, answer } = req.body as { question: string; answer: string }

  if (!question?.trim() || !answer?.trim()) {
    res.status(400).json({ error: 'question and answer are required' })
    return
  }

  const content = `Q: ${question.trim()}\nA: ${answer.trim()}`
  const embedding = await embedText(content)

  const { error } = await supabase.from('knowledge_chunks').insert({
    id: uuidv4(),
    source_name: 'manual-faq',
    source_type: 'faq',
    title: question.trim().slice(0, 100),
    content,
    embedding,
  })

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ success: true })
})

// POST /api/knowledge/upload — upload and ingest a document
router.post(
  '/upload',
  requireAdmin,
  upload.single('file'),
  async (req: AuthedRequest, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: 'No file provided' }); return }

    const { originalname, mimetype, buffer } = req.file
    const ext = originalname.split('.').pop()?.toLowerCase() ?? 'txt'

    let rawText = ''
    try {
      if (ext === 'txt') {
        rawText = buffer.toString('utf-8')
      } else {
        // PDF and DOCX require the Python ingestion pipeline
        // For the web upload path, accept only plain text files in v1
        res.status(400).json({
          error: 'PDF and DOCX files must be ingested via the Python CLI script (scripts/ingest.py). Only .txt files are supported through the web upload.',
        })
        return
      }
    } catch (parseErr) {
      res.status(422).json({ error: `Failed to parse file: ${(parseErr as Error).message}` })
      return
    }

    const chunks = chunkText(rawText)
    if (chunks.length === 0) {
      res.status(422).json({ error: 'No usable text found in file' })
      return
    }

    const embeddings = await embedBatch(chunks)

    const sourceId = uuidv4()
    await supabase.from('knowledge_sources').insert({
      id: sourceId,
      name: originalname,
      type: ext,
      size_bytes: buffer.length,
      chunk_count: chunks.length,
      uploaded_by: req.userId,
    })

    const rows = chunks.map((chunk, i) => ({
      id: uuidv4(),
      source_name: originalname,
      source_type: ext,
      title: `${originalname} — chunk ${i + 1}`,
      content: chunk,
      embedding: embeddings[i],
      metadata: { source_id: sourceId },
    }))

    const { error } = await supabase.from('knowledge_chunks').insert(rows)
    if (error) { res.status(500).json({ error: error.message }); return }

    res.json({ success: true, chunks: chunks.length, source: originalname })
  }
)

// DELETE /api/knowledge/source/:id — delete a source and its chunks
router.delete('/source/:id', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { id } = req.params

  const { data: source } = await supabase
    .from('knowledge_sources')
    .select('name')
    .eq('id', id)
    .single()

  if (!source) { res.status(404).json({ error: 'Source not found' }); return }

  await supabase.from('knowledge_chunks').delete().eq('source_name', source.name)
  await supabase.from('knowledge_sources').delete().eq('id', id)

  res.json({ success: true })
})

// DELETE /api/knowledge/chunk/:id — delete a single chunk
router.delete('/chunk/:id', requireAdmin, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { error } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('id', req.params.id)

  if (error) { res.status(500).json({ error: error.message }); return }
  res.json({ success: true })
})

export default router
