// Поиск по карте сервиса для AI-поддержки okno.business (НЕ путать с
// AI-консультантом, который отвечает клиентам мастера по услугам —
// см. src/lib/service-manuals.ts).
//
// Схема выдачи в промпт двухуровневая и это осознанный размен токенов:
//   1. index — по строке на КАЖДУЮ тему карты (название + путь). Всегда
//      целиком. Стоит копейки, но гарантирует, что бот никогда не скажет
//      «такой функции нет» про существующую фичу — худший сорт ответа
//      поддержки.
//   2. topics — полные блоки (шаги, нюансы) только для тем, релевантных
//      конкретному вопросу. Здесь и экономятся токены.
//
// Ранжирование — примитивное скоринговое совпадение подстрок, без эмбеддингов:
// тем всего несколько десятков, а ключи в карте хранятся стемами («предоплат»),
// что закрывает русскую морфологию достаточно точно для этой задачи. Интерфейс
// `SupportKnowledgeSource` оставлен точкой расширения: когда тем станут сотни,
// сюда подставляется векторный поиск без изменений в prompt.ts и роуте.

import {
  SUPPORT_SITEMAP,
  getSupportTopic,
  renderTopicDetails,
  renderTopicIndexLine,
  type SupportTopic,
} from "@/lib/support-assistant/sitemap";

export type SupportKnowledge = {
  /** Строки индекса по всем темам карты — в промпт идут целиком. */
  index: string[];
  /** Подробные блоки по темам, релевантным вопросу. */
  topics: SupportTopic[];
};

export type SupportKnowledgeSource = {
  /**
   * Возвращает знания для system prompt. Без запроса (или если ничего не
   * совпало) отдаёт индекс и набор базовых тем — бот всё равно сможет
   * сориентировать пользователя по разделам.
   */
  retrieve: (
    query?: string,
    options?: SupportRetrieveOptions,
  ) => Promise<SupportKnowledge> | SupportKnowledge;
};

export type SupportRetrieveOptions = {
  /**
   * Предыдущие реплики разговора одной строкой. Уточняющий вопрос («а сколько
   * живёт эта ссылка?») сам по себе темы не называет — она осталась в прошлом
   * вопросе. Контекст добавляет очки темам прошлых реплик, но с половинным
   * весом, чтобы новый вопрос на другую тему не тонул в старой.
   */
  context?: string;
};

const CONTEXT_SCORE_WEIGHT = 0.5;

// Сколько тем разворачивать подробно. 6 прямых попаданий + связанные темы
// дают ~1.5–2k токенов контекста — заметно меньше, чем вся карта целиком,
// и при этом почти всегда содержат нужный ответ.
const MAX_DIRECT_TOPICS = 5;
const MAX_TOTAL_TOPICS = 8;

// Отсечка слабых совпадений: тема проходит, только если набрала хотя бы такую
// долю от лучшего результата. Без неё частотные слова («клиент», «запись»)
// протаскивают половину карты — вопрос про отмену записи тянул за собой и
// чаевые, и буфер между записями.
const RELATIVE_SCORE_CUTOFF = 0.6;

// Связанные темы разворачиваем только у самых точных попаданий — иначе
// хвост слабых совпадений тащит свои связи и контекст распухает вдвое.
const RELATED_EXPANSION_DEPTH = 2;

// Что показать, когда вопрос ещё не задан или совсем не распознан.
const FALLBACK_TOPIC_IDS = ["cabinet-structure", "settings-tabs", "plans", "trial"];

// Слова, которые есть почти в каждом вопросе и потому ничего не различают.
const STOP_WORDS = new Set([
  "как",
  "где",
  "что",
  "это",
  "для",
  "мне",
  "меня",
  "могу",
  "можно",
  "нужно",
  "надо",
  "есть",
  "быть",
  "или",
  "если",
  "при",
  "так",
  "все",
  "всё",
  "они",
  "она",
  "оно",
  "мой",
  "моя",
  "мои",
  "тут",
  "там",
  "чтобы",
  "сделать",
  "настроить",
  "включить",
  "почему",
  "какой",
  "какая",
  "какие",
  "okno",
  "окно",
]);

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/gi, " ");
}

