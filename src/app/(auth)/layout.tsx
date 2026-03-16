import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-5 py-12">
      <Link
        href="/"
        className="mb-8 text-2xl font-bold text-foreground transition-opacity hover:opacity-75"
      >
        Behind the Mask
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
