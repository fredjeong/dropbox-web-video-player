import { useEffect, useRef, useState, useCallback } from 'react';
import { VideoItem, Subtitle } from '../types';
import { ArrowLeft, Loader2, Languages } from 'lucide-react';
import { srtToVtt } from '../utils/srtToVtt';
import { useToast } from './Toast';

interface VideoPlayerProps {
  video: VideoItem;
  onBack: () => void;
}

// Temporary links expire after ~4 hours — refresh 5 min before expiry
const LINK_TTL_MS = 4 * 60 * 60 * 1000;
const LINK_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export default function VideoPlayer({ video, onBack }: VideoPlayerProps) {
  const { showToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [isLoadingStream, setIsLoadingStream] = useState(true);
  const [resolvedSubtitles, setResolvedSubtitles] = useState<{ url: string; label: string; language: string }[]>([]);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);
  const [showSubPanel, setShowSubPanel] = useState(false);
  const linkFetchedAt = useRef<number>(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch streaming link (with auto-refresh) ──────────────────────────────
  const fetchStreamUrl = useCallback(async (preserveTime?: number) => {
    if (!video.path) {
      setStreamUrl(video.videoUrl);
      setIsLoadingStream(false);
      return;
    }
    try {
      const res = await fetch(`/api/videos/stream?path=${encodeURIComponent(video.path)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        linkFetchedAt.current = Date.now();
        setStreamUrl(data.url);

        // Restore playback position after src change (if refreshing)
        if (preserveTime !== undefined && videoRef.current) {
          const onLoaded = () => {
            if (videoRef.current) {
              videoRef.current.currentTime = preserveTime;
              videoRef.current.play().catch(() => {});
            }
          };
          videoRef.current.addEventListener('loadedmetadata', onLoaded, { once: true });
        }

        // Schedule next refresh
        const refreshIn = LINK_TTL_MS - LINK_REFRESH_BUFFER_MS;
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => {
          const currentTime = videoRef.current?.currentTime;
          fetchStreamUrl(currentTime);
        }, refreshIn);
      } else if (res.status === 401) {
        onBack();
      } else {
        showToast('스트리밍 링크를 가져오지 못했습니다.', 'error');
        setStreamUrl(video.videoUrl);
      }
    } catch {
      showToast('네트워크 오류가 발생했습니다.', 'error');
      setStreamUrl(video.videoUrl);
    } finally {
      setIsLoadingStream(false);
    }
  }, [video, onBack, showToast]);

  useEffect(() => {
    fetchStreamUrl();
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [fetchStreamUrl]);

  // ── Fetch and convert subtitles ───────────────────────────────────────────
  useEffect(() => {
    const blobUrls: string[] = [];

    const loadSubtitles = async () => {
      const results: { url: string; label: string; language: string }[] = [];

      for (const sub of video.subtitles ?? []) {
        try {
          let vttContent: string;

          if (sub.content) {
            // Mock / inline content
            vttContent = sub.format === 'vtt' ? sub.content : srtToVtt(sub.content);
          } else if (sub.path) {
            // Fetch from server
            const res = await fetch(`/api/subtitles?path=${encodeURIComponent(sub.path)}`, {
              credentials: 'include',
            });
            if (!res.ok) continue;
            const raw = await res.text();
            vttContent = sub.format === 'vtt' ? raw : srtToVtt(raw);
          } else {
            continue;
          }

          const blob = new Blob([vttContent], { type: 'text/vtt' });
          const url = URL.createObjectURL(blob);
          blobUrls.push(url);
          results.push({ url, label: sub.label, language: sub.language });
        } catch {
          console.warn('Failed to load subtitle:', sub.label);
        }
      }

      setResolvedSubtitles(results);
      if (results.length > 0) {
        setActiveTrack(results[0].language);
      }
    };

    loadSubtitles();
    return () => blobUrls.forEach(u => URL.revokeObjectURL(u));
  }, [video]);

  // ── Sync subtitle track mode ──────────────────────────────────────────────
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const tracks = videoEl.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].language === activeTrack ? 'showing' : 'hidden';
    }
  }, [activeTrack, resolvedSubtitles]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header overlay */}
      <header className="absolute top-0 left-0 right-0 p-4 sm:p-6 z-10 bg-gradient-to-b from-black/80 to-transparent flex items-center gap-3 sm:gap-4">
        <button
          onClick={onBack}
          className="w-9 h-9 sm:w-10 sm:h-10 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <h2 className="text-white font-medium text-sm sm:text-lg drop-shadow-md flex-1 truncate">
          {video.title}
        </h2>

        {/* Subtitle language selector */}
        {resolvedSubtitles.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSubPanel(p => !p)}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-md transition-colors ${
                activeTrack
                  ? 'bg-blue-600/80 hover:bg-blue-600 text-white'
                  : 'bg-white/10 hover:bg-white/20 text-zinc-300'
              }`}
            >
              <Languages className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm font-medium hidden sm:inline">
                {activeTrack
                  ? resolvedSubtitles.find(s => s.language === activeTrack)?.label ?? '자막'
                  : '자막 꺼짐'}
              </span>
            </button>

            {showSubPanel && (
              <div className="absolute right-0 top-full mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden min-w-[140px]">
                <button
                  onClick={() => { setActiveTrack(null); setShowSubPanel(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    !activeTrack ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  꺼짐
                </button>
                {resolvedSubtitles.map(sub => (
                  <button
                    key={sub.language}
                    onClick={() => { setActiveTrack(sub.language); setShowSubPanel(false); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      activeTrack === sub.language ? 'bg-blue-600 text-white' : 'text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        {isLoadingStream ? (
          <div className="flex flex-col items-center justify-center text-white gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-zinc-400 text-sm">비디오 스트림을 불러오는 중...</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={streamUrl}
            className="w-full h-full max-h-screen object-contain"
            controls
            autoPlay
            crossOrigin="anonymous"
            onError={() => showToast('비디오를 재생하지 못했습니다.', 'error')}
          >
            {resolvedSubtitles.map((vtt, i) => (
              <track
                key={i}
                kind="subtitles"
                src={vtt.url}
                srcLang={vtt.language}
                label={vtt.label}
                default={i === 0}
              />
            ))}
          </video>
        )}
      </div>
    </div>
  );
}
