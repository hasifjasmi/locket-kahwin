import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { filename, contentType } = body as { filename: string; contentType: string }

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'filename and contentType are required' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
    if (!allowedTypes.includes(contentType)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, and GIF files are allowed' },
        { status: 400 }
      )
    }

    // Generate a unique path
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 8)
    const ext = filename.split('.').pop() || 'jpg'
    const path = `${timestamp}-${randomString}.${ext}`

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      )
    }

    const uploadUrl = `${supabaseUrl}/storage/v1/object/wedding-locket/${path}`

    return NextResponse.json({
      uploadUrl,
      path,
      apiKey: anonKey,
    })
  } catch (error) {
    console.error('[upload-url] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
