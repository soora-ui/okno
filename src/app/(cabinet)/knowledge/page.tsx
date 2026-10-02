import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { KnowledgeBaseTour } from "@/components/tour/knowledge-base-tour";
import { knowledgeBaseChapters } from "@/components/tour/knowledge-base-script";
import { Badge } from "@/components/ui/badge";

type KnowledgePageProps = {
  searchParams: Promise<{ chapter?: string }>;
};

function parseChapter(value: string | undefined) {
  if (value === undefined) return null;
  const index = Number(value) - 1;
  return Number.isInteger(index) && index >= 0 && index < knowledgeBaseChapters.length
    ? index
    : null;
}

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const { chapter } = await searchParams;
  const selected = parseChapter(chapter);

  if (selected !== null) {
    return (
      <div className="py-4">
        <KnowledgeBaseTour chapter={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-4">
      <div className="max-w-2xl space-y-3">
        <Badge tone="accent">База знаний</Badge>
        <h1 className="text-4xl font-semibold text-ink">Как всё настроить</h1>
        <p className="text-base leading-7 text-ink-soft">
          Короткие туры по настройкам: где что лежит и на что влияет. Показываем на
          демо-кабинете — твои настройки при этом не меняются.
        </p>
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {knowledgeBaseChapters.map((item, index) => (
          <li key={item.title}>
            <Link
              href={`/knowledge?chapter=${index + 1}`}
              className="card-hover group flex h-full flex-col gap-4 rounded-card border border-line p-6 shadow-card transition active:scale-[0.99]"
              style={{ backgroundColor: "var(--ui-card-bg)" }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium uppercase tracking-[0.2em] text-muted">
                  Глава {index + 1}
                </span>
                <span className="text-xs text-muted">
                  {item.steps} {item.steps === 1 ? "шаг" : item.steps < 5 ? "шага" : "шагов"}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                <h2 className="text-xl font-semibold text-ink">{item.title}</h2>
                <p className="text-sm leading-6 text-ink-soft">{item.summary}</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                <BookOpen size={16} className="text-accent-deep" />
                Смотреть
                <ArrowRight
                  size={16}
                  className="transition duration-300 group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
