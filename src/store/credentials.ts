const STORAGE_KEY = 'lastfm_api_key'
const STORAGE_SECRET = 'lastfm_api_secret'

export interface Credentials {
  apiKey: string
  apiSecret: string
}

export function getCredentials(): Credentials | null {
  const apiKey = localStorage.getItem(STORAGE_KEY)
  const apiSecret = localStorage.getItem(STORAGE_SECRET)
  if (apiKey && apiSecret) {
    return { apiKey, apiSecret }
  }
  return null
}

export function saveCredentials(key: string, secret: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim())
  localStorage.setItem(STORAGE_SECRET, secret.trim())
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_SECRET)
}

export function hasCredentials(): boolean {
  return getCredentials() !== null
}
