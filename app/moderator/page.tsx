import { Suspense } from 'react'
import ModeratorClient from './moderator-client'

export default function ModeratorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ModeratorClient />
    </Suspense>
  )
}
