'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'

const STORAGE_KEY = 'locket_moderator_auth'
const PASSWORD = process.env.NEXT_PUBLIC_MODERATOR_PASSWORD || 'secret'

export default function ModeratorClient() {
  const [authenticated, setAuthenticated] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()

  // Check auth on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    const urlPass = searchParams.get('pass')

    if (stored === 'true' || urlPass === PASSWORD) {
      setAuthenticated(true)
      localStorage.setItem(STORAGE_KEY, 'true')
    }
  }, [searchParams])

  const handleLogin = useCallback(() => {
    if (passwordInput === PASSWORD) {
      setAuthenticated(true)
      localStorage.setItem(STORAGE_KEY, 'true')
      setPasswordError(false)
      router.replace('/moderator')
    } else {
      setPasswordError(true)
    }
  }, [passwordInput, router])

  // Fetch initial posts
  useEffect(() => {
    if (!authenticated) return

    const fetchPosts = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .neq('status', 'deleted')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching posts:', error)
      } else {
        setPosts(data || [])
      }
      setLoading(false)
    }

    fetchPosts()
  }, [authenticated])

  // Real-time subscription
  useEffect(() => {
    if (!authenticated) return

    const supabase = createClient()
    const channel = supabase
      .channel('moderator-posts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        (payload: any) => {
          const newPost = payload.new as Post
          const oldPost = payload.old as Post | undefined

          if (payload.eventType === 'INSERT' && newPost.status !== 'deleted') {
            setPosts((prev) => [newPost, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            if (newPost.status === 'deleted') {
              setPosts((prev) => prev.filter((p) => p.id !== newPost.id))
            } else {
              setPosts((prev) =>
                prev.map((p) => (p.id === newPost.id ? newPost : p))
              )
            }
          } else if (payload.eventType === 'DELETE' && oldPost) {
            setPosts((prev) => prev.filter((p) => p.id !== oldPost.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authenticated])

  const handleDelete = useCallback(async (postId: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('posts')
      .update({ status: 'deleted' })
      .eq('id', postId)

    if (error) {
      console.error('Error deleting post:', error)
    }
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setAuthenticated(false)
    router.push('/')
  }, [router])

  // Password modal
  if (!authenticated) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 sm:p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🔐</div>
            <h1 className="text-2xl font-light text-gray-800 dark:text-gray-100">
              Moderator Access
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
              Enter the passcode to continue
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleLogin()
            }}
            className="space-y-4"
          >
            <input
              type="password"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-center text-lg tracking-widest focus:ring-2 focus:ring-red-400 focus:border-transparent"
              placeholder="••••••"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value)
                setPasswordError(false)
              }}
              autoFocus
            />
            {passwordError && (
              <p className="text-red-500 text-sm text-center">
                Incorrect passcode. Try again.
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition-colors min-h-[44px]"
            >
              Unlock Dashboard
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header — more compact on mobile */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-light text-gray-800 dark:text-gray-100 truncate">
              🛡️ Moderator Dashboard
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {posts.length} post{posts.length !== 1 ? 's' : ''} · Real-time feed
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <a
              href="/"
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Upload
            </a>
            <a
              href="/viewer"
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Wall
            </a>
            <button
              onClick={handleLogout}
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-red-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {/* Posts Feed */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-gray-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 text-gray-500 dark:text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-lg">No posts yet</p>
            <p className="text-sm mt-1">Photos will appear here when guests upload them</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function PostCard({ post, onDelete }: { post: Post; onDelete: (id: string) => void }) {
  const [timeAgo, setTimeAgo] = useState('')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const updateTime = () => {
      const diff = Date.now() - new Date(post.created_at).getTime()
      const seconds = Math.floor(diff / 1000)
      const minutes = Math.floor(seconds / 60)
      const hours = Math.floor(minutes / 60)

      if (hours > 0) setTimeAgo(`${hours}h ago`)
      else if (minutes > 0) setTimeAgo(`${minutes}m ago`)
      else setTimeAgo(`${seconds}s ago`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [post.created_at])

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(post.id)
    } finally {
      setDeleting(false)
      setShowConfirm(false)
    }
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
        {/* Post ID Badge */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-gray-100 dark:bg-gray-700/50">
          <div className="flex items-center gap-2">
            <span className="font-mono text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">
              #{post.id}
            </span>
            <span
              className="inline-block w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500 shrink-0"
              style={{ backgroundColor: post.border_color || '#FFFFFF' }}
              title={`Border: ${post.border_color || '#FFFFFF'}`}
            />
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            {timeAgo}
          </span>
        </div>

        {/* Image */}
        <div className="relative aspect-square bg-gray-100 dark:bg-gray-700">
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-200 dark:bg-gray-600 animate-pulse" />
          )}
          <img
            src={post.image_url}
            alt={post.caption || 'Wedding photo'}
            className="w-full h-full object-cover"
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
        </div>

        {/* Caption */}
        {post.caption && (
          <div className="px-3 sm:px-4 py-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {post.caption}
            </p>
          </div>
        )}

        {/* Status & Actions */}
        <div className="px-3 sm:px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2">
          <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${
            post.status === 'pending'
              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}>
            {post.status}
          </span>
          <button
            onClick={() => setShowConfirm(true)}
            className="min-h-[44px] min-w-[44px] px-3 sm:px-4 py-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 confirm-dialog-overlay flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false)
          }}
        >
          <div className="confirm-dialog w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Photo?
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              This will remove photo <strong className="font-mono text-amber-600 dark:text-amber-400">#{post.id}</strong> from the live wall.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-5">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="flex-1 min-h-[44px] py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 min-h-[44px] py-2.5 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
