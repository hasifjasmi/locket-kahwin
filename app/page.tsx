'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Post } from '@/lib/supabase/types'
import ImageCropper from '@/app/components/ImageCropper'

function generateShortId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

const ALLOWED_RATIOS = [
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
]
const RATIO_TOLERANCE = 0.1

function isAllowedRatio(width: number, height: number): boolean {
  const ratio = width / height
  return ALLOWED_RATIOS.some(
    (allowed) => Math.abs(ratio - allowed.value) < RATIO_TOLERANCE
  )
}

const BORDER_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Cream', hex: '#FFFDD0' },
  { name: 'Light Pink', hex: '#FFB6C1' },
  { name: 'Light Blue', hex: '#ADD8E6' },
  { name: 'Light Green', hex: '#90EE90' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Lavender', hex: '#E6E6FA' },
]

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [borderColor, setBorderColor] = useState('#FFFFFF')
  const [dragActive, setDragActive] = useState(false)
  const [showCropper, setShowCropper] = useState(false)
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, or GIF)')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File size must be under 10MB')
      return
    }

    // Load image to check dimensions
    const img = new Image()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target?.result as string)
      reader.onerror = reject
      reader.readAsDataURL(selectedFile)
    })

    img.onload = () => {
      if (isAllowedRatio(img.naturalWidth, img.naturalHeight)) {
        // Image already has acceptable ratio
        setFile(selectedFile)
        setError(null)
        setSuccess(false)
        setPreview(dataUrl)
      } else {
        // Show cropper
        setCropperImageSrc(dataUrl)
        setShowCropper(true)
      }
    }
    img.onerror = () => {
      setError('Failed to load image')
    }
    img.src = dataUrl
  }, [])

  const handleCropComplete = useCallback((croppedFile: File, croppedPreview: string) => {
    setFile(croppedFile)
    setPreview(croppedPreview)
    setShowCropper(false)
    setCropperImageSrc(null)
    setError(null)
    setSuccess(false)
  }, [])

  const handleCropCancel = useCallback(() => {
    setShowCropper(false)
    setCropperImageSrc(null)
    setFile(null)
    setPreview(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(false)

    try {
      // Step 1: Get presigned upload URL
      const urlResponse = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      })

      if (!urlResponse.ok) {
        const errData = await urlResponse.json()
        throw new Error(errData.error || 'Failed to get upload URL')
      }

      const { uploadUrl, path, apiKey } = await urlResponse.json()

      // Step 2: Upload file directly to Supabase Storage
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
          'apikey': apiKey,
          'x-upsert': 'true',
        },
      })

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file')
      }

      // Step 3: Insert post into database
      const supabase = createClient()
      const postId = generateShortId()
      const imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wedding-locket/${path}`

      const { error: dbError } = await supabase
        .from('posts')
        .insert({
          id: postId,
          image_url: imageUrl,
          caption: caption.trim() || null,
          border_color: borderColor,
          status: 'pending',
        } as Omit<Post, 'created_at'>)

      if (dbError) {
        throw new Error(dbError.message)
      }

      setSuccess(true)
      setFile(null)
      setCaption('')
      setBorderColor('#FFFFFF')
      setPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-amber-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-lg mx-auto px-3 sm:px-4 py-6 sm:py-12">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-gray-800 dark:text-gray-100 tracking-wide">
            Wedding Locket
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400 text-xs sm:text-sm">
            Share your precious moments with the happy couple
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            {/* File Dropzone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-6 sm:p-8 text-center transition-colors cursor-pointer
                ${dragActive
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-500'
                }
                ${preview ? 'p-3 sm:p-4' : ''}
              `}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              aria-label="Tap to select a photo to upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                disabled={uploading}
              />

              {preview ? (
                <div className="relative">
                  <img
                    src={preview}
                    alt="Preview"
                    className="max-h-48 sm:max-h-64 mx-auto rounded-lg object-contain"
                  />
                  <button
                    type="button"
                    className="absolute top-1 sm:top-2 right-1 sm:right-2 bg-gray-800/70 hover:bg-gray-800 text-white rounded-full w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFile(null)
                      setPreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Remove photo"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3 py-2">
                  <div className="text-3xl sm:text-4xl">📸</div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      Tap to upload
                    </span>
                    {' '}or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">
                    JPEG, PNG, or GIF (max 10MB) · Square or 4:3
                  </p>
                </div>
              )}
            </div>

            {/* Caption */}
            <div>
              <label htmlFor="caption" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Add a caption (optional)
              </label>
              <textarea
                id="caption"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none transition-all text-base"
                placeholder="Write a sweet message..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={280}
                disabled={uploading}
              />
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 text-right">
                {caption.length}/280
              </p>
            </div>

            {/* Border Color Picker */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Polaroid border color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {BORDER_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setBorderColor(preset.hex)}
                    className={`w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
                      borderColor.toUpperCase() === preset.hex.toUpperCase()
                        ? 'ring-2 ring-amber-400 ring-offset-2 dark:ring-offset-gray-800 scale-110'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                    aria-label={`Set border color to ${preset.name}`}
                  />
                ))}
                <label className="w-9 h-9 rounded-full border-2 border-gray-300 dark:border-gray-600 overflow-hidden cursor-pointer hover:scale-110 transition-all flex items-center justify-center bg-gray-100 dark:bg-gray-700" title="Pick custom color">
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-12 h-12 -m-1.5 cursor-pointer border-0 bg-transparent"
                    aria-label="Pick custom border color"
                  />
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-500 font-mono ml-1">
                  {borderColor}
                </span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm text-center">
                Photo shared successfully! The couple will see it soon.
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full min-h-[48px] py-3 px-6 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:cursor-not-allowed text-base"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  Share Photo
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer Links */}
        <div className="mt-5 sm:mt-6 text-center text-xs text-gray-500 dark:text-gray-500 space-x-4">
          <a
            href="/viewer"
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors inline-block min-h-[44px] min-w-[44px] leading-[44px]"
          >
            Live Wall →
          </a>
          <span className="hidden sm:inline">·</span>
          <a
            href="/moderator"
            className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors inline-block min-h-[44px] min-w-[44px] leading-[44px] sm:inline"
          >
            Moderator
          </a>
        </div>
      </div>

      {showCropper && cropperImageSrc && (
        <ImageCropper
          imageSrc={cropperImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </main>
  )
}