// Русские окончания режем грубым усечением: для скоринга по подстрокам
// точность словоформы не нужна, достаточно общего корня.
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, word.length - 2) : word;
}

function scoreTopic(topic: SupportTopic, normalizedQuery: string, words: string[]): number {
  let score = 0;

  // Ключи карты — самый надёжный сигнал: они подобраны под реальные
  // формулировки пользователей («аванс», «депозит» → предоплата).
  for (const keyword of topic.keywords) {
    const parts = keyword.split(" ");
    // Составной ключ матчим по частям, а не целой строкой: «удал аккаунт»
    // должен срабатывать на «как удалить аккаунт», где между словами стоит
    // окончание. Порядок слов при этом не важен — пользователи пишут
    // и «цену поменять», и «поменять цену».
    if (!parts.every((part) => normalizedQuery.includes(part))) {
      continue;
    }
    // Составной ключ точнее одиночного («оплата заранее» против «тг»).
    score += parts.length > 1 ? 6 : 4;
  }

  const haystack = normalize(`${topic.title} ${topic.path} ${topic.answer}`);
  for (const word of words) {
    const root = stem(word);
    if (root.length < 3) {
      continue;
    }
    if (haystack.includes(root)) {
      score += 2;
    }
  }

  return score;
}

function collectWithRelated(ranked: SupportTopic[]): SupportTopic[] {
  const selected: SupportTopic[] = [];
  const seen = new Set<string>();

  const push = (topic: SupportTopic | undefined) => {
    if (!topic || seen.has(topic.id) || selected.length >= MAX_TOTAL_TOPICS) {
      return;
    }
    seen.add(topic.id);
    selected.push(topic);
  };

  ranked.forEach(push);
  // Один шаг по связям: вопрос про предоплату почти всегда упирается в
  // ЮKassa, и лучше отдать её сразу, чем ловить второй круг переписки.
  for (const topic of selected.slice(0, RELATED_EXPANSION_DEPTH)) {
    topic.related?.forEach((id) => push(getSupportTopic(id)));
  }

  return selected;
}

function queryWords(normalizedQuery: string): string[] {
  return normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function retrieve(query?: string, options?: SupportRetrieveOptions): SupportKnowledge {
  const index = SUPPORT_SITEMAP.map(renderTopicIndexLine);

  const trimmed = query?.trim();
  if (!trimmed) {
    return {
      index,
      topics: FALLBACK_TOPIC_IDS.map(getSupportTopic).filter(
        (topic): topic is SupportTopic => Boolean(topic),
      ),
    };
  }

  const normalizedQuery = normalize(trimmed);
  const words = queryWords(normalizedQuery);

  const context = options?.context?.trim();
  const normalizedContext = context ? normalize(context) : "";
  const contextWords = context ? queryWords(normalizedContext) : [];

  const scored = SUPPORT_SITEMAP.map((topic) => ({
    topic,
    score:
      scoreTopic(topic, normalizedQuery, words) +
      (context
        ? CONTEXT_SCORE_WEIGHT * scoreTopic(topic, normalizedContext, contextWords)
        : 0),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const bestScore = scored[0]?.score ?? 0;
  const ranked = scored
    .filter((entry) => entry.score >= bestScore * RELATIVE_SCORE_CUTOFF)
    .slice(0, MAX_DIRECT_TOPICS)
    .map((entry) => entry.topic);

  if (ranked.length === 0) {
    // Совпадений нет — вопрос, скорее всего, размытый. Индекса хватит, чтобы
    // бот предложил уточняющие варианты вместо выдумывания ответа.
    return {
      index,
      topics: FALLBACK_TOPIC_IDS.map(getSupportTopic).filter(
        (topic): topic is SupportTopic => Boolean(topic),
      ),
    };
  }

  return { index, topics: collectWithRelated(ranked) };
}

export const sitemapSupportKnowledgeSource: SupportKnowledgeSource = { retrieve };

// Точка расширения: подменяется на настоящий retrieval (эмбеддинги, векторный
// поиск) без изменений в вызывающем коде.
export const supportKnowledgeSource: SupportKnowledgeSource =
  sitemapSupportKnowledgeSource;

export { renderTopicDetails };
