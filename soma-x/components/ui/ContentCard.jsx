import Typography from "./Typography";

const ContentCard = ({ onClick, title, image, colorClass }) => {

  const generateRandomColor = () => {
    const random = () => Math.floor(Math.random() * 180); // 0–179, no bright tones
    const r = random();
    const g = random();
    const b = random();
    return `rgb(${r}, ${g}, ${b})`;
};

  const generateImageSrc = ()=>{
    if(image){
      return image
    }
    else return ('/imageFallback.png')
  }
  return (
    <div
      className={`${colorClass} rounded-lg bg-[${generateRandomColor()}] overflow-hidden cursor-pointer shadow-xl  shadow-black/5 transition-shadow max-w-sm mx-auto w-full`}
      style={{ backgroundColor: generateRandomColor() }}
    >
      <div className="aspect-[4/3] bg-cover bg-center relative" onClick={onClick} >
        <img
          src={`/imageFallback.png`}
          alt={title}
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-black/30 bg-opacity-20" />
      </div>
      <div className="px-3 py-10">
        <Typography variant={`titleInv`} color={`white`}>
          {title}
        </Typography>
      </div>
    </div>
  );
};

export default ContentCard;
