import { supabase } from './db.js'

const BUCKET = 'spot-images'

// Ja dati ir base64, augšupielādē uz Supabase Storage un atdod publisku URL.
// Ja dati jau ir URL, atdod tos nemainītus.
export async function uploadImageIfBase64(data) {
  if (!data || typeof data !== 'string') return null
  if (!data.startsWith('data:')) return data

  const match = data.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Nederīgs base64 attēla formāts')

  const mimeType = match[1]
  const base64Content = match[2]
  const buffer = Buffer.from(base64Content, 'base64')

  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`

  const { data: uploadData, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimeType, upsert: false })

  if (error) {
    console.error('Supabase Storage upload failed:', error)
    throw new Error(`Attēla augšupielāde neizdevās: ${error.message}`)
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uploadData.path)
  return urlData.publicUrl
}

export async function uploadImagesIfBase64(images) {
  if (!Array.isArray(images)) return []
  return Promise.all(images.map(uploadImageIfBase64))
}
