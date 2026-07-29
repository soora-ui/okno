"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { QrCode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Сканирование QR-кода подарочного сертификата мастером (ТЗ 2.3). Нативный
// BarcodeDetector есть не везде (нет в Safari/iOS) — фоллбэк на jsQR
// (чистый JS, декодирует кадр с canvas), мастера пользуются и iOS, и
// Android. TS lib.dom не знает про BarcodeDetector — минимальный тип ниже.
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorConstructorLike = new (options: { formats: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorConstructor(): BarcodeDetectorConstructorLike | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructorLike })
    .BarcodeDetector;
  return ctor ?? null;
}

type VerifyResult =
  | { ok: true; amount: number; remainingAmount: number; purchasedAt: string; expiresAt: string | null; status: string }
  | { ok: false; reason: "not_found" | "expired" | "exhausted"; lastRedeemedAt?: string | null };

function parseCertificateQrValue(value: string): { certificateId: string; token: string } | null {
  try {
    const url = new URL(value);
    const token = url.searchParams.get("t");
    const segments = url.pathname.split("/").filter(Boolean);
    const certificateId = segments.at(-1);
    if (!token || !certificateId) {
      return null;
    }
    return { certificateId, token };
  } catch {
    return null;
  }
}

const reasonLabels: Record<string, string> = {
  not_found: "Сертификат не найден.",
  expired: "Срок действия сертификата истёк.",
  exhausted: "Остаток по сертификату исчерпан.",
};

