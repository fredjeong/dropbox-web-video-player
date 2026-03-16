export interface Subtitle {
  id: string;
  language: string;
  label: string;
  url: string;       // blob URL for VTT (set on frontend after conversion)
  path?: string;     // Dropbox path for .srt files (fetched from server)
  format?: string;   // 'srt' | 'vtt' | 'ass'
  content?: string;  // raw subtitle text (used for mock data)
}

export interface VideoItem {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  duration?: string;
  subtitles?: Subtitle[];
  addedAt: string;
  lastViewedAt?: string;
  path?: string;
}
