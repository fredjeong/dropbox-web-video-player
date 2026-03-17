import { LogIn } from 'lucide-react';
import { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMessage(null);
    const authWindow = window.open('', 'oauth_popup', 'width=600,height=700');
    if (authWindow) {
      authWindow.document.title = 'Connecting to Dropbox';
      authWindow.document.body.innerHTML = '<p style="font-family: system-ui; padding: 16px;">Connecting to Dropbox...</p>';
    }
    try {
      const response = await fetch('/api/auth/url', { credentials: 'include' });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Auth URL request failed (${response.status}): ${text.slice(0, 200)}`);
      }
      const data = await response.json() as { url?: string };
      const url = data.url;
      if (!url) {
        throw new Error('Auth URL response missing "url"');
      }
      if (!authWindow) {
        window.location.href = url;
        return;
      }
      authWindow.location.href = url;
      authWindow.focus();
    } catch (error) {
      if (authWindow && !authWindow.closed) {
        authWindow.document.body.innerHTML = '<p style="font-family: system-ui; padding: 16px; color: #b91c1c;">Failed to start Dropbox login. Please try again or check server logs.</p>';
      }
      setErrorMessage('로그인 링크를 가져오지 못했습니다. Vercel 함수 로그에서 /api/auth/url 오류를 확인해주세요.');
      console.error('Failed to get auth URL', error);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-3 sm:p-6">
      <div className="max-w-md w-full bg-zinc-900 rounded-2xl p-5 sm:p-8 md:p-10 shadow-2xl border border-zinc-800 text-center">
        <div className="w-10 h-10 sm:w-16 sm:h-16 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-6 shadow-lg shadow-blue-500/20">
          <LogIn className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
        </div>
        <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-white mb-1.5 sm:mb-2">Dropbox Video Player</h1>
        <p className="text-[10px] sm:text-sm text-zinc-400 mb-5 sm:mb-8">
          Dropbox에 로그인하여 개인 비디오를 안전하게 스트리밍하세요.
        </p>
        <button
          onClick={handleLogin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-base py-2 sm:py-3 px-4 rounded-lg sm:rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Dropbox로 계속하기
        </button>
        {errorMessage && (
          <p className="mt-3 text-[11px] sm:text-sm text-red-400">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
