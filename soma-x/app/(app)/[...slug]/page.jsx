
'use client'
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useContext, useEffect, useState, useMemo } from 'react';
import HeaderSection from '@/components/ui/HeaderSection';
import Link from 'next/link';
import { Book, BookOpen, FileAudio, FolderX, Frown, Home, Video } from 'lucide-react';
import FolderCard, { folderTitle, serverAsset } from '@/components/explore/FolderCard';
import DataContext from '@/context/DataContext';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import UniversalPlayerModal from '@/components/ui/UniversalPlayerModal';
import Typography from '@/components/ui/Typography';
import { useGuestGate } from '@/components/guest/GuestGate';
import { useGuestPreview } from '@/components/guest/Preview';
import { startRouteLoading } from "@/components/global/RouteLoader";
import Loader from "@/components/ui/Loader";

// --- Helpers moved outside for performance and cleaner component scope ---

const getTypeIcon = (type) => {
  switch (type) {
    case 'video': return <Video />;
    case 'book': return <Book />;
    case 'audio': return <FileAudio />;
    default: return null;
  }
};

const getTypeBadgeColor = (type) => {
  switch (type) {
    case 'video': return 'bg-red-100 text-red-800';
    case 'book': return 'bg-blue-100 text-blue-800';
    case 'audio': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

// --- Sub-components ---

function BookCover({ item }) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? serverAsset(item.cover || item.thumbnail) : null;
  return (
    <img
      src={src || '/images/book-cover.svg'}
      alt=""
      loading="lazy"
      className="w-full h-48 object-cover p-4"
      onError={() => setFailed(true)}
    />
  );
}

function FolderPage({ levelInfo, breadcrumbs, onBreadcrumbClick }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  // A visitor's preview of the open item (null for signed-in people).
  const [preview, setPreview] = useState(null);
  const { t } = useLanguage();
  const pathname = usePathname();
  const { isGuest } = useGuestGate();
  const { open: openPreview, starting: previewStarting } = useGuestPreview();

  const content = useMemo(() => levelInfo?.content || [], [levelInfo]);
  const folders = levelInfo?.items || [];

  // Back from signing up (or logging in) to open something: ?open=<item id> opens it.
  useEffect(() => {
    if (isGuest || !content.length) return;
    let openId = null;
    try { openId = new URLSearchParams(window.location.search).get('open'); } catch { /* ignore */ }
    if (!openId) return;
    const item = content.find((entry) => String(entry.id) === openId);
    if (item) {
      setSelectedMedia(item);
      setIsModalOpen(true);
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, [isGuest, content]);

  const filteredContent = useMemo(() => (
    activeFilter === 'all' ? content : content.filter((item) => item.type === activeFilter)
  ), [activeFilter, content]);

  const hasContent = content.length > 0;
  const hasFolders = folders.length > 0;

  const filterOptions = [
    { key: 'all', label: t("all"), icon: <BookOpen /> },
    { key: 'video', label: t("videos"), icon: <Video /> },
    { key: 'book', label: t("books"), icon: <Book /> },
    { key: 'audio', label: t("audio"), icon: <FileAudio /> }
  ];

  const actionLabel = (type) => t(type === 'video' ? 'explore.watch' : type === 'book' ? 'explore.read' : 'explore.listen');

  const handleItemClick = async (item) => {
    // Guests can browse; opening a video, book or audio needs an account, or (when the school
    // allows it) starts a short preview. ?open= brings them back to it after signing up.
    const { ok, preview: started } = await openPreview(item.slug, `${pathname}?open=${encodeURIComponent(item.id)}`, item.type);
    if (!ok) return;
    setPreview(started);
    setSelectedMedia(item);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen flex-1 bg-slate-200">
      <HeaderSection
        title={folderTitle(levelInfo.slug, levelInfo.title, t)}
        subtitle={levelInfo.subtitle || (hasContent ? t("learningResources") : t("exploreTopics"))}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={onBreadcrumbClick}
      />

      <main className="flex-1 py-4 mt-[8rem] md:mt-0 md:mb-0 mb-[5rem] md:py-6 mx-3 flex rounded-xl bg-accent-background">
        <UniversalPlayerModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMedia(null);
            setPreview(null);
          }}
          mediaItem={selectedMedia}
          summaryPath={selectedMedia?.slug || null}
          preview={preview}
        />
        {previewStarting ? <Loader variant="overlay" label={t("guest.previewStarting")} /> : null}
        <div className="flex-1 p-4 space-y-8">
          {hasFolders && (
            <section aria-labelledby="explore-folders-heading" className="space-y-4">
              {hasContent && (
                <h2 id="explore-folders-heading" className="text-lg font-bold text-slate-900 xl:px-10 2xl:px-20">
                  {t("explore.foldersHeading")}
                </h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 xl:px-10 2xl:px-20">
                {folders.map((folder) => (
                  <FolderCard key={folder.slug} folder={folder} />
                ))}
              </div>
            </section>
          )}

          {hasContent && (
            <section className="space-y-6" aria-labelledby={hasFolders ? "explore-files-heading" : undefined}>
              {hasFolders && (
                <h2 id="explore-files-heading" className="text-lg font-bold text-slate-900 xl:px-10 2xl:px-20">
                  {t("explore.filesHeading")}
                </h2>
              )}
              <div className="sticky top-0 z-30 -mx-3 px-3 bg-slate-200/80 backdrop-blur-md py-4 border-b border-black/5 md:border-none md:bg-transparent md:static md:p-0">
                <div className="flex overflow-x-auto scrollbar-hide gap-2 bg-accent-light p-2 md:p-3 rounded-2xl md:rounded-full">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.key}
                      variant="ghost"
                      aria-pressed={activeFilter === option.key}
                      onClick={() => setActiveFilter(option.key)}
                      className={`px-5 py-2 rounded-full cursor-pointer font-bold transition-all duration-300 flex items-center gap-2 whitespace-nowrap shrink-0 border-none ring-0 hover:ring-0 h-10 md:h-12 ${activeFilter === option.key
                        ? 'bg-white text-accent-dark shadow-lg scale-105'
                        : 'text-white hover:bg-white/10'
                        }`}
                    >
                      <span className="opacity-80" aria-hidden="true">{option.icon}</span>
                      <Typography as="span" weight="bold" color={activeFilter === option.key ? "accent" : "white"} className="text-sm md:text-base">
                        {option.label}
                      </Typography>
                      {option.key !== 'all' && (
                        <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-black ${activeFilter === option.key ? 'bg-accent-light text-white' : 'bg-white/20 text-white'}`}>
                          {content.filter(item => item.type === option.key).length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:px-10 2xl:px-20 gap-6">
                {filteredContent.map((item) => (
                  <div key={item.id} className="relative bg-white rounded-lg shadow-md flex flex-col justify-between overflow-hidden hover:shadow-lg focus-within:ring-2 focus-within:ring-accent-dark transition-all duration-200 cursor-pointer">
                    <div className="relative">
                      {item.type === 'video' && (
                        <div className="w-full h-48 bg-black flex items-center justify-center">
                          <Video className="text-white opacity-50" size={48} />
                        </div>
                      )}
                      {item.type === 'book' && <BookCover item={item} />}
                      {item.type === 'audio' && (
                        <div className="w-full h-48 bg-slate-100 flex items-center justify-center">
                          <FileAudio className="text-slate-600" size={48} aria-hidden="true" />
                        </div>
                      )}

                      <div className="absolute top-2 left-2">
                        <span className={`px-2 py-1 flex items-center gap-1 rounded-full text-xs font-medium ${getTypeBadgeColor(item.type)}`}>
                          {getTypeIcon(item.type)} {t(`explore.types.${item.type}`) || item.type}
                        </span>
                      </div>

                      {(item.duration || item.pages) && (
                        <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-xs">
                          {item.duration || `${item.pages} ${t("explore.pages")}`}
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col gap-2">
                      <Typography variant="h6" className="line-clamp-1">{item.title}</Typography>
                      <Typography variant="body" color="muted" className="line-clamp-2">{item.description}</Typography>

                      {/* The whole card is clickable through this button (its ::after covers the card). */}
                      <Button
                        type="button"
                        variant="outline"
                        width="full"
                        onClick={() => handleItemClick(item)}
                        aria-label={`${actionLabel(item.type)}: ${item.title}`}
                        className="bg-primary-500/10 text-primary-700 border-none hover:bg-primary-500/20 mt-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                      >
                        {actionLabel(item.type)}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredContent.length === 0 && (
                <div className="bg-white rounded-lg p-12 text-center">
                  <Frown className="text-gray-500 w-14 h-14 mb-4 mx-auto" aria-hidden="true" />
                  <Typography variant="h3" color="muted" className="mb-2">{t("explore.noFilesOfType")}</Typography>
                </div>
              )}
            </section>
          )}

          {!hasContent && !hasFolders && (
            <div className="bg-white rounded-lg p-8 shadow-md">
              <Typography variant="body" color="muted">{t("explore.emptyFolder")}</Typography>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function FolderGone() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen flex-1 bg-slate-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-accent-light/10 text-accent-dark rounded-full flex items-center justify-center mx-auto mb-2">
          <FolderX className="w-9 h-9" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-800">{t("explore.goneTitle")}</h2>
          <p className="text-slate-500 leading-relaxed text-sm">{t("explore.goneText")}</p>
        </div>
        <Link
          href="/home"
          className="flex items-center justify-center w-full h-12 text-base font-bold bg-accent-dark hover:bg-black text-white transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark focus-visible:ring-offset-2"
        >
          {t("explore.backToExplore")}
        </Link>
      </div>
    </div>
  );
}

// --- Main Page Export ---

export default function DynamicContentPage() {
  const router = useRouter();
  const params = useParams();
  const slug = useMemo(() => (params.slug || []).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  }), [params.slug]);
  const { t } = useLanguage();
  const { summaryData } = useContext(DataContext);
  const fullKey = slug.join('/');

  useEffect(() => {
    if (slug.length === 0) {
      startRouteLoading();
      router.push('/');
    }
  }, [slug.length, router]);

  const levelData = summaryData ? summaryData[fullKey] : undefined;

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ name: <><Home className="w-5 h-5" aria-hidden="true" /><span className="sr-only">{t("explore.home")}</span></>, path: '/home' }];
    slug.forEach((_, index) => {
      const key = slug.slice(0, index + 1).join('/');
      crumbs.push({
        name: folderTitle(key, summaryData?.[key]?.title, t),
        path: `/${slug.slice(0, index + 1).map(encodeURIComponent).join('/')}`,
      });
    });
    return crumbs;
  }, [slug, summaryData, t]);

  if (!summaryData) return <Loader variant="page" className="min-h-[60vh]" />; // still loading the catalogue
  if (!levelData) return <FolderGone />;

  return (
    <FolderPage
      key={fullKey}
      levelInfo={levelData}
      breadcrumbs={breadcrumbs}
      onBreadcrumbClick={(path) => { startRouteLoading(); router.push(path); }}
    />
  );
}
