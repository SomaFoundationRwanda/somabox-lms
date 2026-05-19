
'use client'
import { useRouter, useParams } from 'next/navigation';
import { useContext, useEffect, useState, useMemo } from 'react';
import HeaderSection from '@/components/ui/HeaderSection';
import { Book, Video } from 'lucide-react';
import { AudioFile, BookOutlined, HomeFilled, SentimentVeryDissatisfied } from '@mui/icons-material';
import ContentCard from '@/components/ui/ContentCard';
import DataContext from '@/context/DataContext';
import { useLanguage } from '@/context/LanguageContext';
import { Button } from '@/components/ui/button';
import UniversalPlayerModal from '@/components/ui/UniversalPlayerModal';
import Typography from '@/components/ui/Typography';

// --- Helpers moved outside for performance and cleaner component scope ---

const getTypeIcon = (type) => {
  switch (type) {
    case 'video': return <Video />;
    case 'book': return <Book />;
    case 'audio': return <AudioFile />;
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

const getTranslatedTitle = (slug, t, summaryData = null) => {
  if (!slug) return '';
  const lastSegment = slug.includes('/') ? slug.split('/').pop() : slug;
  const translationKey = `educationLevels.${lastSegment}`;
  const translation = t(translationKey);

  if (translation !== translationKey) return translation;

  if (summaryData && summaryData[slug]?.title) return summaryData[slug].title;

  return lastSegment.replace(/-/g, ' ').toUpperCase();
};

// --- Sub-components ---

function ContentDisplayPage({ levelInfo, breadcrumbs, onBreadcrumbClick }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const { t } = useLanguage();
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

  const filteredContent = useMemo(() => {
    if (!levelInfo?.content) return [];
    return activeFilter === 'all'
      ? levelInfo.content
      : levelInfo.content.filter(item => item.type === activeFilter);
  }, [activeFilter, levelInfo?.content]);

  if (!levelInfo) {
    return (
      <div className="min-h-screen flex-1 bg-slate-200 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-600">{t("notFound")}</h2>
          <p className="text-gray-500 mt-2">{t("notContent")}</p>
        </div>
      </div>
    );
  }

  const hasContent = levelInfo.content && levelInfo.content.length > 0;
  const hasItems = levelInfo.items && levelInfo.items.length > 0;

  const filterOptions = [
    { key: 'all', label: t("all"), icon: <BookOutlined /> },
    { key: 'video', label: t("videos"), icon: <Video /> },
    { key: 'book', label: t("books"), icon: <Book /> },
    { key: 'audio', label: t("audio"), icon: <AudioFile /> }
  ];

  const handleItemClick = (item) => {
    setSelectedMedia(item);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen flex-1 bg-slate-200">
      <HeaderSection
        title={getTranslatedTitle(levelInfo.slug, t)}
        subtitle={hasContent ? t("learningResources") : t("contentArea")}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={onBreadcrumbClick}
      />

      <main className="flex-1 py-4 mt-[8rem] md:mt-0 md:mb-0 mb-[5rem] md:py-6 mx-3 flex rounded-xl bg-accent-background">
        <UniversalPlayerModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedMedia(null);
          }}
          mediaItem={selectedMedia}
        />
        <div className="flex-1 p-4">
          {hasContent ? (
            <div className="space-y-6">
              <div className="sticky top-0 z-30 -mx-3 px-3 bg-slate-200/80 backdrop-blur-md py-4 border-b border-black/5 md:border-none md:bg-transparent md:static md:p-0">
                <div className="flex overflow-x-auto scrollbar-hide gap-2 bg-accent-light p-2 md:p-3 rounded-2xl md:rounded-full">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.key}
                      variant="ghost"
                      onClick={() => setActiveFilter(option.key)}
                      className={`px-5 py-2 rounded-full cursor-pointer font-bold transition-all duration-300 flex items-center gap-2 whitespace-nowrap shrink-0 border-none ring-0 hover:ring-0 h-10 md:h-12 ${activeFilter === option.key
                        ? 'bg-white text-accent-dark shadow-lg scale-105'
                        : 'text-white hover:bg-white/10'
                        }`}
                    >
                      <span className="opacity-80">{option.icon}</span>
                      <Typography weight="bold" color={activeFilter === option.key ? "accent" : "white"} className="text-sm md:text-base">
                        {option.label}
                      </Typography>
                      {option.key !== 'all' && (
                        <span className={`text-[10px] md:text-xs px-2 py-0.5 rounded-full font-black ${activeFilter === option.key ? 'bg-accent-light text-white' : 'bg-white/20 text-white'}`}>
                          {levelInfo.content.filter(item => item.type === option.key).length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:px-10 2xl:px-20 gap-6">
                {filteredContent.map((item) => (
                  <div key={item.id} onClick={() => handleItemClick(item)} className="bg-white rounded-lg shadow-md flex flex-col justify-between overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer">
                    <div className="relative">
                      {item.type === 'video' && (
                        <div className="w-full h-48 bg-black flex items-center justify-center">
                          <Video className="text-white opacity-50" size={48} />
                        </div>
                      )}
                      {item.type === 'book' && (
                        <img
                          src={`${SERVER_URL}/pdf-book-covers${item.url.replace(/\.pdf$/i, '.avif')}`}
                          alt={item.title}
                          className="w-full h-48 object-cover p-4"
                          onError={(e) => {
                            e.target.src = '/images/book-cover.svg';
                            e.target.onerror = null;
                          }}
                        />
                      )}
                      {item.type === 'audio' && (
                        <div className="w-full h-48 bg-slate-100 flex items-center justify-center">
                          <AudioFile className="text-slate-400" size={48} />
                        </div>
                      )}

                      <div className="absolute top-2 left-2">
                        <span className={`px-2 py-1 flex items-center gap-1 rounded-full text-xs font-medium ${getTypeBadgeColor(item.type)}`}>
                          {getTypeIcon(item.type)} {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                        </span>
                      </div>

                      {(item.duration || item.pages) && (
                        <div className="absolute bottom-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-xs">
                          {item.duration || `${item.pages} pages`}
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col gap-2">
                      <Typography variant="h4" className="line-clamp-1">{item.title}</Typography>
                      <Typography variant="body" color="muted" className="line-clamp-2">{item.description}</Typography>

                      <Button
                        variant="outline"
                        width="full"
                        className="bg-primary-500/10 text-primary-700 border-none hover:bg-primary-500/20 mt-2"
                      >
                        {item.type === 'video' ? 'Watch' : item.type === 'book' ? 'Read' : 'Listen'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredContent.length === 0 && (
                <div className="bg-white rounded-lg p-12 text-center">
                  <SentimentVeryDissatisfied className="text-gray-300 text-6xl mb-4" />
                  <Typography variant="h3" color="muted" className="mb-2">No content found</Typography>
                  <Typography variant="body" color="muted">No {activeFilter === 'all' ? '' : activeFilter} content available for this topic.</Typography>
                </div>
              )}
            </div>
          ) : (
            hasItems ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 lg:px-10 2xl:px-20">
                {levelInfo.items.map((item, index) => (
                  <ContentCard
                    key={index}
                    title={item.title}
                    image='/imageFallback.png'
                    colorClass={item.colorClass}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg p-8 shadow-md">
                <Typography variant="h1" className="mb-4">{levelInfo.title}</Typography>
                <Typography variant="body" color="muted">Content for {levelInfo.title} is being prepared.</Typography>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
}

// --- Main Page Export ---

export default function DynamicContentPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug || [];
  const [currentLevel, setCurrentLevel] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const { t } = useLanguage();
  const { summaryData, customContentSummary } = useContext(DataContext);

  const dataSource = useMemo(() => {
    return slug[0] === 'custom-content' ? customContentSummary : summaryData;
  }, [slug, summaryData, customContentSummary]);

  useEffect(() => {
    if (!slug || slug.length === 0) {
      router.push('/');
      return;
    }

    if (!dataSource) return;

    const fullLevelKey = slug.join('/');
    const levelData = dataSource[fullLevelKey];

    if (!levelData) {
      setCurrentLevel(null);
      return;
    }

    const crumbs = [{ name: <HomeFilled />, path: '/' }];
    let currentPath = '';

    slug.forEach((segment, index) => {
      const currentFullSlug = slug.slice(0, index + 1).join('/');
      currentPath += `/${segment}`;

      const displayName = getTranslatedTitle(currentFullSlug, t, dataSource);

      crumbs.push({ name: displayName, path: currentPath });
    });

    setBreadcrumbs(crumbs);
    setCurrentLevel(levelData);
  }, [slug, dataSource, router, t]);

  if (!currentLevel && dataSource) {
    return (
      <div className="min-h-screen flex-1 bg-slate-200 flex items-center justify-center">
        <div className="text-center p-8">
          <SentimentVeryDissatisfied className="text-slate-300 text-6xl mb-4" />
          <h2 className="text-xl font-semibold text-slate-600">{t("notFound")}</h2>
          <p className="text-slate-500 mt-2">{t("thePath")} "/{slug.join('/')}" {t("doesNotExist")}.</p>
          <Button
            variant="default"
            onClick={() => router.push('/')}
            className="mt-6 px-8"
          >
            {t("goHOme")}
          </Button>
        </div>
      </div>
    );
  }

  if (!currentLevel) return null; // Still loading dataSource

  const isDeepestLevel = !currentLevel.items?.length || currentLevel.isContentLevel;

  if (isDeepestLevel) {
    return (
      <ContentDisplayPage
        levelInfo={currentLevel}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={(path) => router.push(path)}
      />
    );
  }

  return (
    <div className="min-h-screen flex-1 bg-slate-200">
      <HeaderSection
        title={getTranslatedTitle(currentLevel.slug, t, summaryData)}
        subtitle={currentLevel.subtitle || t("exploreTopics")}
        breadcrumbs={breadcrumbs}
        onBreadcrumbClick={(path) => router.push(path)}
      />

      <main className="flex-1 py-4 mt-[8rem] md:mt-0 md:mb-0 mb-[5rem] md:py-6 mx-3 flex rounded-xl bg-accent-background">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 lg:px-10 2xl:px-20 gap-6 p-4 w-full">
          {currentLevel.items.map((item, index) => (
            <div
              key={index}
              onClick={() => router.push(`/${item.slug}`)}
              className="cursor-pointer"
            >
              <ContentCard
                title={item.title}
                image='/imageFallback.png'
                colorClass={item.colorClass}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}