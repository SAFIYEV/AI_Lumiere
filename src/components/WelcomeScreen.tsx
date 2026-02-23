import { useLang } from '../contexts/LangContext'

interface Props {
  onSuggestionClick: (text: string) => void
}

export default function WelcomeScreen({ onSuggestionClick }: Props) {
  const { t } = useLang()

  const suggestions = [
    t('welcome.s1'),
    t('welcome.s2'),
    t('welcome.s3'),
    t('welcome.s4'),
  ]

  return (
    <div className="welcome">
      <img src="/logo.jpg" alt="AI Lumiere" className="welcome__logo-img" />
      <h1 className="welcome__title">AI Lumiere</h1>
      <p className="welcome__subtitle">{t('welcome.subtitle')}</p>
      <div className="welcome__suggestions">
        {suggestions.map((s) => (
          <button key={s} className="welcome__suggestion" onClick={() => onSuggestionClick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
