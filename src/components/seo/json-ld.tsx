// Структурированные данные schema.org для поисковиков и AI-поиска. Отдаём
// в серверном HTML: Яндекс рендерит JS хуже Google. «<» экранируем, чтобы
// текст из данных не закрыл тег script.
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
