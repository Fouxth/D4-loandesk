import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('i18nextLng', lang);
    }
  };

  const currentLang = i18n.language?.startsWith('en') ? 'en' : 'th';

  return (
    <div className="flex gap-1 items-center">
      <button
        onClick={() => handleLangChange('th')}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          currentLang === 'th' 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        ไทย
      </button>
      <button
        onClick={() => handleLangChange('en')}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          currentLang === 'en' 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
