import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => i18n.changeLanguage('th')}
        className={`px-2 py-1 rounded ${i18n.language === 'th' ? 'bg-primary text-white' : 'bg-muted'}`}
      >
        ไทย
      </button>
      <button
        onClick={() => i18n.changeLanguage('en')}
        className={`px-2 py-1 rounded ${i18n.language === 'en' ? 'bg-primary text-white' : 'bg-muted'}`}
      >
        EN
      </button>
    </div>
  );
}