function ScannerBody({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const decodedRef = useRef<{ certificateId: string; token: string } | null>(null);

  const [cameraError, setCameraError] = useState("");
  const [scanned, setScanned] = useState<{ certificateId: string; token: string } | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [writeOffAmount, setWriteOffAmount] = useState("");
  const [redeemMessage, setRedeemMessage] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const runVerify = async (payload: { certificateId: string; token: string }) => {
    setVerifying(true);
    setVerifyResult(null);
    setRedeemMessage("");
    try {
      const response = await fetch("/api/certificates/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as VerifyResult | { error: string };
      if ("error" in data) {
        setVerifyResult({ ok: false, reason: "not_found" });
      } else {
        setVerifyResult(data);
        if (data.ok) {
          setWriteOffAmount(String(data.remainingAmount));
        }
      }
    } catch {
      setVerifyResult({ ok: false, reason: "not_found" });
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError("Не получилось получить доступ к камере. Разреши доступ и попробуй снова.");
        return;
      }

      const detectorCtor = getBarcodeDetectorConstructor();
      const detector = detectorCtor ? new detectorCtor({ formats: ["qr_code"] }) : null;

      const tick = async () => {
        if (cancelled) {
          return;
        }

        const video = videoRef.current;
        if (!decodedRef.current && video && video.readyState === video.HAVE_ENOUGH_DATA) {
          try {
            let rawValue: string | null = null;

            if (detector) {
              const results = await detector.detect(video);
              rawValue = results[0]?.rawValue ?? null;
            } else {
              const canvas = canvasRef.current;
              if (canvas) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const context = canvas.getContext("2d");
                if (context) {
                  context.drawImage(video, 0, 0, canvas.width, canvas.height);
                  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                  const code = jsQR(imageData.data, imageData.width, imageData.height);
                  rawValue = code?.data ?? null;
                }
              }
            }

            if (rawValue) {
              const parsed = parseCertificateQrValue(rawValue);
              if (parsed) {
                decodedRef.current = parsed;
                setScanned(parsed);
                void runVerify(parsed);
                return;
              }
            }
          } catch {
            // Отдельный неудачный кадр — не повод останавливать сканирование.
          }
        }

        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };

      void tick();
    };

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Цикл сканирования (эффект выше) продолжает работать в фоне даже пока
  // decodedRef.current заполнен — просто пропускает распознавание кадров.
  // Сброс здесь достаточен, чтобы сканирование возобновилось само.
  const rescan = () => {
    decodedRef.current = null;
    setScanned(null);
    setVerifyResult(null);
    setRedeemMessage("");
  };

  const handleRedeem = async () => {
    if (!scanned || verifyResult?.ok !== true) return;

    const amount = Number(writeOffAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > verifyResult.remainingAmount) {
      setRedeemMessage("Проверь сумму списания.");
      return;
    }

    setRedeeming(true);
    setRedeemMessage("");
    try {
      const response = await fetch("/api/certificates/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scanned, writeOffAmount: amount }),
      });
      const data = (await response.json()) as
        | { ok: true; remainingAmount: number; status: string }
        | { ok: false; reason?: string; error?: string };

      if (data.ok) {
        setRedeemMessage(`Списано ${amount} ₽. Остаток: ${data.remainingAmount} ₽.`);
        setVerifyResult({ ...verifyResult, remainingAmount: data.remainingAmount });
        setWriteOffAmount(String(data.remainingAmount));
      } else {
        setRedeemMessage(reasonLabels[data.reason ?? ""] ?? "Не получилось списать сертификат.");
      }
    } catch {
      setRedeemMessage("Не получилось списать сертификат.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Сканировать сертификат"
      className="mx-auto flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[32px] border border-line shadow-[0_40px_120px_rgba(22,24,20,0.18)]"
      style={{ backgroundColor: "var(--ui-card-bg, #ffffff)" }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div className="flex items-center gap-3">
          <ScanLine size={18} className="text-accent-deep" />
          <h2 className="text-xl font-semibold text-ink">Сканировать сертификат</h2>
        </div>
        <Button variant="secondary" onClick={onClose} className="px-4">
          Закрыть
        </Button>
      </div>

      <div className="space-y-4 overflow-y-auto px-5 py-5">
        {!verifyResult ? (
          <div className="relative overflow-hidden rounded-[20px] bg-black">
            <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {verifying ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-sm text-white">
                Проверяю...
              </div>
            ) : null}
          </div>
        ) : null}

        {cameraError ? <p className="text-sm text-ink-soft">{cameraError}</p> : null}

        {verifyResult && !verifyResult.ok ? (
          <div className="space-y-3 rounded-[20px] border border-line bg-panel p-4">
            <p className="text-sm font-medium text-ink">{reasonLabels[verifyResult.reason]}</p>
            {verifyResult.reason === "exhausted" && verifyResult.lastRedeemedAt ? (
              <p className="text-xs text-muted">
                Последнее списание: {new Date(verifyResult.lastRedeemedAt).toLocaleDateString("ru-RU")}
              </p>
            ) : null}
            <Button variant="secondary" onClick={rescan} className="w-full justify-center">
              Сканировать еще раз
            </Button>
          </div>
        ) : null}

        {verifyResult && verifyResult.ok ? (
          <div className="space-y-4 rounded-[20px] border border-line bg-panel p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Номинал</p>
                <p className="font-semibold text-ink">{verifyResult.amount} ₽</p>
              </div>
              <div>
                <p className="text-xs text-muted">Остаток</p>
                <p className="font-semibold text-ink">{verifyResult.remainingAmount} ₽</p>
              </div>
              <div>
                <p className="text-xs text-muted">Куплен</p>
                <p className="text-ink">{new Date(verifyResult.purchasedAt).toLocaleDateString("ru-RU")}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Срок действия</p>
                <p className="text-ink">
                  {verifyResult.expiresAt
                    ? new Date(verifyResult.expiresAt).toLocaleDateString("ru-RU")
                    : "бессрочно"}
                </p>
              </div>
            </div>

            <Input
              label="Сумма списания, руб."
              type="number"
              min={1}
              max={verifyResult.remainingAmount}
              value={writeOffAmount}
              onChange={(event) => setWriteOffAmount(event.target.value)}
            />

            {redeemMessage ? <p className="text-sm text-ink-soft">{redeemMessage}</p> : null}

            <div className="flex gap-3">
              <Button onClick={handleRedeem} disabled={redeeming} className="flex-1 justify-center">
                {redeeming ? "Списываю..." : "Списать"}
              </Button>
              <Button variant="secondary" onClick={rescan}>
                Еще один
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CertificateScannerModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <>
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <QrCode size={18} className="text-accent-deep" />
          <h2 className="text-lg font-semibold text-ink">Погасить сертификат</h2>
        </div>
        <p className="text-sm leading-6 text-ink-soft">
          Отсканируй QR-код на сертификате клиента, чтобы проверить остаток и списать сумму.
        </p>
        <Button onClick={() => setIsOpen(true)} className="w-full justify-center">
          Сканировать сертификат
        </Button>
      </Card>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-5 sm:px-6 sm:py-8"
          style={{ backgroundColor: "rgba(25,26,23,0.3)" }}
          onClick={() => setIsOpen(false)}
        >
          <ScannerBody onClose={() => setIsOpen(false)} />
        </div>
      ) : null}
    </>
  );
}
