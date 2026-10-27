// Übersetzen ohne React: für useT() im Browser und für Texte, die der Server
// selbst schreibt (Digests). Beide müssen dieselbe Reihenfolge haben, sonst
// sagt die SMS etwas anderes als das Display.
import { EN } from "./en";
import { NB } from "./nb";
import { NN } from "./nn";
import { PT_BR } from "./pt-BR";
import type { Locale } from "./locales";

const DICTS: Partial<Record<Locale, Record<string, string>>> = { en: EN, nb: NB, nn: NN, "pt-BR": PT_BR };

// Deutsch ist die Quelle. nb/nn/pt-BR fallen für alles, was noch nicht
// übersetzt ist, auf Englisch zurück statt auf Deutsch — Englisch ist für
// diese Leser der nützlichere Ersatz.
export function translate(locale: Locale, de: string): string {
  return locale === "de" ? de : DICTS[locale]?.[de] ?? EN[de] ?? de;
}
