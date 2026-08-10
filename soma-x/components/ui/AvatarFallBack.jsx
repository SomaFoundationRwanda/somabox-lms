import { PersonOutline } from "@mui/icons-material";

const AvatarFallback = () => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gray-200 rounded-full">
      <PersonOutline className="text-gray-500 w-1/2 h-1/2" />
    </div>
  );
};

export default AvatarFallback;
