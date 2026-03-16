import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { createServer as createViteServer } from 'vite';
import path from 'path';

dotenv.config();

// ─── Types ────────────────────────────────────────────────────────────────────
interface DropboxTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

// In-memory thumbnail cache (path → {data, contentType, expiresAt})
const thumbnailCache = new Map<string, { data: Buffer; contentType: string; expiresAt: number }>();
const THUMBNAIL_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Session augmentation ─────────────────────────────────────────────────────
declare module 'express-session' {
  interface SessionData {
    dropboxAccessToken?: string;
    dropboxRefreshToken?: string;
    tokenExpiresAt?: number;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.set('trust proxy', 1);

  app.use(session({
    secret: process.env.SESSION_SECRET || 'default-dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getRedirectUri = (req: express.Request) => {
    if (process.env.APP_URL) {
      return `${process.env.APP_URL.replace(/\/$/, '')}/api/auth/callback`;
    }
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}/api/auth/callback`;
  };

  const requireAuth = async (req: express.Request, res: express.Response): Promise<string | null> => {
    // Try to refresh token if expired
    if (req.session.tokenExpiresAt && Date.now() > req.session.tokenExpiresAt - 60_000) {
      if (req.session.dropboxRefreshToken) {
        const refreshed = await refreshAccessToken(req.session.dropboxRefreshToken);
        if (refreshed) {
          req.session.dropboxAccessToken = refreshed.access_token;
          req.session.tokenExpiresAt = Date.now() + (refreshed.expires_in ?? 14400) * 1000;
          await new Promise<void>((resolve) => req.session.save(() => resolve()));
        } else {
          return null;
        }
      } else {
        return null;
      }
    }
    return req.session.dropboxAccessToken ?? null;
  };

  const refreshAccessToken = async (refreshToken: string): Promise<DropboxTokenData | null> => {
    try {
      const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${process.env.DROPBOX_CLIENT_ID}:${process.env.DROPBOX_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
      const data = await res.json() as DropboxTokenData;
      return data.access_token ? data : null;
    } catch {
      return null;
    }
  };

  // ─── Auth Routes ──────────────────────────────────────────────────────────
  /** Returns the Dropbox OAuth URL */
  app.get('/api/auth/url', (req, res) => {
    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
      client_id: process.env.DROPBOX_CLIENT_ID || '',
      response_type: 'code',
      redirect_uri: redirectUri,
      token_access_type: 'offline',  // Request refresh token
    });
    res.json({ url: `https://www.dropbox.com/oauth2/authorize?${params.toString()}` });
  });

  /** OAuth callback — stores tokens in server session, never exposes them to the browser */
  app.get('/api/auth/callback', async (req, res) => {
    const { code } = req.query;
    const redirectUri = getRedirectUri(req);

    try {
      const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${process.env.DROPBOX_CLIENT_ID}:${process.env.DROPBOX_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      const data = await tokenResponse.json() as DropboxTokenData;
      if (data.access_token) {
        req.session.dropboxAccessToken = data.access_token;
        req.session.dropboxRefreshToken = data.refresh_token;
        req.session.tokenExpiresAt = data.expires_in
          ? Date.now() + data.expires_in * 1000
          : undefined;

        await new Promise<void>((resolve) => req.session.save(() => resolve()));

        // Close popup and signal success — no token in JS context
        res.send(`
          <html><body><script>
            if (window.opener) {
              window.opener.postMessage(
                { type: 'OAUTH_AUTH_SUCCESS' },
                ${JSON.stringify(getRedirectUri(req).replace('/api/auth/callback', ''))});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script><p>Authentication successful. This window should close automatically.</p></body></html>
        `);
      } else {
        res.status(400).send('Failed to get token from Dropbox.');
      }
    } catch (error) {
      console.error('Auth callback error:', error);
      res.status(500).send('Error during authentication');
    }
  });

  /** Check auth status — lets the frontend know if a session is active */
  app.get('/api/auth/status', async (req, res) => {
    const token = await requireAuth(req, res);
    res.json({ authenticated: !!token });
  });

  /** Logout — destroy session */
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });

