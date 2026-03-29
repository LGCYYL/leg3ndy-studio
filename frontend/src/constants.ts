import type { MediaMode, SortBy } from './types';

export const API_BASE_URL = 'http://127.0.0.1:5000';

export const CAROUSEL_SLIDES = [
  {
    title: 'Multi-Source Engine',
    description: 'Cole links do YouTube ou Spotify. Baixe músicas e vídeos de onde você quiser.',
    color: '#1db954',
    image: 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?q=80&w=2070'
  },
  {
    title: 'LEG3NDY Studio',
    description: 'O downloader mais potente do mercado. Agora com suporte a playlists, Full HD (1080p) e conversão de áudio sem perdas.',
    color: '#3b82f6',
    image: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=2070&auto=format&fit=crop'
  },
  {
    title: 'Áudio de Alta Fidelidade',
    description: 'Extraia músicas com metadados, capa do álbum e qualidade cristalina automaticamente.',
    color: '#f97316',
    image: 'https://images.unsplash.com/photo-1535905557558-afc4877a26fc?q=80&w=1974&auto=format&fit=crop'
  },
  {
    title: 'Fila Inteligente',
    description: 'Adicione vários vídeos e baixe tudo de uma vez enquanto você joga ou trabalha.',
    color: '#8b5cf6',
    image: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop'
  }
] as const;

export const PLAYLIST_QUALITIES: Record<MediaMode, Array<{ value: string; label: string }>> = {
  video: [
    { value: '1080p', label: 'Full HD (1080p)' },
    { value: '720p', label: 'HD (720p)' },
    { value: '480p', label: 'Leve (480p)' }
  ],
  audio: [
    { value: '320kbps', label: 'Alta Qualidade (320kbps)' },
    { value: '192kbps', label: 'Padrão (192kbps)' },
    { value: '128kbps', label: 'Leve (128kbps)' }
  ]
};

export const SORT_LABELS: Record<SortBy, string> = {
  date: 'Por data',
  size: 'Por tamanho',
  name: 'Por nome',
  type: 'Por tipo'
};
