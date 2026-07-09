// Клиентобезопасный справочник телефонных кодов: без node-импортов,
// чтобы форма записи могла валидировать номер прямо в браузере.

export type PhoneCountry = {
  code: string;
  label: string;
  flag: string;
  placeholder: string;
  minDigits: number;
  maxDigits: number;
};

export const phoneCountries: PhoneCountry[] = [
  { code: "+7", label: "Россия / Казахстан", flag: "🇷🇺", placeholder: "978 000-00-00", minDigits: 10, maxDigits: 10 },
  { code: "+375", label: "Беларусь", flag: "🇧🇾", placeholder: "29 000-00-00", minDigits: 9, maxDigits: 9 },
  { code: "+380", label: "Украина", flag: "🇺🇦", placeholder: "50 000-00-00", minDigits: 9, maxDigits: 9 },
  { code: "+374", label: "Армения", flag: "🇦🇲", placeholder: "77 000-000", minDigits: 8, maxDigits: 8 },
  { code: "+994", label: "Азербайджан", flag: "🇦🇿", placeholder: "50 000-00-00", minDigits: 9, maxDigits: 9 },
  { code: "+995", label: "Грузия", flag: "🇬🇪", placeholder: "555 000-000", minDigits: 9, maxDigits: 9 },
  { code: "+996", label: "Кыргызстан", flag: "🇰🇬", placeholder: "700 000-000", minDigits: 9, maxDigits: 9 },
  { code: "+992", label: "Таджикистан", flag: "🇹🇯", placeholder: "90 000-00-00", minDigits: 9, maxDigits: 9 },
  { code: "+998", label: "Узбекистан", flag: "🇺🇿", placeholder: "90 000-00-00", minDigits: 9, maxDigits: 9 },
  { code: "+90", label: "Турция", flag: "🇹🇷", placeholder: "500 000-00-00", minDigits: 10, maxDigits: 10 },
  { code: "+971", label: "ОАЭ", flag: "🇦🇪", placeholder: "50 000-0000", minDigits: 8, maxDigits: 9 },
  { code: "+972", label: "Израиль", flag: "🇮🇱", placeholder: "50 000-0000", minDigits: 8, maxDigits: 9 },
];

export const defaultPhoneCountryCode = "+7";

export function getPhoneCountry(code: string) {
  return phoneCountries.find((country) => country.code === code);
}

// Приводит национальную часть к цифрам. Для +7 прощаем привычный ввод
// "8 978 ..." или "7 978 ...": лишнюю первую цифру отбрасываем.
export function nationalPhoneDigits(countryCode: string, rawNational: string) {
  let digits = rawNational.replace(/\D/g, "");

  if (countryCode === "+7" && digits.length === 11 && /^[78]/.test(digits)) {
    digits = digits.slice(1);
  }

  return digits;
}

export function isValidNationalPhone(countryCode: string, rawNational: string) {
  const digits = nationalPhoneDigits(countryCode, rawNational);
  const country = getPhoneCountry(countryCode);

  if (!country) {
    return digits.length >= 8 && digits.length <= 12;
  }

  return digits.length >= country.minDigits && digits.length <= country.maxDigits;
}

// Полный номер в международном формате: "+79780000000".
export function buildFullPhone(countryCode: string, rawNational: string) {
  return `${countryCode}${nationalPhoneDigits(countryCode, rawNational)}`;
}
