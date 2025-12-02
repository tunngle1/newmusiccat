export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string; // Display format "3:45"
  coverUrl: string;
  genre: string;
}

export interface Playlist {
  id: string;
  title: string;
  coverUrl: string;
  trackIds: string[];
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrackId: string | null;
  progress: number;
  volume: number;
}
