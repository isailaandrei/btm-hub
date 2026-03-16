import { type ReactNode } from "react";

export interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
}

export function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-xl bg-background p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-white">
        {icon}
      </div>
      <h3 className="text-[length:var(--font-size-h3)] font-bold text-foreground">
        {title}
      </h3>
      <p className="text-base text-muted-foreground">{description}</p>
    </article>
  );
}
