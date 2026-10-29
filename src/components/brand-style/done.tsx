"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Share2 } from "lucide-react";
import { PhoneMock, type MockMaster } from "@/components/brand-style/phone-mock";
import { Button, ButtonLink } from "@/components/ui/button";
import type { BrandTheme } from "@/lib/brand-theme/schema";
import { siteUrl } from "@/config/site";
import { publicLinkHost } from "@/lib/site";

// 4.13 «Стиль применён». Спокойно, без конфетти — в духе системы.
export function DoneScreen({
  theme,
  master,
  username,
}: {
  theme: BrandTheme;
  master: MockMaster;
  username: string;
}) {
  const [copied, setCopied] = useState(false);
  const link = `${publicLinkHost}/${username}`;
  const url = `${siteUrl}/${username}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-5 text-center">
        <div className="relative">
          <PhoneMock theme={theme} scope="done" master={master} width={160} height={290} />
          <span className="absolute -bottom-3 -right-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface text-accent-deep shadow-card">
            <Check size={20} />
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-ink">Стиль применён</h1>
          <p className="text-sm text-ink-soft">
            Ваша страница записи теперь выглядит по-новому. Клиенты уже видят её такой.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pl-4 pr-1">
          <span className="min-w-0 flex-1 truncate text-left font-mono text-xs text-ink">{link}</span>
          <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={copy}>
            {copied ? "Скопировано" : "Копировать"}
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/${username}`}>Открыть мою страницу</ButtonLink>
          <Button
            variant="secondary"
            className="gap-2"
            onClick={async () => {
              if (navigator.share) {
                await navigator.share({ url }).catch(() => undefined);
              } else {
                await copy();
              }
            }}
          >
            <Share2 size={16} />
            Поделиться ссылкой
          </Button>
        </div>
        <Link href="/settings/brand-style" className="text-sm font-medium text-ink underline-offset-4 hover:underline">
          Управлять стилем
        </Link>
      </div>
    </main>
  );
}
