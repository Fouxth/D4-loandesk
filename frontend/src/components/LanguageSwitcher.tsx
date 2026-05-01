import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="flex gap-1 items-center">
      <button
        onClick={() => i18n.changeLanguage('th')}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          i18n.language === 'th' 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        ไทย
      </button>
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
          i18n.language === 'en' 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        EN
      </button>
    </div>
  );
}
