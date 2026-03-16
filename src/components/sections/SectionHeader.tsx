export interface SectionHeaderProps {
  title: string;
  description?: string;
}

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <h2 className="text-[length:var(--font-size-h1)] font-bold text-foreground">
        {title}
      </h2>
      {description && (
        <p className="max-w-3xl text-lg text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
