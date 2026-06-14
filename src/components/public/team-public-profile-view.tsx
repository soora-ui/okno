"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarClock, MapPin, Users2 } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { getClosestSlots } from "@/components/public/public-profile-shared";
import { getBookingThemeStyle } from "@/lib/booking-theme-presets";
import { formatCurrency, type Service } from "@/lib/mock-data";
import type { PublicPageData } from "@/lib/data";
import { getWorkspaceKindLabel } from "@/lib/workspace";

type TeamPublicProfileViewProps = {
  data: Extract<PublicPageData, { kind: "team" }>;
  homeHref: string;
};

function getServiceKey(service: Service) {
  return [service.title, service.durationMinutes, service.price].join("|");
}

export function TeamPublicProfileView({
  data,
  homeHref,
}: TeamPublicProfileViewProps) {
  const { members, profile } = data;
  const [selectionMode, setSelectionMode] = useState<"master" | "service">("master");
  const [selectedMemberId, setSelectedMemberId] = useState(members[0]?.profile.id ?? "");
  const [selectedServiceId, setSelectedServiceId] = useState(members[0]?.services[0]?.id ?? "");
  const serviceCatalog = Array.from(
    members
      .flatMap((member) => member.services)
      .reduce<
        Map<
          string,
          {
            key: string;
            title: string;
            description: string;
            durationMinutes: number;
            price: number;
            memberIds: string[];
          }
        >
      >((catalog, service) => {
        const key = getServiceKey(service);
        const existing = catalog.get(key);

        if (existing) {
          existing.memberIds.push(service.profileId);
          return catalog;
        }

        catalog.set(key, {
          key,
          title: service.title,
          description: service.description,
          durationMinutes: service.durationMinutes,
          price: service.price,
          memberIds: [service.profileId],
        });
        return catalog;
      }, new Map())
      .values(),
  );
  const [selectedCatalogKey, setSelectedCatalogKey] = useState(serviceCatalog[0]?.key ?? "");
  const [selectedCatalogMemberId, setSelectedCatalogMemberId] = useState(
    serviceCatalog[0]?.memberIds[0] ?? "",
  );

  const selectedMember = members.find((member) => member.profile.id === selectedMemberId) ?? members[0];
  const selectedMemberServices = selectedMember?.services ?? [];
  const resolvedServiceId = selectedMemberServices.some(
    (service) => service.id === selectedServiceId,
  )
    ? selectedServiceId
    : selectedMemberServices[0]?.id ?? "";
  const selectedCatalog = serviceCatalog.find((service) => service.key === selectedCatalogKey) ?? serviceCatalog[0];
  const selectedCatalogMembers = members.filter((member) =>
    member.services.some((service) => getServiceKey(service) === selectedCatalog?.key),
  );
  const resolvedCatalogMemberId = selectedCatalogMembers.some(
    (member) => member.profile.id === selectedCatalogMemberId,
  )
    ? selectedCatalogMemberId
    : selectedCatalogMembers[0]?.profile.id ?? "";
  const selectedCatalogMember =
    selectedCatalogMembers.find((member) => member.profile.id === resolvedCatalogMemberId) ??
    selectedCatalogMembers[0];

  const activeMember = selectionMode === "master" ? selectedMember : selectedCatalogMember;
  const activeService =
    selectionMode === "master"
      ? selectedMember?.services.find((service) => service.id === resolvedServiceId)
      : selectedCatalogMember?.services.find(
          (service) => getServiceKey(service) === selectedCatalog?.key,
        );
  const bookingHref =
    activeMember && activeService
      ? `/${activeMember.profile.username}/book?service=${activeService.id}`
      : `/${profile.username}`;
  const closestTeamSlots = members
    .flatMap((member) =>
      getClosestSlots(member.services, member.bookingSlotsByService).map((slot) => ({
        ...slot,
        memberName: member.profile.fullName,
        href: `/${member.profile.username}/book?service=${slot.serviceId}`,
      })),
    )
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .slice(0, 6);

  return (
    <main
      style={getBookingThemeStyle(profile.bookingThemePresetId)}
      className="relative min-h-screen overflow-x-hidden bg-[var(--color-background)] pb-28"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at top left, var(--public-glow-a), transparent 30%), radial-gradient(circle at 85% 15%, var(--public-glow-b), transparent 22%), radial-gradient(circle at bottom right, var(--public-glow-c), transparent 30%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-4 z-30 mb-8">
          <div
            className="flex items-center justify-between gap-4 rounded-full border px-4 py-3 shadow-[0_18px_50px_rgba(35,36,31,0.08)] backdrop-blur"
            style={{
              backgroundColor: "var(--public-surface-strong)",
              borderColor: "var(--public-edge)",
            }}
          >
            <BrandLogo href={homeHref} />
            <ButtonLink href={bookingHref} className="gap-2">
              Выбрать запись
              <ArrowRight size={16} />
            </ButtonLink>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <div
            className="h-full space-y-6 rounded-[36px] border p-6 shadow-[0_32px_120px_rgba(35,36,31,0.08)] backdrop-blur sm:p-8 lg:p-10"
            style={{
              backgroundColor: "var(--public-surface)",
              borderColor: "var(--public-edge)",
            }}
          >
            <div className="space-y-4">
              <Badge tone="accent">{getWorkspaceKindLabel(profile.workspaceKind)}</Badge>
              <div className="space-y-4">
                <h1 className="text-5xl font-semibold tracking-[-0.04em] text-ink sm:text-6xl">
                  {profile.workspaceName}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-base text-ink-soft sm:text-lg">
                  <span className="inline-flex items-center gap-2">
                    <Users2 size={18} />
                    {members.length} {members.length === 1 ? "мастер" : "мастеров"}
                  </span>
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-[var(--color-line)] sm:block" />
                  <span className="inline-flex items-center gap-2">
                    <BriefcaseBusiness size={18} />
                    Запись через общую публичную страницу
                  </span>
                </div>
              </div>
              <p className="max-w-2xl text-base leading-8 text-ink-soft sm:text-lg">
                Выберите мастера или нужную услугу, а затем сразу перейдите к свободным
                слотам конкретного специалиста.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div
                className="rounded-[28px] border border-line p-5"
                style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
              >
                <p className="text-sm text-muted">Активные мастера</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{members.length}</p>
              </div>
              <div
                className="rounded-[28px] border border-line p-5"
                style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
              >
                <p className="text-sm text-muted">Услуги в команде</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{serviceCatalog.length}</p>
              </div>
              <div
                className="rounded-[28px] border border-line p-5"
                style={{ backgroundColor: "var(--color-accent-soft)" }}
              >
                <p className="text-sm text-muted">Ближайшие окна</p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {closestTeamSlots.length > 0 ? "Есть онлайн" : "По запросу"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ButtonLink href={bookingHref} className="gap-2">
                Перейти к записи
                <ArrowRight size={16} />
              </ButtonLink>
              {activeMember ? (
                <ButtonLink href={`/${activeMember.profile.username}`} variant="secondary">
                  Открыть страницу мастера
                </ButtonLink>
              ) : null}
            </div>
          </div>

          <div
            className="h-full space-y-6 rounded-[36px] border p-6 shadow-[0_32px_120px_rgba(35,36,31,0.08)] backdrop-blur sm:p-8"
            style={{
              backgroundColor: "var(--public-surface-strong)",
              borderColor: "var(--public-edge)",
            }}
          >
            <div className="inline-flex rounded-full border border-line bg-[var(--ui-card-bg,#ffffff)] p-1">
              <button
                type="button"
                onClick={() => setSelectionMode("master")}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  selectionMode === "master" ? "bg-ink text-white" : "text-ink-soft"
                }`}
              >
                Сначала мастер
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode("service")}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  selectionMode === "service" ? "bg-ink text-white" : "text-ink-soft"
                }`}
              >
                Сначала услуга
              </button>
            </div>

            {selectionMode === "master" ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">Шаг 1</p>
                  <div className="grid gap-3">
                    {members.map((member) => (
                      <button
                        key={member.profile.id}
                        type="button"
                        onClick={() => setSelectedMemberId(member.profile.id)}
                        className={`rounded-[28px] border p-4 text-left transition ${
                          member.profile.id === selectedMember?.profile.id
                            ? "border-ink bg-[var(--ui-card-bg,#ffffff)]"
                            : "border-line bg-transparent hover:bg-[var(--ui-card-bg,#ffffff)]"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Image
                            src={member.profile.avatarUrl}
                            alt={member.profile.fullName}
                            width={56}
                            height={56}
                            className="h-14 w-14 rounded-full object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{member.profile.fullName}</p>
                            <p className="truncate text-sm text-ink-soft">
                              {member.profile.specialty}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">Шаг 2</p>
                  <div className="grid gap-3">
                    {selectedMemberServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => setSelectedServiceId(service.id)}
                        className={`rounded-[28px] border p-4 text-left transition ${
                          service.id === resolvedServiceId
                            ? "border-ink bg-[var(--ui-card-bg,#ffffff)]"
                            : "border-line bg-transparent hover:bg-[var(--ui-card-bg,#ffffff)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-medium text-ink">{service.title}</p>
                            <p className="text-sm leading-6 text-ink-soft">{service.description}</p>
                          </div>
                          <div className="text-right text-sm text-ink-soft">
                            <p>{service.durationMinutes} мин</p>
                            <p>{formatCurrency(service.price)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">Шаг 1</p>
                  <div className="grid gap-3">
                    {serviceCatalog.map((service) => (
                      <button
                        key={service.key}
                        type="button"
                        onClick={() => {
                          setSelectedCatalogKey(service.key);
                          setSelectedCatalogMemberId(service.memberIds[0] ?? "");
                        }}
                        className={`rounded-[28px] border p-4 text-left transition ${
                          service.key === selectedCatalog?.key
                            ? "border-ink bg-[var(--ui-card-bg,#ffffff)]"
                            : "border-line bg-transparent hover:bg-[var(--ui-card-bg,#ffffff)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-medium text-ink">{service.title}</p>
                            <p className="text-sm leading-6 text-ink-soft">
                              {service.description}
                            </p>
                          </div>
                          <div className="text-right text-sm text-ink-soft">
                            <p>{service.durationMinutes} мин</p>
                            <p>{formatCurrency(service.price)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm uppercase tracking-[0.18em] text-muted">Шаг 2</p>
                  <div className="grid gap-3">
                    {selectedCatalogMembers.map((member) => (
                      <button
                        key={member.profile.id}
                        type="button"
                        onClick={() => setSelectedCatalogMemberId(member.profile.id)}
                        className={`rounded-[28px] border p-4 text-left transition ${
                          member.profile.id === resolvedCatalogMemberId
                            ? "border-ink bg-[var(--ui-card-bg,#ffffff)]"
                            : "border-line bg-transparent hover:bg-[var(--ui-card-bg,#ffffff)]"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <Image
                            src={member.profile.avatarUrl}
                            alt={member.profile.fullName}
                            width={56}
                            height={56}
                            className="h-14 w-14 rounded-full object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{member.profile.fullName}</p>
                            <p className="truncate text-sm text-ink-soft">
                              {member.profile.specialty}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div
              className="rounded-[28px] border border-line p-5"
              style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
            >
              <p className="text-sm text-muted">Сейчас выбрано</p>
              <p className="mt-2 text-xl font-semibold text-ink">
                {activeMember?.profile.fullName ?? "Выберите мастера"}
              </p>
              {activeService ? (
                <p className="mt-1 text-sm leading-6 text-ink-soft">
                  {activeService.title} • {activeService.durationMinutes} мин •{" "}
                  {formatCurrency(activeService.price)}
                </p>
              ) : null}
              <ButtonLink href={bookingHref} className="mt-4 w-full gap-2">
                Открыть свободные окна
                <ArrowRight size={16} />
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="mt-16 space-y-6">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
              Ближайшие окна
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Кто из команды доступен в ближайшее время
            </h2>
          </div>

          {closestTeamSlots.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {closestTeamSlots.map((slot) => (
                <Link
                  key={`${slot.memberName}-${slot.serviceId}-${slot.date}-${slot.time}`}
                  href={slot.href}
                  className="rounded-[28px] border border-line p-5 shadow-[0_10px_30px_rgba(35,36,31,0.04)] transition hover:-translate-y-0.5"
                  style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
                >
                  <p className="text-sm text-muted">{slot.memberName}</p>
                  <p className="mt-2 text-xl font-semibold text-ink">{slot.serviceTitle}</p>
                  <p className="mt-3 text-sm text-ink-soft">{slot.dateLabel}</p>
                  <div className="mt-4 inline-flex rounded-full bg-panel px-4 py-2 text-sm font-medium text-ink">
                    {slot.time}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="rounded-[28px] border border-line p-6 text-sm leading-7 text-ink-soft"
              style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
            >
              Сейчас у команды нет открытых слотов на ближайшие дни. Откройте страницу
              конкретного мастера или проверьте расписание позже.
            </div>
          )}
        </section>

        <section className="mt-16 space-y-6">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted">
              Мастера
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Кто работает в {profile.workspaceName}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.map((member) => {
              const lowestPrice =
                member.services.length > 0
                  ? Math.min(...member.services.map((service) => service.price))
                  : null;

              return (
                <article
                  key={member.profile.id}
                  className="h-full rounded-[32px] border border-line p-6 shadow-[0_24px_80px_rgba(35,36,31,0.08)]"
                  style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
                >
                  <div className="flex h-full flex-col gap-5">
                    <div className="flex items-center gap-4">
                      <Image
                        src={member.profile.avatarUrl}
                        alt={member.profile.fullName}
                        width={72}
                        height={72}
                        className="h-[72px] w-[72px] rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-semibold text-ink">
                          {member.profile.fullName}
                        </h3>
                        <p className="truncate text-sm text-ink-soft">{member.profile.specialty}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm text-ink-soft">
                      <p className="inline-flex items-center gap-2">
                        <MapPin size={16} />
                        {member.profile.locationText}
                      </p>
                      <p className="inline-flex items-center gap-2">
                        <CalendarClock size={16} />
                        {member.services.length} услуг в записи
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-muted">Цена от</p>
                        <p className="text-xl font-semibold text-ink">
                          {lowestPrice !== null ? formatCurrency(lowestPrice) : "По запросу"}
                        </p>
                      </div>
                      <ButtonLink href={`/${member.profile.username}`} variant="secondary">
                        Открыть
                      </ButtonLink>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
