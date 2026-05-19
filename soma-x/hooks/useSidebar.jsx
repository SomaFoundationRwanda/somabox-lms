import { useState } from 'react';

export const useSidebar = (initialState = false) => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(initialState);
    
    const handleSideBar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };
    
    return {
        isSidebarOpen,
        handleSideBar
    };
};