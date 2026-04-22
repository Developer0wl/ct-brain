-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge chunks table: stores embedded document fragments
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,         -- original filename or "manual-faq"
  source_type TEXT NOT NULL,         -- 'pdf' | 'docx' | 'txt' | 'faq'
  title TEXT,                        -- optional human label
  content TEXT NOT NULL,             -- raw text of this chunk
  embedding vector(3072),            -- Gemini gemini-embedding-001 dimension
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- hnsw on halfvec cast: required for >2000 dims (plain vector hnsw is limited to 2000)
CREATE INDEX ON knowledge_chunks
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Source documents table: tracks uploaded files
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'pdf' | 'docx' | 'txt' | 'faq'
  size_bytes BIGINT,
  chunk_count INT DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User profiles table: extends Supabase auth.users
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'member');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS: knowledge_chunks readable by all authenticated users
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read chunks"
  ON knowledge_chunks FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Admins can insert chunks"
  ON knowledge_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "Admins can delete chunks"
  ON knowledge_chunks FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS: sources
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sources"
  ON knowledge_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sources"
  ON knowledge_sources FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS: profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Similarity search function (used by backend RAG)
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(3072),
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source_name TEXT,
  source_type TEXT,
  title TEXT,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    kc.id,
    kc.content,
    kc.source_name,
    kc.source_type,
    kc.title,
    1 - (kc.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM knowledge_chunks kc
  WHERE 1 - (kc.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) > match_threshold
  ORDER BY kc.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;
