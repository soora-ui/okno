"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importClientsAction } from "@/app/actions/client-import";
import { FormMessage } from "@/components/forms/auth-form-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClientImportError,
  extractClients,
  type ClientImportResult,
} from "@/lib/client-import/parse";
import { readSpreadsheet, SpreadsheetError } from "@/lib/client-import/spreadsheet";

const MAX_FILE_BYTES = 12 * 1024 * 1024;
// Порциями: у server action лимит тела 1 МБ, а заметки бывают длинными.
const UPLOAD_BATCH_SIZE = 1_000;

const skipReasonLabels = {
  no_phone: "нет телефона",
  bad_phone: "странный номер",
  duplicate: "повтор в файле",
} as const;

function maskPhone(phone: string) {
  return `+${phone.slice(0, phone.length - 4).replace(/\d(?=\d{3})/g, "•")}${phone.slice(-4)}`;
}

function ClientImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ClientImportResult | null>(null);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, startImport] = useTransition();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isImporting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, isImporting]);

  async function handleFile(file: File) {
    setFileName(file.name);
    setPreview(null);
    setMessage(null);
    setDone(false);

    if (file.size > MAX_FILE_BYTES) {
      setMessage({ text: "Файл больше 12 МБ — разбейте его на части.", success: false });
      return;
    }

    setIsReading(true);
    try {
      const rows = await readSpreadsheet(await file.arrayBuffer(), file.name);
      const result = extractClients(rows);

      if (result.clients.length === 0) {
        setMessage({ text: "В файле не нашлось клиентов с корректным телефоном.", success: false });
      }
      setPreview(result);
    } catch (error) {
      const known = error instanceof SpreadsheetError || error instanceof ClientImportError;
      setMessage({
        text: known ? error.message : "Не получилось прочитать файл. Подойдёт .xlsx или .csv.",
        success: false,
      });
    } finally {
      setIsReading(false);
    }
  }

  function handleImport() {
    if (!preview || preview.clients.length === 0) return;

    startImport(async () => {
      let added = 0;
      let alreadyExisted = 0;

      for (let index = 0; index < preview.clients.length; index += UPLOAD_BATCH_SIZE) {
        const result = await importClientsAction(preview.clients.slice(index, index + UPLOAD_BATCH_SIZE));

        if (!result.success) {
          setMessage({
            text: added > 0 ? `Добавили ${added}, потом ошибка: ${result.message}` : result.message,
            success: false,
          });
          router.refresh();
          return;
        }

        added += result.added;
        alreadyExisted += result.alreadyExisted;
      }

      setMessage({
        success: true,
        text:
          added > 0
            ? `Готово: добавили ${added}.${alreadyExisted > 0 ? ` Ещё ${alreadyExisted} уже были в базе — их не трогали.` : ""}`
            : "Все клиенты из файла уже есть в вашей базе.",
      });
      setDone(true);
      router.refresh();
    });
  }

  const skippedByReason = preview
    ? preview.skipped.reduce<Record<string, number>>((acc, item) => {
        acc[item.reason] = (acc[item.reason] ?? 0) + 1;
        return acc;
      }, {})
    : {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(25,26,23,0.26)] px-3 py-6 sm:px-6"
      onClick={() => !isImporting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Перенос клиентов из другой программы"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-section border border-line bg-surface shadow-ink"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-ink">Перенести клиентов</h2>
            <p className="text-sm text-ink-soft">Из YCLIENTS, DIKIDI или своей таблицы</p>
          </div>
          <Button variant="secondary" onClick={onClose} className="px-4" disabled={isImporting}>
            Закрыть
          </Button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          <section className="space-y-3 rounded-nested border border-line bg-panel p-4 text-sm leading-6 text-ink-soft">
            <p>
              <span className="font-medium text-ink">YCLIENTS:</span> «Клиентская база» → «Операции с Excel» →
              «Выгрузить в Excel». Ссылка на файл придёт на почту.
            </p>
            <p>
              <span className="font-medium text-ink">DIKIDI:</span> «Клиенты» → «Список клиентов» → «⋯» в правом
              верхнем углу → Excel или CSV.
            </p>
            <p>
              <span className="font-medium text-ink">Своя таблица:</span> нужны колонки «Имя» и «Телефон». Email, дату
              рождения и комментарий сохраним в заметку к клиенту.
            </p>
          </section>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isReading || isImporting}
            className="flex w-full items-center gap-3 rounded-panel border border-dashed border-line bg-panel/55 px-4 py-5 text-left transition hover:border-ink/40 disabled:opacity-60"
          >
            <FileSpreadsheet size={22} className="shrink-0 text-ink-soft" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">
                {isReading ? "Читаю файл..." : fileName ?? "Выбрать файл .xlsx или .csv"}
              </span>
              <span className="block text-xs text-muted">
                {fileName ? "Нажмите, чтобы выбрать другой" : "Файл читается прямо в браузере"}
              </span>
            </span>
          </button>

          {preview && preview.clients.length > 0 ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">Найдено клиентов: {preview.clients.length}</Badge>
                {Object.entries(skippedByReason).map(([reason, count]) => (
                  <Badge key={reason} tone="neutral">
                    Пропустим {count}: {skipReasonLabels[reason as keyof typeof skipReasonLabels]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted">Колонки: {preview.detectedColumns.join(", ")}</p>
              <div className="overflow-hidden rounded-panel border border-line">
                {preview.clients.slice(0, 5).map((client) => (
                  <div
                    key={client.phone}
                    className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{client.name}</p>
                      {client.notes ? (
                        <p className="truncate text-xs text-muted">{client.notes.replace(/\n/g, " · ")}</p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm text-ink-soft">{maskPhone(client.phone)}</p>
                  </div>
                ))}
                {preview.clients.length > 5 ? (
                  <p className="px-4 py-2 text-xs text-muted">и ещё {preview.clients.length - 5}</p>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-muted">
                Клиентов, которые уже есть у вас в okno (с тем же номером), не трогаем.
              </p>
            </section>
          ) : null}

          {message ? <FormMessage message={message.text} success={message.success} /> : null}

          {preview && preview.clients.length > 0 && !done ? (
            <Button onClick={handleImport} disabled={isImporting} className="w-full gap-2 disabled:opacity-60">
              <Upload size={16} />
              {isImporting ? "Переношу..." : `Добавить ${preview.clients.length} в мою базу`}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ClientImportButton({
  variant = "secondary",
  label = "Перенести клиентов",
}: {
  variant?: "primary" | "secondary";
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} className="gap-2">
        <Upload size={16} />
        {label}
      </Button>
      {open ? <ClientImportDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}
