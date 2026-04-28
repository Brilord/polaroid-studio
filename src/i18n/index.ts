import { en } from './en';
import { ko } from './ko';

export type Language = 'en' | 'ko';
export type TranslationCopy = typeof en;

export const translations = {
  en,
  ko,
} satisfies Record<Language, TranslationCopy>;
