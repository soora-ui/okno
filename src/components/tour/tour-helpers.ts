/**
 * Поиск блоков на странице внутри устройства тура. Сценарии сцен описывают
 * цель словами интерфейса («карточка „Услуги“», «поле „Окно записи“»), а не
 * хрупкими CSS-путями: вёрстка меняется чаще, чем подписи.
 */

/** Что подсвечивать: CSS-селектор (берётся первый видимый) или поиск по документу. */
export type Target = string | ((doc: Document) => Element | null | undefined);

export const isVisible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

const area = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
};

export const CARD_SELECTOR =
  '[class*="rounded-card"], [class*="rounded-section"], [class*="rounded-panel"], [class*="rounded-nested"]';

/** Первый видимый элемент по селектору. */
export const visible =
  (selector: string): Target =>
  (doc) =>
    [...doc.querySelectorAll(selector)].find(isVisible);

/** Карточка кабинета по её заголовку. */
export const card =
  (heading: string): Target =>
  (doc) =>
    [...doc.querySelectorAll("h1, h2, h3")]
      .filter(isVisible)
      .find((el) => el.textContent?.trim() === heading)
      ?.closest('[class*="rounded-card"]');

/** Самый тесный видимый блок по селектору, в котором встречается текст. */
export const containing =
  (text: string, selector: string): Target =>
  (doc) =>
    [...doc.querySelectorAll(selector)]
      .filter((el) => isVisible(el) && el.textContent?.includes(text))
      .sort((a, b) => area(a) - area(b))[0];

/**
 * Поле формы по подписи: ближайший к подписи блок, в котором уже есть само
 * поле ввода — так подсветка берёт и подпись, и поле, и пояснение под ним.
 */
export const field =
  (label: string): Target =>
  (doc) => {
    const labelEl = [...doc.querySelectorAll("label, span, p, legend")]
      .filter(isVisible)
      .find((el) => el.textContent?.trim() === label);
    let node = labelEl?.parentElement ?? null;
    while (node && node !== doc.body) {
      if (node.querySelector("input, select, textarea")) return node;
      node = node.parentElement;
    }
    return null;
  };

/** Карточка клиента в списке по имени. */
export const clientCard = (name: string): Target => containing(name, CARD_SELECTOR);

/** Самый тесный блок с текстом внутри карточки клиента. */
export const insideClient =
  (name: string, text: string): Target =>
  (doc) => {
    const host = clientCard(name);
    const cardEl = typeof host === "function" ? host(doc) : null;
    if (!cardEl) return null;
    return [...cardEl.querySelectorAll("*")]
      .filter((el) => isVisible(el) && el.textContent?.includes(text))
      .sort((a, b) => area(a) - area(b))
      .find((el) => el.children.length > 0 || el.tagName === "SPAN");
  };

/** Ссылка нижней панели или меню кабинета на раздел. */
export const navLink =
  (href: string): Target =>
  (doc) =>
    [...doc.querySelectorAll(`a[href="${href}"]`)].find(isVisible);
