import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Campo({
  id,
  label,
  ayuda,
  className,
  children,
}: {
  id: string;
  label: string;
  ayuda?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border border-input bg-card text-base outline-none transition-colors focus-visible:border-foreground focus-visible:ring-3 focus-visible:ring-marca/25 md:text-sm";

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select className={cn(CONTROL, "h-11 appearance-none pr-10 pl-3.5")} {...props} />
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-24 px-3.5 py-2.5", className)} {...props} />;
}
