import { Button } from "@/components/ui/Button";

export interface CTABannerProps {
  heading: string;
  description: string;
  buttonLabel: string;
  onButtonClick?: () => void;
}

export function CTABanner({
  heading,
  description,
  buttonLabel,
  onButtonClick,
}: CTABannerProps) {
  return (
    <section className="flex flex-col items-center gap-6 bg-brand-near-black px-6 py-16 text-center md:px-24 md:py-16">
      <h2 className="text-[length:var(--font-size-h1)] font-bold text-white">
        {heading}
      </h2>
      <p className="max-w-2xl text-lg text-brand-light-gray">
        {description}
      </p>
      <Button variant="primary" onClick={onButtonClick}>
        {buttonLabel}
      </Button>
    </section>
  );
}
