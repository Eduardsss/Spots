// Kopīgi validācijas palīgi — izmantoti visos maršrutos.

export const USERNAME_RE = /^[a-zA-Z0-9_-]+$/

export function validateUsername(value) {
  if (typeof value !== 'string') return 'Lietotājvārds ir obligāts'
  const v = value.trim()
  if (v.length < 3) return 'Lietotājvārdam jābūt vismaz 3 simboliem'
  if (v.length > 50) return 'Lietotājvārds nedrīkst pārsniegt 50 simbolus'
  if (!USERNAME_RE.test(v)) return 'Lietotājvārds drīkst saturēt tikai burtus, ciparus, _ un -'
  return null
}

export function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8) return 'Parolei jābūt vismaz 8 simboliem'
  if (value.length > 128) return 'Parole nedrīkst pārsniegt 128 simbolus'
  return null
}

export function validateSpotName(value) {
  if (typeof value !== 'string') return 'Nosaukums ir obligāts'
  const v = value.trim()
  if (v.length === 0) return 'Nosaukums ir obligāts'
  if (v.length > 100) return 'Nosaukums nedrīkst pārsniegt 100 simbolus'
  return null
}

export function validateDescription(value) {
  if (value == null) return null
  if (typeof value !== 'string') return 'Aprakstam jābūt teksta virknei'
  if (value.length > 2000) return 'Apraksts nedrīkst pārsniegt 2000 simbolus'
  return null
}

export function validateLat(value) {
  const n = Number(value)
  if (Number.isNaN(n) || n < -90 || n > 90) return 'Platuma grādi (lat) jābūt skaitlim no -90 līdz 90'
  return null
}

export function validateLng(value) {
  const n = Number(value)
  if (Number.isNaN(n) || n < -180 || n > 180) return 'Garuma grādi (lng) jābūt skaitlim no -180 līdz 180'
  return null
}

export function validateStatus(value) {
  if (value !== 'public' && value !== 'private') return 'Statusam jābūt "public" vai "private"'
  return null
}

export function validateTagName(value) {
  if (typeof value !== 'string') return 'Taga nosaukumam jābūt teksta virknei'
  const v = value.trim()
  if (v.length === 0) return null // tukšus tagus izlaižam, nevis noraidām
  if (v.length > 50) return 'Taga nosaukums nedrīkst pārsniegt 50 simbolus'
  return null
}

export function validateComment(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return 'Komentārs ir obligāts'
  if (value.trim().length > 1000) return 'Komentārs nedrīkst pārsniegt 1000 simbolus'
  return null
}

export function validateCollectionName(value) {
  if (typeof value !== 'string') return 'Kolekcijas nosaukums ir obligāts'
  const v = value.trim()
  if (v.length === 0) return 'Kolekcijas nosaukums ir obligāts'
  if (v.length > 120) return 'Kolekcijas nosaukums nedrīkst pārsniegt 120 simbolus'
  return null
}

export function validateCollectionDescription(value) {
  if (value == null) return null
  if (typeof value !== 'string') return 'Aprakstam jābūt teksta virknei'
  if (value.length > 500) return 'Apraksts nedrīkst pārsniegt 500 simbolus'
  return null
}

export function validateProfileImage(value) {
  if (value == null) return null
  if (typeof value !== 'string') return 'Profila attēlam jābūt base64 virknei'
  // ~1.5 MB base64 kodētam attēlam ≈ 2 000 000 simboli
  if (value.length > 2_000_000) return 'Profila attēls ir pārāk liels (maks. ~1.5 MB)'
  return null
}
