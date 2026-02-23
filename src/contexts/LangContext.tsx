import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { t as translate, type Lang, type TranslationKey } from '../lib/i18n'

const LANG_KEY = 'ai-lumiere-lang'

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LangContext = createContext<LangContextValue>(null!)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem(LANG_KEY) as Lang) || 'ru'
  )

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem(LANG_KEY, l)
    document.documentElement.lang = l === 'kz' ? 'kk' : l
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang]
  )

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}
