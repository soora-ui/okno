import type { BrandFontFinding } from "@/lib/brand-theme/analysis";
import type { BrandThemeVersion } from "@/lib/brand-theme/drafts";
import type { BrandMaterialKind } from "@/lib/brand-theme/materials";
import type { StoredBrandMaterial } from "@/lib/brand-theme/storage";
import type { FileRowState } from "@/components/brand-style/ui";

// Состояние мастера фирменного стиля. Файлы живут на сервере (brand_materials),
// здесь — только их строки на экране и id.

export type WizardStep =
  | "choice" // 4.2
  | "brandbook" // 4.3
  | "describe" // 4.4
  | "logo" // 4.5
  | "review" // 4.6
  | "generating" // 4.7
  | "palettes" // 4.8
  | "preview" // 4.10–4.11, 4.13
  | "manual" // 4.12
  | "done"; // 4.13 «Стиль применён»

export type UploadItem = {
  key: string;
  kind: BrandMaterialKind;
  name: string;
  size: number;
  isPdf: boolean;
  state: FileRowState;
  material: StoredBrandMaterial | null;
  // Локальное превью загруженной картинки (object URL) — только в этой
  // вкладке; у восстановленных из черновика файлов его нет.
  previewUrl?: string;
};

export type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; fonts: BrandFontFinding[]; readable: boolean }
  | { status: "error"; message: string };

export type WizardData = {
  path: "brandbook" | "describe" | null;
  uploads: UploadItem[];
  analysis: AnalysisState;
  hexColors: string[];
  colorWords: string;
  moods: string[];
  wishes: string;
  logoId: string | null;
  logoDarkId: string | null;
  preferredFonts: { heading: string | null; body: string | null };
  rightsAccepted: boolean;
};

export type WizardResults = {
  // Варианты текущей генерации (4.8) и все версии, к которым можно
  // вернуться в превью (4.10, «Вариант 1 · 2 · 3»).
  variants: BrandThemeVersion[];
  selectedId: string | null;
};

export const emptyWizardData: WizardData = {
  path: null,
  uploads: [],
  analysis: { status: "idle" },
  hexColors: [],
  colorWords: "",
  moods: [],
  wishes: "",
  logoId: null,
  logoDarkId: null,
  preferredFonts: { heading: null, body: null },
  rightsAccepted: false,
};

export const stepNumber: Record<WizardStep, number> = {
  choice: 1,
  brandbook: 1,
  describe: 1,
  logo: 2,
  review: 3,
  generating: 4,
  palettes: 4,
  preview: 5,
  manual: 5,
  done: 5,
};

export const stepLabels = ["Материалы", "Логотип и примеры", "Пожелания", "Палитра", "Превью"];

export function uploadedIds(uploads: UploadItem[], kinds?: BrandMaterialKind[]) {
  return uploads
    .filter((item) => item.material && item.state.status === "uploaded" && (!kinds || kinds.includes(item.kind)))
    .map((item) => item.material!.id);
}
