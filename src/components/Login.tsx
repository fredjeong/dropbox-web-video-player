import { LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const handleLogin = async () => {
    try {
      const response = await fetch('/api/auth/url');
      const { url } = await response.json();
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      
      if (!authWindow) {
        alert('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
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
      </div>
    </div>
  );
}
