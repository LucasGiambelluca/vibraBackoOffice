import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Campo({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn("h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn("min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm", className)}
      {...props}
    />
  );
}
