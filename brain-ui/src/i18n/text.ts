import enRaw from "./en.arb?raw";
import frRaw from "./fr.arb?raw";

type Locale = "en" | "fr";
type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  en: JSON.parse(enRaw),
  fr: JSON.parse(frRaw),
};

export const getLocale = (): Locale => {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en";
};

export const translate = (
  key: string,
  values?: Record<string, string | number>,
  locale: Locale = getLocale()
): string => {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce(
    (result, [k, v]) => result.replaceAll(`{${k}}`, String(v)),
    template
  );
};
