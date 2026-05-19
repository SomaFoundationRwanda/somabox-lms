import { Button } from "../ui/button";
import Typography from "../ui/Typography";

const Unauthorized = () => {
    return ( 
        <div className="flex flex-col items-center justify-center h-[40vh]">
            <Typography >
                You are not logged in. Please log in to access the admin portal
            </Typography>
            <a href="/login">
            {/* Skip keyboard focus */}
                <Button tabIndex={-1} >
                    Login
                </Button>
            </a>
        </div>
    );
}

export default Unauthorized;