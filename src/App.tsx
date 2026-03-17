import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import Login from './components/Login';
import VideoGrid from './components/VideoGrid';
import VideoPlayer from './components/VideoPlayer';
import { ToastProvider } from './components/Toast';
import { VideoItem } from './types';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const scrollPosRef = useRef(0);

  // Check server-side session status on mount
  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setIsAuthenticated(data.authenticated))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsLoading(false));

    // Listen for OAuth popup success (no token in message anymore)
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsAuthenticated(true);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSelectVideo = (video: VideoItem) => {
    scrollPosRef.current = window.scrollY;
    // Persist lastViewedAt to localStorage
    const viewed: Record<string, string> = JSON.parse(localStorage.getItem('lastViewed') || '{}');
    viewed[video.id] = new Date().toISOString();
    localStorage.setItem('lastViewed', JSON.stringify(viewed));

    const updatedVideos = videos.map(v =>
      v.id === video.id ? { ...v, lastViewedAt: viewed[video.id] } : v
    );
    setVideos(updatedVideos);
    setCurrentVideo(video);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setIsAuthenticated(false);
    setVideos([]);
  };

  // Restore scroll position when returning to VideoGrid
  useLayoutEffect(() => {
    if (!currentVideo && isAuthenticated) {
      window.scrollTo(0, scrollPosRef.current);
    }
  }, [currentVideo, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <ToastProvider>
      {!isAuthenticated ? (
        <Login onLogin={() => setIsAuthenticated(true)} />
      ) : currentVideo ? (
        <VideoPlayer video={currentVideo} onBack={() => setCurrentVideo(null)} />
      ) : (
        <VideoGrid
          videos={videos}
          setVideos={setVideos}
          onSelectVideo={handleSelectVideo}
          onLogout={handleLogout}
        />
      )}
    </ToastProvider>
  );
}
