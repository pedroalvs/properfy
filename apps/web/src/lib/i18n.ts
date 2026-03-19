export type Locale = 'en-AU' | 'pt-BR';

export const SUPPORTED_LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: 'en-AU', label: 'English (Australia)', flag: '🇦🇺' },
  { value: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
];

const translations: Record<Locale, Record<string, string>> = {
  'en-AU': {
    'menu.editProfile': 'Edit Profile',
    'menu.changePassword': 'Change Password',
    'menu.changeLanguage': 'Change Language',
    'menu.logout': 'Log out of system',
  },
  'pt-BR': {
    'menu.editProfile': 'Editar Perfil',
    'menu.changePassword': 'Alterar Senha',
    'menu.changeLanguage': 'Alterar Idioma',
    'menu.logout': 'Sair do sistema',
  },
};

export function t(locale: Locale, key: string): string {
  return translations[locale]?.[key] ?? translations['en-AU'][key] ?? key;
}
