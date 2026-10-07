"""Собирает src/lib/city-catalog.json — все населённые пункты СНГ от 500 жителей.

Источник — открытая база GeoNames (CC BY 4.0). Перед запуском скачай в одну папку:
  https://download.geonames.org/export/dump/cities500.zip        (распаковать)
  https://download.geonames.org/export/dump/admin1CodesASCII.txt
  https://download.geonames.org/export/dump/alternatenames/<CC>.zip для каждой
  страны из COUNTRIES (распаковать — получатся <CC>.txt)

  python3 scripts/build-city-catalog.py <папка-с-файлами>
"""

import csv
import json
import re
import sys
from pathlib import Path

COUNTRIES = {
    "RU": "Россия",
    "BY": "Беларусь",
    "UA": "Украина",
    "KZ": "Казахстан",
    "UZ": "Узбекистан",
    "KG": "Кыргызстан",
    "TJ": "Таджикистан",
    "TM": "Туркменистан",
    "AM": "Армения",
    "AZ": "Азербайджан",
    "GE": "Грузия",
    "MD": "Молдова",
}

# Крым и Севастополь показываем как российские регионы, без страны в подписи.
REGION_OVERRIDES = {
    "UA.11": ("Республика Крым", "RU"),
    "UA.20": ("Севастополь", "RU"),
}

# Города Украины не показываем. Страна остаётся в COUNTRIES, потому что в
# GeoNames за ней числятся Крым и Севастополь — их берём через REGION_OVERRIDES.
EXCLUDED_COUNTRIES = {"UA"}

# Исторические кварталы, заброшенные и разрушенные пункты, части городов.
SKIP_FEATURES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLF"}

# Как ещё ищут крупные города.
SEARCH_ALIASES = {
    "Санкт-Петербург": ["Петербург", "Питер", "СПб"],
    "Петропавловск-Камчатский": ["Камчатка"],
    "Нижний Новгород": ["Нижний"],
    "Ростов-на-Дону": ["Ростов"],
}

CYRILLIC = re.compile(r"[А-Яа-яЁёІіЇїЄєЎўҚқҢңӨөҮүҰұҺһӘә]")
# Страны, где у всякого настоящего города есть имя на кириллице.
CYRILLIC_COUNTRIES = {"RU", "BY", "UA", "KZ", "KG", "TJ"}
FALLBACK_LANGS = {"", "uk", "be", "kk", "ky", "tg", "uz", "tk"}


LOWER_WORDS = {"Область", "Край", "Округ", "Автономный", "Автономная", "Район"}


def tidy(name):
    name = re.sub(r"^(Город|gorod)\s+", "", name.strip())
    name = re.sub(r"\s+Shahri$", "", name)
    words = name.split(" ")
    return " ".join(
        [words[0]] + [word.lower() if word in LOWER_WORDS else word for word in words[1:]]
    )


def read_tsv(path):
    with open(path, encoding="utf8", newline="") as handle:
        yield from csv.reader(handle, delimiter="\t", quoting=csv.QUOTE_NONE)


def main(source: Path):
    places = {
        row[0]: row
        for row in read_tsv(source / "cities500.txt")
        if row[8] in COUNTRIES and row[7] not in SKIP_FEATURES
    }
    admin_ids = {row[0]: row[3] for row in read_tsv(source / "admin1CodesASCII.txt")}
    wanted = set(places) | set(admin_ids.values())

    # Для каждого id — лучшее кириллическое имя: сначала русское, потом на
    # соседних языках; устаревшие (Петродворец) — только если иного нет.
    names = {}
    for code in COUNTRIES:
        for row in read_tsv(source / f"{code}.txt"):
            geoname_id, lang, name = row[1], row[2], row[3]
            if geoname_id not in wanted or len(row) < 8 or not CYRILLIC.search(name):
                continue
            if lang != "ru" and lang not in FALLBACK_LANGS:
                continue
            preferred, short, colloquial, historic = (flag == "1" for flag in row[4:8])
            if colloquial and not preferred:
                continue
            score = (not historic, lang == "ru", preferred, not short)
            if geoname_id not in names or score > names[geoname_id][0]:
                names[geoname_id] = (score, name)

    def ru_name(geoname_id, default):
        name = names[geoname_id][1] if geoname_id in names else default
        return tidy(name)

    regions, region_index = [], {}
    timezones, timezone_index = [], {}

    def intern(value, items, index):
        if value not in index:
            index[value] = len(items)
            items.append(value)
        return index[value]

    rows = []
    seen = set()
    ordered = sorted(places.values(), key=lambda row: -int(row[14] or 0))
    for row in ordered:
        geoname_id, country, admin_code, timezone = row[0], row[8], row[10], row[17]
        if geoname_id not in names and country in CYRILLIC_COUNTRIES:
            # Без кириллического имени тут остаются только дубли вроде Narian-Mar.
            continue
        name = ru_name(geoname_id, row[1])
        admin_key = f"{country}.{admin_code}"
        if country in EXCLUDED_COUNTRIES and admin_key not in REGION_OVERRIDES:
            continue
        if admin_key in REGION_OVERRIDES:
            region, shown_country = REGION_OVERRIDES[admin_key]
        else:
            admin_id = admin_ids.get(admin_key)
            region = ru_name(admin_id, "") if admin_id else ""
            shown_country = country
        if region == name:
            region = ""
        if shown_country != "RU":
            region = ", ".join(part for part in (region, COUNTRIES[shown_country]) if part)

        dedupe_key = (name.lower(), region)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)

        entry = [
            int(geoname_id),
            name,
            intern(region, regions, region_index),
            intern(timezone, timezones, timezone_index),
        ]
        if name in SEARCH_ALIASES:
            entry.append(SEARCH_ALIASES[name])
        rows.append(entry)

    out = Path(__file__).resolve().parent.parent / "src/lib/city-catalog.json"
    out.write_text(
        json.dumps({"regions": regions, "timezones": timezones, "cities": rows},
                   ensure_ascii=False, separators=(",", ":")),
        encoding="utf8",
    )
    print(f"{len(rows)} городов, {len(regions)} регионов → {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
