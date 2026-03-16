import { Spinner } from "@/components/ui/spinner";

export default function AuthLoading() {
  return (
    <div className="flex w-full items-center justify-center py-12">
      <Spinner />
    </div>
  );
}
