import Link from "next/link";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  documentNavigation?: boolean;
};

const styles = {
  primary: {
    backgroundColor: "var(--ui-primary-bg, var(--color-ink))",
    color: "var(--ui-primary-text)",
    border: "1px solid var(--ui-primary-border, transparent)",
  },
  secondary: {
    backgroundColor: "var(--ui-secondary-bg)",
    color: "var(--ui-secondary-text, var(--color-ink))",
    border: "1px solid var(--ui-secondary-border, var(--color-line))",
  },
  ghost: {
    backgroundColor: "transparent",
    color: "var(--ui-ghost-text, var(--color-ink))",
    border: "1px solid transparent",
  },
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      data-ui-button=""
      style={styles[variant]}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]",
        className,
      )}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  documentNavigation = false,
  href,
  children,
  ...props
}: ButtonLinkProps) {
  const sharedClassName = cn(
    "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition duration-300 hover:-translate-y-0.5 active:scale-[0.98]",
    className,
  );

  if (documentNavigation) {
    return (
      <a
        href={typeof href === "string" ? href : String(href)}
        data-ui-button=""
      style={styles[variant]}
        className={sharedClassName}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href}
      data-ui-button=""
      style={styles[variant]}
      className={sharedClassName}
      {...props}
    >
      {children}
    </Link>
  );
}
