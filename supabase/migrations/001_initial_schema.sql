-- Create the posts table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Grant base table privileges to anon and authenticated roles
GRANT INSERT, SELECT, UPDATE ON posts TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Create policy: Anyone can insert posts
CREATE POLICY "Anyone can insert posts"
  ON posts
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Create policy: Anyone can read posts (for the viewer)
CREATE POLICY "Anyone can read posts"
  ON posts
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Create policy: Anyone can update posts (for moderator delete)
-- In production, you'd restrict this, but for this minimalist approach we allow it
CREATE POLICY "Anyone can update posts"
  ON posts
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Enable realtime for the posts table
ALTER PUBLICATION supabase_realtime ADD TABLE posts;

-- Create the wedding-locket storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('wedding-locket', 'wedding-locket', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Allow anyone to upload
CREATE POLICY "Allow public uploads to wedding-locket"
  ON storage.objects
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'wedding-locket');

-- Storage policy: Allow anyone to read
CREATE POLICY "Allow public reads from wedding-locket"
  ON storage.objects
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'wedding-locket');

-- Storage policy: Allow anyone to delete (for moderator)
CREATE POLICY "Allow public deletes from wedding-locket"
  ON storage.objects
  FOR DELETE
  TO authenticated, anon
  USING (bucket_id = 'wedding-locket');
