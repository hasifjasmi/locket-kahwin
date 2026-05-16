export type PostStatus = 'pending' | 'approved' | 'deleted'

export interface Post {
  id: string
  image_url: string
  caption: string | null
  border_color: string
  status: PostStatus
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      posts: {
        Row: Post
        Insert: Omit<Post, 'created_at'> & { created_at?: string }
        Update: Partial<Omit<Post, 'id'>>
      }
    }
  }
}
