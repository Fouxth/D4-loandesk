import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import th from './locales/th.json';
import en from './locales/en.json';

const savedLang = typeof localStorage !== 'undefined' ? (localStorage.getItem('i18nextLng') || 'th') : 'th';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      th: { translation: th },
      en: { translation: en },
    },
    lng: savedLang.startsWith('en') ? 'en' : 'th',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

export default i18n;
