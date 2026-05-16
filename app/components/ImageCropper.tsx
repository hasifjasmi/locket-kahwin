'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImageCropperProps {
  imageSrc: string
  onCropComplete: (file: File, previewUrl: string) => void
  onCancel: () => void
}

type AspectRatio = number

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2d context')

  // Validate crop dimensions
  if (pixelCrop.width <= 0 || pixelCrop.height <= 0) {
    throw new Error('Invalid crop dimensions')
  }

  // Cap output to max 2048px on longest side
  const maxSize = 2048
  let width = pixelCrop.width
  let height = pixelCrop.height
  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height)
    width *= scale
    height *= scale
  }

  canvas.width = Math.round(width)
  canvas.height = Math.round(height)

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to create image blob'))
      }
    }, 'image/jpeg', 0.92)
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImageCropper({
  imageSrc,
  onCropComplete: onCropCompleteProp,
  onCancel,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState<AspectRatio>(1)
  const [initialized, setInitialized] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Stores the pixel crop area from react-easy-crop's onCropComplete
  const croppedAreaPixelsRef = useRef<Area | null>(null)

  // Preview URL created on crop — cleaned up on unmount
  const previewUrlRef = useRef<string | null>(null)

  // Determine which aspect ratio is closer to the original image and
  // initialize the default — only once, after the image has loaded.
  useEffect(() => {
    if (initialized) return

    const img = new Image()
    img.onload = () => {
      const imageRatio = img.naturalWidth / img.naturalHeight
      // Distance from 1:1 and 4:3
      const distToSquare = Math.abs(imageRatio - 1)
      const distToLandscape = Math.abs(imageRatio - 4 / 3)
      setAspect(distToSquare <= distToLandscape ? 1 : 4 / 3)
      setInitialized(true)
    }
    img.src = imageSrc
  }, [imageSrc, initialized])

  // Handler from react-easy-crop — stores pixel crop data
  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      croppedAreaPixelsRef.current = croppedAreaPixels
    },
    []
  )

  // Perform the actual crop when user clicks "Crop & Use"
  const handleCropConfirm = useCallback(async () => {
    const pixelCrop = croppedAreaPixelsRef.current
    if (!pixelCrop) return

    setProcessing(true)

    try {
      const blob = await getCroppedImg(imageSrc, {
        x: pixelCrop.x,
        y: pixelCrop.y,
        width: pixelCrop.width,
        height: pixelCrop.height,
      })

      const previewUrl = URL.createObjectURL(blob)
      previewUrlRef.current = previewUrl

      const file = new File([blob], 'cropped.jpeg', {
        type: 'image/jpeg',
      })

      onCropCompleteProp(file, previewUrl)
    } catch (error) {
      console.error('Failed to crop image:', error)
      // Show error to user - we can't pass a message via props,
      // so just log it. The cropper stays open for retry.
    } finally {
      setProcessing(false)
    }
  }, [imageSrc, onCropCompleteProp])

  // Clean up the preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
        previewUrlRef.current = null
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      {/* Modal card */}
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Header — aspect ratio toggle */}
        <div className="flex items-center justify-center gap-2 px-4 pt-4 pb-2 shrink-0">
          <button
            onClick={() => setAspect(1)}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              aspect === 1
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            1:1 Square
          </button>
          <button
            onClick={() => setAspect(4 / 3)}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              aspect === 4 / 3
                ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            4:3
          </button>
        </div>

        {/* Cropper area */}
        <div className="relative flex-1 min-h-0 mx-4 my-2 rounded-xl overflow-hidden bg-gray-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            minZoom={1}
            maxZoom={3}
            cropShape="rect"
            showGrid
            style={{
              cropAreaStyle: { borderRadius: '12px' },
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400 dark:text-gray-500 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <input
            id="zoom-slider"
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-gray-600 accent-amber-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:min-h-[48px] [&::-webkit-slider-thumb]:min-w-[48px]"
            style={{ minHeight: '48px' }}
            aria-label="Zoom level"
          />
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-400 dark:text-gray-500 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
            <line x1="11" y1="8" x2="11" y2="14" />
          </svg>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 px-4 pb-4 pt-1 shrink-0">
          <button
            onClick={onCancel}
            disabled={processing}
            className="flex-1 min-h-[48px] py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCropConfirm}
            disabled={processing}
            className="flex-1 min-h-[48px] py-2.5 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
          >
            {processing ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Cropping...
              </>
            ) : (
              'Crop & Use'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
