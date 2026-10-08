import React, { useState, useRef, useEffect, useContext } from 'react';
import { X, Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward, FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MediaAccessNotice, useMediaAccess } from '@/components/guest/MediaAccess';

const UniversalPlayerModal = ({
    isOpen,
    onClose,
    mediaItem = null
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [pdfPage, setPdfPage] = useState(1);
    const [pdfZoom, setPdfZoom] = useState(1);

    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const modalRef = useRef(null);

    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL

    // Helper function to construct full URL
    const getMediaUrl = (url) => {
        if (!url) return '';
        // If URL already starts with http or is a direct API route, return as is
        if (url.startsWith('http') || url.includes('/library/file/') || url.includes('/content/files/')) return url;
        
        // Otherwise, prepend the base URL for static lesson files
        // Ensure no double slashes (e.g. /api/content/files//custom-content)
        const cleanUrl = url.startsWith('/') ? url : `/${url}`;
        return `${SERVER_URL}/content/files${encodeURI(cleanUrl)}`;
    };

    // Files load with the media cookie (no crossOrigin attribute, so the browser sends it).
    // Check it first: an expired cookie is renewed, or the person is asked to sign in again,
    // instead of showing a broken player or a PDF frame full of JSON.
    const mediaUrl = mediaItem?.url ? getMediaUrl(mediaItem.url) : '';
    const { state: accessState, onMediaError, reloadKey } = useMediaAccess(mediaUrl, { active: Boolean(isOpen && mediaItem) });

    // Reset state when modal opens with new media
    useEffect(() => {
        if (isOpen && mediaItem) {
            setIsPlaying(false);
            setCurrentTime(0);
            setPdfPage(1);
            setPdfZoom(1);
            setIsFullscreen(false);
        }
    }, [isOpen, mediaItem]);

    const handleClose = () => {
        setIsPlaying(false);
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        onClose();
    };

    const togglePlay = () => {
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            if (isPlaying) {
                mediaElement.pause();
            } else {
                mediaElement.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const toggleMute = () => {
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            mediaElement.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const handleVolumeChange = (e) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            mediaElement.volume = newVolume;
        }
    };

    const handleTimeUpdate = () => {
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            setCurrentTime(mediaElement.currentTime);
            setDuration(mediaElement.duration || 0);
        }
    };

    const handleSeek = (e) => {
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            const seekTime = (e.target.value / 100) * duration;
            mediaElement.currentTime = seekTime;
            setCurrentTime(seekTime);
        }
    };

    // Skip back/forward 10 seconds in the audio player.
    const skipBy = (seconds) => {
        const mediaElement = mediaItem?.type === 'video' ? videoRef.current : audioRef.current;
        if (mediaElement) {
            const max = Number.isFinite(mediaElement.duration) ? mediaElement.duration : Infinity;
            mediaElement.currentTime = Math.min(max, Math.max(0, mediaElement.currentTime + seconds));
            setCurrentTime(mediaElement.currentTime);
        }
    };

    const formatTime = (time) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
    };

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isOpen && e.key === 'Escape') {
                handleClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const renderMediaPlayer = () => {
        if (!mediaItem) return null;
        if (mediaUrl && accessState !== 'ok') {
            return (
                <div className="w-full h-full flex items-center justify-center bg-black">
                    <MediaAccessNotice state={accessState} tone="dark" />
                </div>
            );
        }

        switch (mediaItem.type) {
            case 'video':
                return (
                    <div className="relative w-full h-full bg-black overflow-hidden">
                        <video
                            key={reloadKey}
                            ref={videoRef}
                            onError={onMediaError}
                            onClick={togglePlay}
                            src={mediaUrl}
                            poster={mediaItem.thumbnail}
                            className="w-full h-full object-contain"
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleTimeUpdate}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                        {/* Video Controls Overlay */}
                        <div className="absolute inset-0 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
                            <Button variant="ghost" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="p-3 absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 bg-accent-light text-white border border-white/20 rounded-full transition-colors hover:bg-accent-light/80 ring-0 h-16 w-16">
                                {isPlaying ? <Pause size={30} /> : <Play size={30} />}
                            </Button>
                            <div className="absolute bottom-0 left-0 right-0 p-6">
                                <div className="flex items-center space-x-4 text-white">
                                    <Button variant="ghost" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="p-2 hover:bg-white/20 rounded-full transition-colors ring-0 h-10 w-10">
                                        {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                                    </Button>
                                    <div className="flex-1">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={(currentTime / duration) * 100 || 0}
                                            onChange={handleSeek}
                                            aria-label="Seek"
                                    aria-label="Seek"
                                            className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer slider"
                                        />
                                    </div>
                                    <span className="text-sm">{formatTime(currentTime)} / {formatTime(duration)}</span>
                                    <Button variant="ghost" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} aria-pressed={isMuted} className="p-2 hover:bg-white/20 rounded-full transition-colors ring-0 h-10 w-10">
                                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                    </Button>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={volume}
                                        onChange={handleVolumeChange}
                                        aria-label="Volume"
                                    aria-label="Volume"
                                        className="w-20 h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <Button variant="ghost" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Full screen"} className="p-2 hover:bg-white/20 rounded-full transition-colors ring-0 h-10 w-10">
                                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'audio':
                return (
                    <div className="flex flex-col items-center justify-center h-full bg-accent-light text-white">
                        <audio
                            key={reloadKey}
                            ref={audioRef}
                            onError={onMediaError}
                            src={mediaUrl}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={handleTimeUpdate}
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                        <div className="text-center mb-8">
                            <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-6 mx-auto backdrop-blur-sm">

                                <Volume2 size={48} className="text-white/80" />

                            </div>
                            <h3 className="font-bold mb-2">{mediaItem.title}</h3>
                            <p className="text-white/70">{mediaItem.artist || 'Audio Player'}</p>
                        </div>

                        <div className="w-full max-w-md space-y-6">
                            <div className="flex justify-center space-x-4">
                                <Button variant="ghost" onClick={() => skipBy(-10)} aria-label="Back 10 seconds" title="Back 10 seconds" className="p-3 hover:bg-white/20 rounded-full transition-colors ring-0 h-12 w-12">
                                    <SkipBack size={24} />
                                </Button>
                                <Button variant="ghost" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="p-4 bg-white/20 hover:bg-white/30 rounded-full transition-colors ring-0 h-16 w-16">
                                    {isPlaying ? <Pause size={28} /> : <Play size={28} />}
                                </Button>
                                <Button variant="ghost" onClick={() => skipBy(10)} aria-label="Forward 10 seconds" title="Forward 10 seconds" className="p-3 hover:bg-white/20 rounded-full transition-colors ring-0 h-12 w-12">
                                    <SkipForward size={24} />
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={(currentTime / duration) * 100 || 0}
                                    onChange={handleSeek}
                                    aria-label="Seek"
                                    className="w-full h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between text-sm text-white/70">
                                    <span>{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                            </div>

                            <div className="flex items-center justify-center space-x-3">
                                <Button variant="ghost" onClick={toggleMute} aria-label={isMuted ? "Unmute" : "Mute"} aria-pressed={isMuted} className="p-2 hover:bg-white/20 rounded-full transition-colors ring-0 h-10 w-10">
                                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                </Button>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={volume}
                                    onChange={handleVolumeChange}
                                    aria-label="Volume"
                                    className="w-32 h-2 bg-white/30 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>
                );

            case 'book':
            case 'pdf':
            case 'document':
                return (
                    <div className="h-full bg-black overflow-hidden">
                        <div className="h-full flex flex-col">
                            <div className="flex-1 bg-gray-50 flex items-center justify-center">
                                {mediaItem.url ? (
                                    <iframe
                                        key={reloadKey}
                                        src={mediaUrl}
                                        className="w-full h-full border-none"
                                        style={{ transform: `scale(${pdfZoom})` }}
                                        title={mediaItem.title}
                                    />
                                ) : (
                                    <div className="text-center text-gray-500">
                                        <div className="w-24 h-32 bg-white border-2 border-gray-300 rounded-lg flex items-center justify-center mx-auto mb-4 text-slate-600">
                                            <FileText size={40} />
                                        </div>
                                        <p className="text-lg font-medium">{mediaItem.title}</p>
                                        <p className="text-sm">PDF Viewer</p>
                                        <div className="flex justify-center space-x-2 mt-4">
                                            <button
                                                onClick={() => setPdfPage(Math.max(1, pdfPage - 1))}
                                                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                            >
                                                Previous
                                            </button>
                                            <span className="px-3 py-1 bg-gray-200 rounded">Page {pdfPage}</span>
                                            <button
                                                onClick={() => setPdfPage(pdfPage + 1)}
                                                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case 'click':
            case 'link':
            case 'url':
                return (
                    <div className="flex items-center justify-center h-full bg-accent-dark text-white">
                        <div className="text-center">
                            <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-6 mx-auto backdrop-blur-sm text-white">
                                <ExternalLink size={48} />
                            </div>
                            <h3 className="text-2xl font-bold mb-4">{mediaItem.title}</h3>
                            <p className="text-white/70 mb-6">External Link</p>
                            <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-6 py-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                            >
                                Open Link
                            </a>
                        </div>
                    </div>
                );

            default:
                return (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                            <p className="text-xl mb-2">Unsupported media type</p>
                            <p className="text-sm">Type: {mediaItem.type}</p>
                        </div>
                    </div>
                );
        }
    };

    // Don't render anything if not open
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 border">
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label={mediaItem?.title || 'Media Player'}
                className={`bg-black border border-primary-400/50 rounded-sm shadow-2xl transition-all duration-300 ${isFullscreen ? 'w-full h-full' : 'w-[85vw] h-[85vh]'
                    } max-w-8xl max-h-full overflow-hidden`}
                style={{
                    animation: 'modalSlideIn 0.3s ease-out'
                }}
            >
                {/* Modal Header */}
                <div className="bg-accent-dark text-white p-2 flex items-center justify-between rounded-t-sm">
                    <h2 className="font-semibold truncate mr-4">{mediaItem?.title || 'Media Player'}</h2>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        <Button
                            variant="ghost"
                            onClick={toggleFullscreen}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors ring-0 h-10 w-10"
                            title="Toggle Fullscreen"
                            aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                        >
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleClose}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors ring-0 h-10 w-10"
                            title="Close"
                            aria-label="Close"
                        >
                            <X size={24} />
                        </Button>
                    </div>
                </div>

                {/* Modal Content */}
                <div className="h-full">
                    {renderMediaPlayer()}
                </div>
            </div>

            <style jsx>{`
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
      `}</style>
        </div>
    );
};

export default UniversalPlayerModal;