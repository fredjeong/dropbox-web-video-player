import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { VideoItem } from '../types';
import { Play, LogOut, Search, ArrowUpDown, RefreshCw } from 'lucide-react';
import { VideoGridSkeleton } from './Skeleton';
import { useToast } from './Toast';

interface VideoGridProps {
  videos: VideoItem[];
  setVideos: (videos: VideoItem[]) => void;
  onSelectVideo: (video: VideoItem) => void;
  onLogout: () => void;
}

const STORAGE_KEY = 'lastViewed';
const PAGE_SIZE = 50;

export default function VideoGrid({ videos, setVideos, onSelectVideo, onLogout }: VideoGridProps) {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'added' | 'title'>('added');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Merge lastViewedAt from localStorage into video list
  const mergeLastViewed = useCallback((items: VideoItem[]): VideoItem[] => {
    const viewed: Record<string, string> = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return items.map(v => ({ ...v, lastViewedAt: viewed[v.id] ?? v.lastViewedAt }));
  }, []);

  const fetchVideos = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const res = await fetch('/api/videos', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setVideos(mergeLastViewed(data));
        if (silent) showToast('비디오 목록을 새로 불러왔습니다.', 'success');
      } else if (res.status === 401) {
        onLogout();
      } else {
        showToast('비디오를 불러오지 못했습니다. 다시 시도해주세요.', 'error');
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [mergeLastViewed, onLogout, setVideos, showToast]);

  useEffect(() => {
    if (videos.length === 0) {
      fetchVideos();
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const filteredAndSortedVideos = useMemo(() => {
    let result = videos.filter(v =>
      v.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    result.sort((a, b) => {
      if (sortBy === 'recent') {
        const dateA = a.lastViewedAt ? new Date(a.lastViewedAt).getTime() : 0;
        const dateB = b.lastViewedAt ? new Date(b.lastViewedAt).getTime() : 0;
        return dateB - dateA;
      } else if (sortBy === 'added') {
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      } else {
        return a.title.localeCompare(b.title, 'ko');
      }
    });

    return result;
  }, [videos, searchQuery, sortBy]);

  // Client-side pagination
  const visibleVideos = filteredAndSortedVideos.slice(0, page * PAGE_SIZE);
  const hasMore = visibleVideos.length < filteredAndSortedVideos.length;

  // Infinite scroll
  useEffect(() => {
    if (!hasMore) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setPage(p => p + 1);
    }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  // Reset pagination on filter/sort change
  useEffect(() => { setPage(1); }, [searchQuery, sortBy]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 px-3 py-2 sm:px-6 sm:py-4 flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold tracking-tight whitespace-nowrap">My Videos</h1>
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={() => fetchVideos(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors p-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white transition-colors p-1.5 -mr-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1.5 sm:gap-3 flex-1 w-full max-w-2xl md:ml-8">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="비디오 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md sm:rounded-lg pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2.5 text-xs sm:text-sm md:text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
          </div>
          <div className="relative shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full sm:w-auto appearance-none bg-zinc-900 border border-zinc-800 rounded-md sm:rounded-lg pl-2.5 sm:pl-3 pr-8 sm:pr-9 py-1.5 sm:py-2.5 text-xs sm:text-sm md:text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="added">최근 추가된 순</option>
              <option value="recent">최근 시청한 순</option>
              <option value="title">이름순 (가-나)</option>
            </select>
            <ArrowUpDown className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400 pointer-events-none" />
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          <button
            onClick={() => fetchVideos(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            title="새로 고침"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-sm md:text-base text-zinc-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            <span>로그아웃</span>
          </button>
        </div>
      </header>

      <main className="p-3 sm:p-6 max-w-7xl mx-auto">
        {isLoading ? (
          <VideoGridSkeleton count={12} />
        ) : filteredAndSortedVideos.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-sm sm:text-base">
            {searchQuery ? '검색 결과가 없습니다.' : 'Dropbox에서 영상을 찾지 못했습니다.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-6">
              {visibleVideos.map((video) => (
                <React.Fragment key={video.id}>
                  <VideoCard video={video} sortBy={sortBy} onSelect={onSelectVideo} />
                </React.Fragment>
              ))}
            </div>
            {/* Infinite scroll sentinel */}
            {hasMore && <div ref={loadMoreRef} className="h-10" />}
          </>
        )}
      </main>
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────
function VideoCard({
  video,
  sortBy,
  onSelect,
}: {
  video: VideoItem;
  sortBy: string;
  onSelect: (v: VideoItem) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="group cursor-pointer flex flex-col gap-1.5 sm:gap-3"
      onClick={() => onSelect(video)}
    >
      <div className="relative aspect-video rounded-lg sm:rounded-xl overflow-hidden bg-zinc-800">
        {imgError ? (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <Play className="w-8 h-8 text-zinc-600" />
          </div>
        ) : (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <div className="w-8 h-8 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
            <Play className="w-4 h-4 sm:w-6 sm:h-6 text-white fill-white ml-0.5 sm:ml-1" />
          </div>
        </div>
        {video.duration && (
          <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 bg-black/80 text-white text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded font-mono">
            {video.duration}
          </div>
        )}
        {video.subtitles && video.subtitles.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 bg-blue-600/80 text-white text-[9px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded font-mono">
            CC
          </div>
        )}
      </div>
      <div className="flex flex-col px-0.5 sm:px-0">
        <h3 className="text-xs sm:text-base font-medium text-zinc-200 line-clamp-2 group-hover:text-white transition-colors leading-snug">
          {video.title}
        </h3>
        {video.lastViewedAt && sortBy === 'recent' && (
          <span className="text-[9px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1">
            최근 시청: {new Date(video.lastViewedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
        {sortBy === 'added' && (
          <span className="text-[9px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1">
            추가됨: {new Date(video.addedAt).toLocaleDateString('ko-KR')}
          </span>
        )}
      </div>
    </div>
  );
}
