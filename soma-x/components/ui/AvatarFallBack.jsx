import { User as PersonOutline } from "lucide-react";

const AvatarFallback = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-line rounded-full">
      <PersonOutline className="text-fg-subtle w-1/2 h-1/2" aria-hidden="true" />
    </div>
  );
};

export default AvatarFallback;
