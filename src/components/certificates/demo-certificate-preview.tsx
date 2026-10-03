import { formatCurrency } from "@/lib/mock-data";

export type DemoCertificateDesign = {
  primaryColor: string;
  secondaryColor: string;
  studioName: string;
  tagline: string;
};

// Детерминированный «QR»: настоящий код в демо не нужен, но и случайный
// узор от рендера к рендеру прыгал бы.
const QR_SIZE = 9;
const qrCells = Array.from({ length: QR_SIZE * QR_SIZE }, (_, index) => {
  const x = index % QR_SIZE;
  const y = Math.floor(index / QR_SIZE);
  const finder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5);
  return finder || (x * 7 + y * 13 + x * y) % 3 === 0;
});

/**
 * Сертификат, нарисованный прямо на странице, — для туров. Настоящий шаблон
 * генерирует Claude и рендерит сервер (src/lib/certificates); в демо так
 * делать нельзя, а показать результат нужно.
 */
export function DemoCertificatePreview({
  design,
  masterName,
  amount,
  code,
  className = "",
}: {
  design: DemoCertificateDesign;
  masterName: string;
  amount?: number;
  code?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex aspect-[35/24] w-full flex-col justify-between overflow-hidden rounded-tight p-[6%] ${className}`}
      style={{ backgroundColor: design.secondaryColor, color: design.primaryColor }}
    >
      <div
        className="pointer-events-none absolute -right-[18%] -top-[30%] aspect-square w-[60%] rounded-full opacity-15"
        style={{ backgroundColor: design.primaryColor }}
      />
      <div className="relative">
        <p className="text-[0.55em] font-medium uppercase tracking-[0.24em] opacity-70">
          {design.studioName || masterName}
        </p>
        <p className="mt-[2%] text-[1.15em] font-semibold leading-tight">Подарочный сертификат</p>
        {design.tagline ? <p className="mt-[1%] text-[0.6em] opacity-75">{design.tagline}</p> : null}
      </div>
      <div className="relative flex items-end justify-between gap-[4%]">
        <div>
          <p className="text-[1.6em] font-semibold leading-none">
            {amount ? formatCurrency(amount) : "5 000 ₽"}
          </p>
          <p className="mt-[3%] text-[0.55em] opacity-70">на любую услугу · {masterName}</p>
          {code ? <p className="mt-[2%] font-mono text-[0.55em] opacity-80">{code}</p> : null}
        </div>
        <div
          className="grid aspect-square w-[22%] shrink-0 gap-[4%] rounded-[6%] bg-white p-[4%]"
          style={{ gridTemplateColumns: `repeat(${QR_SIZE}, 1fr)` }}
        >
          {qrCells.map((filled, index) => (
            <span
              key={index}
              className="aspect-square"
              style={{ backgroundColor: filled ? design.primaryColor : "transparent" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
