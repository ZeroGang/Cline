import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { readLang, writeLang } from '@/lib/storage'
import { LoadingOverlay } from '@/components/LoadingOverlay'

type Lang = 'zh' | 'en'
type Messages = Record<string, { cn?: string; en?: string }>

const I18nContext = createContext<{
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string) => string
} | null>(null)

function pick(messages: Messages, key: string, lang: Lang): string {
  const entry = messages[key]
  if (!entry || typeof entry !== 'object') return key
  const primary = lang === 'zh' ? entry.cn : entry.en
  const fallback = lang === 'zh' ? entry.en : entry.cn
  if (typeof primary === 'string' && primary.length) return primary
  if (typeof fallback === 'string' && fallback.length) return fallback
  return key
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Messages | null>(null)
  const [lang, setLangState] = useState<Lang>(() => readLang())

  useEffect(() => {
    void fetch('/locales/i18n.json')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Messages>
      })
      .then(setMessages)
      .catch(() => setMessages({}))
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    writeLang(l)
  }, [])

  const t = useCallback(
    (key: string) => (messages ? pick(messages, key, lang) : key),
    [messages, lang]
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  if (!messages) {
    return <LoadingOverlay text="加载中…" />
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