  // ─── Video Routes ─────────────────────────────────────────────────────────
  /**
   * Fetch all valid video items via smart folder filtering:
   * Lists folders recursively. A folder is "valid" if it contains exactly 1 video file.
   * Returns folder-name as title, plus subtitle files found alongside the video.
   */
  app.get('/api/videos', async (req, res) => {
    const token = await requireAuth(req, res);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const rootPath = (req.query.path as string) || '';
    const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v']);
    const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt', 'ass', 'ssa']);

    try {
      // Collect all files recursively using list_folder
      type DropboxFileEntry = {
        '.tag': 'file' | 'folder';
        id: string;
        name: string;
        path_display: string;
        path_lower: string;
        client_modified: string;
      };

      const allFiles: DropboxFileEntry[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        let data: any;
        if (!cursor) {
          const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              path: rootPath,
              recursive: true,
              include_media_info: false,
              include_deleted: false,
            }),
          });
          data = await response.json();
        } else {
          const response = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ cursor }),
          });
          data = await response.json();
        }

        if (data.error_summary) {
          console.error('Dropbox API error:', data.error_summary);
          break;
        }

        for (const entry of (data.entries || []) as DropboxFileEntry[]) {
          if (entry['.tag'] === 'file') {
            allFiles.push(entry);
          }
        }

        hasMore = data.has_more ?? false;
        cursor = data.cursor ?? null;
      }

      // Group files by parent folder
      const byFolder = new Map<string, DropboxFileEntry[]>();
      for (const file of allFiles) {
        const folderPath = file.path_display.substring(0, file.path_display.lastIndexOf('/'));
        if (!byFolder.has(folderPath)) byFolder.set(folderPath, []);
        byFolder.get(folderPath)!.push(file);
      }

      // Filter: only folders with exactly 1 video file
      const videos = [];
      for (const [folderPath, files] of byFolder.entries()) {
        const videoFiles = files.filter(f => {
          const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
          return VIDEO_EXTENSIONS.has(ext);
        });
        if (videoFiles.length !== 1) continue;

        const videoFile = videoFiles[0];
        const videoBaseName = videoFile.name.replace(/\.[^.]+$/, ''); // strip extension

        // Find subtitle files with matching base name
        const subtitleFiles = files.filter(f => {
          const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
          return SUBTITLE_EXTENSIONS.has(ext) && f.name.startsWith(videoBaseName);
        });

        const folderName = folderPath.split('/').filter(Boolean).pop() || videoFile.name;

        videos.push({
          id: videoFile.id,
          title: folderName,
          path: videoFile.path_display,
          addedAt: videoFile.client_modified,
          thumbnailUrl: `/api/videos/thumbnail?path=${encodeURIComponent(videoFile.path_display)}`,
          videoUrl: '',
          subtitles: subtitleFiles.map(sf => {
            const ext = sf.name.split('.').pop()?.toLowerCase() ?? '';
            // Derive language from filename, e.g. "movie.ko.srt" → "ko"
            const parts = sf.name.replace(/\.[^.]+$/, '').split('.');
            const lang = parts.length > 1 ? parts[parts.length - 1] : 'und';
            const langLabels: Record<string, string> = {
              ko: '한국어', en: 'English', zh: '中文', ja: '日本語',
              fr: 'Français', es: 'Español', de: 'Deutsch',
            };
            return {
              id: sf.id,
              language: lang,
              label: langLabels[lang] ?? lang.toUpperCase(),
              path: sf.path_display,
              format: ext,
            };
          }),
        });
      }

      res.json(videos);
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      res.status(500).json({ error: 'Failed to fetch videos' });
    }
  });

  /** Proxy Dropbox thumbnail (with in-memory cache) */
  app.get('/api/videos/thumbnail', async (req, res) => {
    const token = await requireAuth(req, res);
    if (!token) return res.status(401).send('Unauthorized');
    const filePath = req.query.path as string;

    // Check cache
    const cached = thumbnailCache.get(filePath);
    if (cached && Date.now() < cached.expiresAt) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.send(cached.data);
    }

    try {
      const response = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({
            resource: { '.tag': 'path', path: filePath },
            format: 'jpeg',
            size: 'w480h320',
          }),
        },
      });

      if (!response.ok) {
        return res.redirect('https://picsum.photos/seed/video/480/320');
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Store in cache
      thumbnailCache.set(filePath, { data: buffer, contentType, expiresAt: Date.now() + THUMBNAIL_TTL_MS });

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.send(buffer);
    } catch (error) {
      res.redirect('https://picsum.photos/seed/video/480/320');
    }
  });

  /** Get a temporary streaming link for a video */
  app.get('/api/videos/stream', async (req, res) => {
    const token = await requireAuth(req, res);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });

    try {
      const response = await fetch('https://api.dropboxapi.com/2/files/get_temporary_link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: filePath }),
      });
      const data = await response.json();

      if (data.link) {
        res.json({ url: data.link });
      } else {
        res.status(404).json({ error: 'Link not found' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to get stream link' });
    }
  });

  /** Download and return a subtitle file's content */
  app.get('/api/subtitles', async (req, res) => {
    const token = await requireAuth(req, res);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const filePath = req.query.path as string;
    if (!filePath) return res.status(400).json({ error: 'Missing path' });

    try {
      const response = await fetch('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
        },
      });

      if (!response.ok) {
        return res.status(404).json({ error: 'Subtitle file not found' });
      }

      const text = await response.text();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(text);
    } catch (error) {
      console.error('Failed to fetch subtitle:', error);
      res.status(500).json({ error: 'Failed to fetch subtitle' });
    }
  });

  // ─── Vite / Static ────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
