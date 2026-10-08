import { User as PersonOutline } from "lucide-react";

const AvatarFallback = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded-full">
      <PersonOutline className="text-gray-500 w-1/2 h-1/2" aria-hidden="true" />
    </div>
  );
};

export default AvatarFallback;
