type VideoSource = "local" | "stash";

interface VideoMetadataArtifact {
  id: number;
  name: string;
}

type VideoMetadataPerformer = VideoMetadataArtifact & {
  gender: string;
};

export interface VideoMetadata {
  description: string;
  duration: number; // in seconds
  mimeCodec: string;
  oCounter: number;
  performers: VideoMetadataPerformer[];
  tags: VideoMetadataArtifact[];
  studio: VideoMetadataArtifact;
  playCount: number;
  resolution: string; // e.g., "1920x1080"
  title: string;
}

export interface LibraryVideo {
  id: number;
  source: VideoSource;
  path: string;
  thumbnailPath: string;
  metadata: VideoMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type VideoMimeType =
  | ["3gp", "video/3gpp"]
  | ["avi", "video/x-msvideo"]
  | ["flv", "video/x-flv"]
  | ["mov", "video/quicktime"]
  | ["mp4", "video/mp4"]
  | ["mpeg", "video/mpeg"]
  | ["mpg", "video/mpeg"]
  | ["mkv", "video/x-matroska"]
  | ["ogv", "video/ogg"]
  | ["webm", "video/webm"]
  | ["wmv", "video/x-ms-wmv"];
