import Image from "next/image";
import Typography from "@/components/ui/Typography";

export function EmptyState({ message = "No content available yet" }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="relative w-48 h-48 opacity-80">
        <Image
          src="/images/no-contents.jpg"
          alt="No content"
          fill
          className="object-contain"
        />
      </div>
      <Typography variant="muted" className="text-sm">
        {message}
      </Typography>
    </div>
  );
}
