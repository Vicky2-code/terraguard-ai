/*
 * TerraGuard AI — lightweight i18n.
 *
 * English is the source-of-truth key language: every string is keyed by its
 * English text, so a missing translation simply falls back to English (the
 * default when the dictionary has no entry for the current language).
 *
 * Languages:
 *   en — English (default)
 *   hi — Hindi (हिन्दी)
 *   as — Assamese (অসমীয়া) — NER local language
 *   bn — Bengali (বাংলা) — NER local language
 *
 * Usage:
 *   const t = useT();
 *   t("Dashboard")        // -> "डैशबोर्ड" when lang === "hi"
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "hi" | "as" | "bn";

export interface LangMeta {
  id: Lang;
  /** English name (used in the switcher tooltip / label). */
  label: string;
  /** Name written in its own script. */
  native: string;
  /** Compact code shown on tight screens. */
  short: string;
}

export const LANGUAGES: LangMeta[] = [
  { id: "en", label: "English", native: "English", short: "EN" },
  { id: "hi", label: "Hindi", native: "हिन्दी", short: "हिं" },
  { id: "as", label: "Assamese", native: "অসমীয়া", short: "অসম" },
  { id: "bn", label: "Bengali", native: "বাংলা", short: "বাং" },
];

const STORAGE_KEY = "tg_lang";

const VALID: string[] = LANGUAGES.map((l) => l.id);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && VALID.includes(saved)) return saved as Lang;
  } catch {
    /* storage unavailable */
  }
  return "en";
}

/** Translations for a key: only hi/as/bn; English IS the key itself. */
type Dict3 = Record<Exclude<Lang, "en">, string>;

