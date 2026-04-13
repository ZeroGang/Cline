const LANG_KEY = 'cline_ui_lang'
const THEME_KEY = 'cline_ui_theme'

const VALID_LANG = new Set(['zh', 'en'])
const VALID_THEME = new Set(['dark', 'light'])

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function readLang(): 'zh' | 'en' {
  const raw = safeGet(LANG_KEY)
  if (raw && VALID_LANG.has(raw)) return raw as 'zh' | 'en'
  return typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en'
}

export function writeLang(value: 'zh' | 'en'): void {
  safeSet(LANG_KEY, VALID_LANG.has(value) ? value : 'zh')
}

export function readTheme(): 'dark' | 'light' {
  const raw = safeGet(THEME_KEY)
  if (raw && VALID_THEME.has(raw)) return raw as 'dark' | 'light'
  return 'dark'
}

export function writeTheme(value: 'dark' | 'light'): void {
  safeSet(THEME_KEY, VALID_THEME.has(value) ? value : 'dark')
}
