import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="spinner"
      className={cn(
        "h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