const DICT: Record<string, Dict3> = {
  /* ---------------- sidebar: sections ---------------- */
  OVERVIEW: { hi: "अवलोकन", as: "অৱলোকন", bn: "সারসংক্ষেপ" },
  MONITORING: { hi: "निगरानी", as: "নিৰীক্ষণ", bn: "পর্যবেক্ষণ" },
  "FIELD / INCIDENTS": { hi: "फ़ील्ड / घटनाएँ", as: "ক্ষেত্ৰ / ঘটনা", bn: "ফিল্ড / ঘটনা" },
  ANALYTICS: { hi: "विश्लेषण", as: "বিশ্লেষণ", bn: "বিশ্লেষণ" },
  REPORTING: { hi: "रिपोर्टिंग", as: "প্ৰতিবেদন", bn: "প্রতিবেদন" },
  SYSTEM: { hi: "सिस्टम", as: "ব্যৱস্থা", bn: "সিস্টেম" },

  /* ---------------- sidebar: items ---------------- */
  Dashboard: { hi: "डैशबोर्ड", as: "ডেশ্ববৰ্ড", bn: "ড্যাশবোর্ড" },
  "AI Prediction": { hi: "AI पूर्वानुमान", as: "AI ভৱিষ্যদ্বাণী", bn: "AI পূর্বাভাস" },
  "Early Alerts": { hi: "प्रारंभिक चेतावनी", as: "আগতীয়া সতৰ্কতা", bn: "প্রাথমিক সতর্কতা" },
  "GIS Monitor": { hi: "GIS मॉनिटर", as: "GIS মনিটৰ", bn: "GIS মনিটর" },
  "Weather Radar": { hi: "मौसम रडार", as: "বতৰ ৰাডাৰ", bn: "আবহাওয়া রাডার" },
  "Soil Moisture": { hi: "मिट्टी की नमी", as: "মাটিৰ আৰ্দ্ৰতা", bn: "মাটির আর্দ্রতা" },
  "Report Incident": { hi: "घटना की रिपोर्ट", as: "ঘটনা প্ৰতিবেদন", bn: "ঘটনা রিপোর্ট" },
  "Field Incidents": { hi: "फ़ील्ड घटनाएँ", as: "ক্ষেত্ৰৰ ঘটনা", bn: "ফিল্ড ঘটনা" },
  "Road Corridors": { hi: "सड़क गलियारे", as: "পথ কৰিডৰ", bn: "সড়ক করিডর" },
  "Critical Infrastructure": { hi: "महत्वपूर्ण अवसंरचना", as: "গুৰুত্বপূৰ্ণ আন্তঃগাঁথনি", bn: "সমালোচনামূলক অবকাঠামো" },
  "Risk Analytics": { hi: "जोखिम विश्लेषण", as: "বিপদ বিশ্লেষণ", bn: "ঝুঁকি বিশ্লেষণ" },
  "Risk Simulator": { hi: "जोखिम सिम्युलेटर", as: "বিপদ সিমুলেটৰ", bn: "ঝুঁকি সিমুলেটর" },
  "Model Analysis": { hi: "मॉडल विश्लेषण", as: "মডেল বিশ্লেষণ", bn: "মডেল বিশ্লেষণ" },
  "Temporal Analysis": { hi: "सामयिक विश्लेषण", as: "সময়ভিত্তিক বিশ্লেষণ", bn: "সাময়িক বিশ্লেষণ" },
  "Report Export": { hi: "रिपोर्ट निर्यात", as: "প্ৰতিবেদন ৰপ্তানি", bn: "রিপোর্ট রপ্তানি" },
  "Incident Reports": { hi: "घटना रिपोर्ट", as: "ঘটনা প্ৰতিবেদন", bn: "ঘটনা রিপোর্ট" },
  "Analytics Reports": { hi: "विश्लेषण रिपोर्ट", as: "বিশ্লেষণ প্ৰতিবেদন", bn: "বিশ্লেষণ রিপোর্ট" },
  "Model Governance": { hi: "मॉडल शासन", as: "মডেল পৰিচালনা", bn: "মডেল শাসন" },
  "Data Pipeline": { hi: "डेटा पाइपलाइन", as: "ডেটা পাইপলাইন", bn: "ডেটা পাইপলাইন" },
  "Admin / Data": { hi: "प्रशासन / डेटा", as: "প্ৰশাসন / ডেটা", bn: "অ্যাডমিন / ডেটা" },
  Settings: { hi: "सेटिंग्स", as: "ছেটিংছ", bn: "সেটিংস" },

  /* ---------------- sidebar: footer / drawer ---------------- */
  ENGINE: { hi: "इंजन", as: "ইঞ্জিন", bn: "ইঞ্জিন" },
  PROTOTYPE: { hi: "प्रोटोटाइप", as: "প্ৰট'টাইপ", bn: "প্রোটোটাইপ" },
  "RISK BANDS": { hi: "जोखिम श्रेणियाँ", as: "বিপদ স্তৰ", bn: "ঝুঁকি স্তর" },
  "5-LEVEL": { hi: "5-स्तर", as: "৫-স্তৰ", bn: "৫-স্তর" },
  REGION: { hi: "क्षेत्र", as: "অঞ্চল", bn: "অঞ্চল" },
  "NER, INDIA": { hi: "पूर्वोत्तर, भारत", as: "উত্তৰ-পূৰ্বাঞ্চল, ভাৰত", bn: "উত্তর-পূর্ব, ভারত" },
  NAVIGATION: { hi: "नेविगेशन", as: "নেভিগেশ্বন", bn: "নেভিগেশন" },
  CLOSE: { hi: "बंद करें", as: "বন্ধ কৰক", bn: "বন্ধ করুন" },
  "Close navigation": { hi: "नेविगेशन बंद करें", as: "নেভিগেশ্বন বন্ধ কৰক", bn: "নেভিগেশন বন্ধ করুন" },
  "Toggle navigation": { hi: "नेविगेशन टॉगल करें", as: "নেভিগেশ্বন টগল কৰক", bn: "নেভিগেশন টগল করুন" },

  /* ---------------- header ---------------- */
  "NER Early Warning & Landslide Risk Monitoring Center": {
    hi: "पूर्वोत्तर प्रारंभिक चेतावनी एवं भूस्खलन जोखिम निगरानी केंद्र",
    as: "উত্তৰ-পূৰ্বাঞ্চলৰ আগতীয়া সতৰ্কতা আৰু ভূমিধস বিপদ নিৰীক্ষণ কেন্দ্ৰ",
    bn: "উত্তর-পূর্ব প্রারম্ভিক সতর্কতা ও ভূমিধস ঝুঁকি পর্যবেক্ষণ কেন্দ্র",
  },
  "SYNCING…": { hi: "सिंक हो रहा है…", as: "সিংক হৈছে…", bn: "সিঙ্ক হচ্ছে…" },
  "NO SYNC YET": { hi: "अभी कोई सिंक नहीं", as: "এতিয়াও সিংক নহয়", bn: "এখনো সিঙ্ক হয়নি" },
  "DATA STALE": { hi: "डेटा अप्रचलित", as: "ডেটা পুৰণা", bn: "ডেটা পুরনো" },
  SYNCED: { hi: "सिंक हुआ", as: "সিংক হৈছে", bn: "সিঙ্ক হয়েছে" },
  "SIMULATION ACTIVE": { hi: "सिमुलेशन सक्रिय", as: "সিমুলেশ্বন সক্ৰিয়", bn: "সিমুলেশন সক্রিয়" },
  "Run Emergency Scenario": {
    hi: "आपातकालीन परिदृश्य चलाएँ",
    as: "জৰুৰীকালীন পৰিস্থিতি চলাওক",
    bn: "জরুরি পরিস্থিতি চালান",
  },
  "Sign out": { hi: "साइन आउट", as: "सাইন आउट", bn: "সাইন আউট" },
  GUEST: { hi: "अतिथि", as: "অতিথি", bn: "অতিথি" },
  Cancel: { hi: "रद्द करें", as: "বাতিল কৰক", bn: "বাতিল" },
  "CONFIRM — START SIMULATION": {
    hi: "पुष्टि करें — सिमुलेशन शुरू करें",
    as: "নিশ্চিত কৰক — সিমুলেশ্বন আৰম্ভ কৰক",
    bn: "নিশ্চিত করুন — সিমুলেশন শুরু করুন",
  },
  "Run Emergency Scenario?": {
    hi: "आपातकालीन परिदृश्य चलाएँ?",
    as: "জৰুৰীকালীন পৰিস্থিতি চলাবনে?",
    bn: "জরুরি পরিস্থিতি চালাবেন?",
  },
  "SIMULATION MODE": { hi: "सिमुलेशन मोड", as: "সিমুলেশ্বন মোড", bn: "সিমুলেশন মোড" },
  "This runs a scripted simulation inside the platform. No SMS, email, siren or any real notification is sent to anyone.": {
    hi: "यह प्लेटफ़ॉर्म के अंदर एक स्क्रिप्टेड सिमुलेशन चलाता है। किसी को कोई SMS, ईमेल, सायरन या वास्तविक सूचना नहीं भेजी जाती।",
    as: "এই প্লেটফৰ্মৰ ভিতৰতে এটা স্ক্ৰিপ্টেড সিমুলেশ্বন চলোৱা হয়। কাকো কোনো SMS, ইমেইল, চাইৰেন বা প্ৰকৃত জাননী পঠোৱা নহয়।",
    bn: "এই প্ল্যাটফর্মের ভিতরে একটি স্ক্রিপ্টেড সিমুলেশন চলে। কাউকে কোনো SMS, ইমেইল, সাইরেন বা প্রকৃত বিজ্ঞপ্তি পাঠানো হয় না।",
  },
  "Risk scores on affected locations will change over successive steps.": {
    hi: "प्रभावित स्थानों पर जोखिम स्कोर क्रमिक चरणों में बदलेंगे।",
    as: "পৰৱৰ্তী পদক্ষেপসমূহত প্ৰভাৱিত স্থানৰ বিপদ স্ক'ৰ সলনি হ'ব।",
    bn: "পরবর্তী ধাপগুলোতে প্রভাবিত স্থানগুলোর ঝুঁকি স্কোর পরিবর্তন হবে।",
  },
  "Simulated alerts and timeline events are generated and stored.": {
    hi: "सिम्युलेटेड अलर्ट और टाइमलाइन घटनाएँ उत्पन्न होकर संग्रहीत की जाती हैं।",
    as: "সিমুলেটেড সতৰ্কতা আৰু টাইমলাইন ঘটনাসমূহ সৃষ্টি কৰি সংৰক্ষণ কৰা হয়।",
    bn: "সিমুলেটেড সতর্কতা ও টাইমলাইন ঘটনা তৈরি করে সংরক্ষণ করা হয়।",
  },
  "Every simulated alert is flagged SIMULATED_LOCAL.": {
    hi: "हर सिम्युलेटेड अलर्ट को SIMULATED_LOCAL चिह्नित किया जाता है।",
    as: "প্ৰতিটো সিমুলেটেড সতৰ্কতাক SIMULATED_LOCAL বুলি চিহ্নিত কৰা হয়।",
    bn: "প্রতিটি সিমুলেটেড সতর্কতা SIMULATED_LOCAL হিসেবে চিহ্নিত হয়।",
  },
  "Current state": { hi: "वर्तमान स्थिति", as: "বৰ্তমান অৱস্থা", bn: "বর্তমান অবস্থা" },
  "EMERGENCY SCENARIO": {
    hi: "आपातकालीन परिदृश्य",
    as: "জৰুৰীকালীন পৰিস্থিতি",
    bn: "জরুরি পরিস্থিতি",
  },
  Pause: { hi: "रोकें", as: "বিৰাম", bn: "বিরতি" },
  Resume: { hi: "फिर से शुरू करें", as: "পুনৰ আৰম্ভ", bn: "পুনরায় শুরু" },
  Reset: { hi: "रीसेट", as: "ৰিচেট", bn: "রিসেট" },
  STEP: { hi: "चरण", as: "ধাপ", bn: "ধাপ" },
  "Scripted simulation — risk changes, alerts and timeline events are synthetic and flagged SIMULATED_LOCAL. No real notifications are delivered.": {
    hi: "स्क्रिप्टेड सिमुलेशन — जोखिम परिवर्तन, अलर्ट और टाइमलाइन घटनाएँ कृत्रिम हैं और SIMULATED_LOCAL चिह्नित हैं। कोई वास्तविक सूचना नहीं भेजी जाती।",
    as: "স্ক্ৰিপ্টেড সিমুলেশ্বন — বিপদ পৰিৱৰ্তন, সতৰ্কতা আৰু টাইমলাইন ঘটনাসমূহ কৃত্তিম আৰু SIMULATED_LOCAL বুলি চিহ্নিত। কোনো প্ৰকৃত জাননী প্ৰদান কৰা নহয়।",
    bn: "স্ক্রিপ্টেড সিমুলেশন — ঝুঁকি পরিবর্তন, সতর্কতা ও টাইমলাইন ঘটনা কৃত্রিম এবং SIMULATED_LOCAL হিসেবে চিহ্নিত। কোনো প্রকৃত বিজ্ঞপ্তি পাঠানো হয় না।",
  },

  /* ---------------- common UI ---------------- */
  "LOADING DATA…": { hi: "डेटा लोड हो रहा है…", as: "ডেটা ল'ড হৈছে…", bn: "ডেটা লোড হচ্ছে…" },
  "DATA UNAVAILABLE": { hi: "डेटा उपलब्ध नहीं", as: "ডেটা উপলব্ধ নহয়", bn: "ডেটা উপলব্ধ নেই" },
  Retry: { hi: "पुनः प्रयास करें", as: "পুনৰ চেষ্টা কৰক", bn: "আবার চেষ্টা করুন" },
  "NO RECORDS FOUND": { hi: "कोई रिकॉर्ड नहीं मिला", as: "কোনো ৰেকৰ্ড পোৱা নগ'ল", bn: "কোনো রেকর্ড পাওয়া যায়নি" },
  SOURCE: { hi: "स्रोत", as: "উৎস", bn: "উৎস" },
  "LAST UPDATED": { hi: "अंतिम अपडेट", as: "শেষ আপডেট", bn: "সর্বশেষ আপডেট" },
  "DATA AGE": { hi: "डेटा आयु", as: "ডেটা সময়", bn: "ডেটা সময়" },
  STATUS: { hi: "स्थिति", as: "অৱস্থা", bn: "অবস্থা" },

  /* ---------------- notices ---------------- */
  "PROTOTYPE MODEL": { hi: "प्रोटोटाइप मॉडल", as: "প্ৰট'টাইপ মডেল", bn: "প্রোটোটাইপ মডেল" },
  "PROTOTYPE DISCLOSURE": { hi: "प्रोटोटाइप प्रकटीकरण", as: "প্ৰট'টাইপ প্ৰকাশ", bn: "প্রোটোটাইপ প্রকাশ" },

  /* ---------------- page titles ---------------- */
  // Note: most titles are the same strings already translated in the sidebar
  // section above (the dictionary is keyed by the English text), so only
  // titles that do NOT appear in the sidebar live here.
  "Situation Overview": { hi: "स्थिति अवलोकन", as: "পৰিস্থিতি অৱলোকন", bn: "পরিস্থিতি সারসংক্ষেপ" },
  "404 — Not Found": { hi: "404 — पेज नहीं मिला", as: "404 — পোৱা নগ'ল", bn: "404 — পাওয়া যায়নি" },

  /* ---------------- auth pages ---------------- */
  "SIGN IN": { hi: "प्रवेश करें", as: "প্ৰৱেশ কৰক", bn: "প্রবেশ করুন" },
  "CREATE ACCOUNT": { hi: "खाता बनाएँ", as: "একাউণ্ট সৃষ্টি কৰক", bn: "অ্যাকাউন্ট তৈরি করুন" },
  Email: { hi: "ईमेल", as: "ইমেইল", bn: "ইমেইল" },
  Password: { hi: "पासवर्ड", as: "পাছৱৰ্ড", bn: "পাসওয়ার্ড" },
  Name: { hi: "नाम", as: "নাম", bn: "নাম" },
  "Confirm password": { hi: "पासवर्ड की पुष्टि करें", as: "পাছৱৰ্ড নিশ্চিত কৰক", bn: "পাসওয়ার্ড নিশ্চিত করুন" },
  "Sign in": { hi: "प्रवेश करें", as: "প্ৰৱেশ কৰক", bn: "প্রবেশ করুন" },
  "Create account": { hi: "खाता बनाएँ", as: "একাউণ্ট সৃষ্টি কৰক", bn: "অ্যাকাউন্ট তৈরি করুন" },
  "Don't have an account? Create one": {
    hi: "खाता नहीं है? खाता बनाएँ",
    as: "একাউণ্ট নাই? এটা সৃষ্টি কৰক",
    bn: "অ্যাকাউন্ট নেই? একটি তৈরি করুন",
  },
  "Already have an account? Sign in": {
    hi: "पहले से खाता है? प्रवेश करें",
    as: "আগৰ পৰা একাউণ্ট আছে? প্ৰৱেশ কৰক",
    bn: "আগে থেকে অ্যাকাউন্ট আছে? প্রবেশ করুন",
  },
  "DISASTER RESPONSE COMMAND CENTER": {
    hi: "आपदा प्रतिक्रिया कमान केंद्र",
    as: "দুৰ্যোগ মোকাবিলা কমান্ড কেন্দ্ৰ",
    bn: "দুর্যোগ মোকাবিলা কমান্ড সেন্টার",
  },
  "DEMO ACCESS — SEEDED ACCOUNTS": {
    hi: "डेमो पहुँच — सीडेड खाते",
    as: "ডেমো প্ৰৱেশ — বীজিত একাউণ্ট",
    bn: "ডেমো অ্যাক্সেস — সিডেড অ্যাকাউন্ট",
  },
  ADMIN: { hi: "व्यवस्थापक", as: "প্ৰশাসক", bn: "অ্যাডমিন" },
  ANALYST: { hi: "विश्लेषक", as: "বিশ্লেষক", bn: "বিশ্লেষক" },
  VIEWER: { hi: "दर्शक", as: "দৰ্শক", bn: "দর্শক" },
  "FIELD OFFICER": { hi: "फ़ील्ड अधिकारी", as: "ক্ষেত্ৰ বিষয়া", bn: "ফিল্ড অফিসার" },
  "Minimum 8 characters": { hi: "कम से कम 8 अक्षर", as: "অন্তত ৮টা আখৰ", bn: "অন্তত ৮টি অক্ষর" },
  "Passwords do not match": { hi: "पासवर्ड मेल नहीं खाते", as: "পাছৱৰ্ড মিল নহয়", bn: "পাসওয়ার্ড মিলছে না" },
  "Signing in…": { hi: "प्रवेश हो रहा है…", as: "প্ৰৱেশ হৈ আছে…", bn: "প্রবেশ হচ্ছে…" },
  "Creating account…": { hi: "खाता बन रहा है…", as: "একাউണ্ট সৃষ্টি হৈ আছে…", bn: "অ্যাকাউন্ট তৈরি হচ্ছে…" },
};

export function translate(lang: Lang, key: string): string {
  if (lang === "en") return key;
  const entry = DICT[key];
  return entry ? entry[lang] : key;
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const LangContext = createContext<LangContextValue>({
  lang: "en",
  setLang: () => undefined,
  t: (key: string) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Returns the current language + setter. */
export function useLang(): Pick<LangContextValue, "lang" | "setLang"> {
  const ctx = useContext(LangContext);
  return { lang: ctx.lang, setLang: ctx.setLang };
}

/** Returns a translate function bound to the current language. */
export function useT(): (key: string) => string {
  return useContext(LangContext).t;
}