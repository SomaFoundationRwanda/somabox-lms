import { Search } from "lucide-react";
import Input from "@/components/ui/input";

const SearchBar = ({ searchTerm, onSearchChange }) => {
    return (
        <div className="relative w-full">
            <Input
                id="search"
                type="text"
                placeholder="Search files/folders..."
                value={searchTerm}
                onChange={(value) => onSearchChange(value)}
                className="pl-10 h-10"
            />
        </div>
    );
};

export default SearchBar;
