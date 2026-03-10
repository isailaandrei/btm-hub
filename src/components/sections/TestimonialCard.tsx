import Image from "next/image";

export interface TestimonialCardProps {
  quote: string;
  authorName: string;
  authorDetail: string;
  avatarUrl?: string;
}

export function TestimonialCard({
  quote,
  authorName,
  authorDetail,
  avatarUrl,
}: TestimonialCardProps) {
  return (
    <article className="flex flex-col gap-6 rounded-xl border border-brand-border bg-white p-8">
      <blockquote className="text-base text-brand-secondary">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div className="flex items-center gap-4">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={authorName}
            width={44}
            height={44}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-full bg-brand-cyan-blue-gray" />
        )}
        <div className="flex flex-col gap-1">
          <span className="text-base font-bold text-brand-text">
            {authorName}
          </span>
          <span className="text-sm text-brand-light-gray">
            {authorDetail}
          </span>
        </div>
      </div>
    </article>
  );
}
