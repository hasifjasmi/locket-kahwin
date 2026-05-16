'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'

const BUFFER_SECONDS = 5

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

function getRotation(postId: string): number {
  const hash = hashString(postId)
  // Map to -2.5 to +2.5 degrees
  return (hash % 50) / 10 - 2.5
}

export default function ViewerPage() {
  const [postsMap, setPostsMap] = useState<Map<string, Post>>(new Map())
  const postsMapRef = useRef<Map<string, Post>>(new Map())
  const [holdingQueue, setHoldingQueue] = useState<Map<string, Post>>(new Map())

  // Fetch initial posts
  useEffect(() => {
    const fetchPosts = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching posts:', error)
        return
      }

      const now = Date.now()
      const approvedPosts = (data || []).filter((post: Post) => {
        const age = (now - new Date(post.created_at).getTime()) / 1000
        return age > BUFFER_SECONDS
      })

      setPostsMap((prev) => {
        const next = new Map(prev)
        for (const post of approvedPosts) {
          next.set(post.id, post)
        }
        return next
      })
    }

    fetchPosts()
  }, [])

  // Keep ref in sync with state
  useEffect(() => {
    postsMapRef.current = postsMap
  }, [postsMap])

  // Real-time subscription with buffering logic
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('viewer-posts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload: any) => {
          const newPost = payload.new as Post
          if (newPost.status === 'deleted') return

          // Skip if already in postsMap (loaded by initial fetch or already processed)
          if (postsMapRef.current.has(newPost.id)) return

          setHoldingQueue((prev) => {
            const next = new Map(prev)
            next.set(newPost.id, newPost)
            return next
          })

          const createdAt = new Date(newPost.created_at).getTime()
          const delay = Math.max(0, BUFFER_SECONDS * 1000 - (Date.now() - createdAt))

          setTimeout(() => {
            setHoldingQueue((prev) => {
              const next = new Map(prev)
              const post = next.get(newPost.id)
              if (post) {
                next.delete(newPost.id)
                setPostsMap((prev) => {
                  const next = new Map(prev)
                  next.set(post.id, post)
                  return next
                })
              }
              return next
            })
          }, delay)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload: any) => {
          const updatedPost = payload.new as Post

          if (updatedPost.status === 'deleted') {
            setHoldingQueue((prev) => {
              const next = new Map(prev)
              next.delete(updatedPost.id)
              return next
            })
            setPostsMap((prev) => {
              const next = new Map(prev)
              next.delete(updatedPost.id)
              return next
            })
          } else {
            setPostsMap((prev) => {
              const next = new Map(prev)
              next.set(updatedPost.id, updatedPost)
              return next
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Convert map to sorted array for rendering
  const activePosts = Array.from(postsMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return (
    <main className="min-h-screen bg-gray-950 text-white overflow-hidden">
      {/* Subtle header */}
      <header className="fixed top-0 left-0 right-0 z-20 bg-gradient-to-b from-gray-950/90 to-transparent pointer-events-none">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-light tracking-widest text-white/60">
            WEDDING LOCKET
          </h1>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            <span className="text-xs text-white/40 font-medium tracking-wide">LIVE</span>
          </div>
        </div>
      </header>

      {/* Masonry Grid — fewer columns for projector */}
      <div className="pt-16 pb-8 px-4 md:px-8 lg:px-12">
        <div className="columns-2 lg:columns-3 xl:columns-4 gap-4 md:gap-6 space-y-4 md:space-y-6">
          {activePosts.map((post) => (
            <PolaroidCard key={post.id} post={post} />
          ))}
        </div>

        {/* Empty state */}
        {postsMap.size === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-white/30">
            <div className="text-6xl mb-4 animate-pulse">💍</div>
            <p className="text-lg font-light tracking-wide">Waiting for photos...</p>
            <p className="text-sm mt-2 text-white/20">Guest photos will appear here</p>
          </div>
        )}
      </div>

      {/* Holding queue indicator (subtle) */}
      {holdingQueue.size > 0 && (
        <div className="fixed bottom-4 right-4 z-20 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 text-xs text-white/50">
          {holdingQueue.size} photo{holdingQueue.size !== 1 ? 's' : ''} incoming...
        </div>
      )}
    </main>
  )
}

/* ---------------------------------------
   Polaroid Card Component
   --------------------------------------- */
function PolaroidCard({ post }: { post: Post }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [entered, setEntered] = useState(false)
  const rotationRef = useRef<number | null>(null)

  // Compute stable rotation once
  if (rotationRef.current === null) {
    rotationRef.current = getRotation(post.id)
  }

  useEffect(() => {
    // Trigger entrance animation after mount
    const frame = requestAnimationFrame(() => {
      setEntered(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="break-inside-avoid">
      <div
        className={`polaroid-card ${entered ? 'entering' : ''}`}
        style={{
          '--polaroid-base-rotate': `${rotationRef.current}deg`,
          '--polaroid-border-color': post.border_color || '#FFFFFF',
          backgroundColor: post.border_color || '#FFFFFF',
          transform: entered
            ? `rotate(${rotationRef.current}deg)`
            : `rotate(${rotationRef.current}deg) translateY(24px) scale(0.92)`,
          opacity: entered ? 1 : 0,
        } as React.CSSProperties}
      >
        {/* Image */}
        <div className="polaroid-img-wrap">
          {!imgLoaded && (
            <div className="aspect-[4/5] bg-gray-700 animate-pulse" />
          )}
          <img
            src={post.image_url}
            alt={post.caption || 'Wedding photo'}
            className={imgLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}
            style={{ transition: 'opacity 0.4s ease' }}
            onLoad={() => setImgLoaded(true)}
            loading="lazy"
          />
        </div>

        {/* Caption — always visible in bottom border area */}
        <div className="polaroid-caption">
          {post.caption || '\u00A0'}
        </div>
      </div>
    </div>
  )
}
