import { supabase } from './db.js'

const BUCKET = 'spot-images'

export async function uploadImageIfBase64(data) {
  if (!data || typeof data !== 'string') return null
  if (!data.startsWith('data:')) return data

  const match = data.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null

  const mimeType = match[1]
  const base64Content = match[2]
  const buffer = Buffer.from(base64Content, 'base64')

  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`

  try {
    const { data: uploadData, error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, buffer, { contentType: mimeType, upsert: false })

    if (!error) {
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)
      return urlData.publicUrl
    }
    console.error('Supabase Storage upload failed, storing base64 fallback:', error.message)
  } catch (err) {
    console.error('Supabase Storage exception, storing base64 fallback:', err)
  }

  // Fallback: glabājam base64 tieši DB ja Storage nav pieejams
  return data
}

export async function uploadImagesIfBase64(images) {
  if (!Array.isArray(images)) return []
  return Promise.all(images.map(uploadImageIfBase64))
}
