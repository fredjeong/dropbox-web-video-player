import { VideoItem } from './types';

const sampleSrt = `1
00:00:01,000 --> 00:00:04,000
안녕하세요! 미니멀 Dropbox 플레이어입니다.

2
00:00:05,000 --> 00:00:08,000
이것은 SRT 자막이 VTT로 변환되어
재생되는 테스트입니다.`;

export const mockVideos: VideoItem[] = [
  {
    id: '1',
    title: '가족 여행 2023.mp4',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1602081957921-9137a5d6eaee?auto=format&fit=crop&q=80&w=800',
    duration: '10:23',
    subtitles: [
      { id: 's1', language: 'ko', label: '한국어', url: '', content: sampleSrt }
    ],
    addedAt: '2023-10-01T10:00:00Z',
    lastViewedAt: '2023-10-05T14:30:00Z'
  },
  {
    id: '2',
    title: '아이들 재롱잔치.mkv',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&q=80&w=800',
    duration: '05:12',
    subtitles: [],
    addedAt: '2023-11-15T09:20:00Z'
  },
  {
    id: '3',
    title: '제주도 브이로그.mp4',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1546874177-9e664107314e?auto=format&fit=crop&q=80&w=800',
    duration: '15:45',
    subtitles: [],
    addedAt: '2023-08-20T16:45:00Z',
    lastViewedAt: '2023-12-01T08:15:00Z'
  },
  {
    id: '4',
    title: '생일 파티.mp4',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8892b12a15?auto=format&fit=crop&q=80&w=800',
    duration: '08:30',
    subtitles: [],
    addedAt: '2024-01-10T11:10:00Z'
  },
  {
    id: '5',
    title: '캠핑의 밤.mp4',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnailUrl: 'https://images.unsplash.com/photo-1504280390227-331ef290d85b?auto=format&fit=crop&q=80&w=800',
    duration: '22:10',
    subtitles: [],
    addedAt: '2023-05-05T20:00:00Z',
    lastViewedAt: '2024-02-20T22:30:00Z'
  }
];
