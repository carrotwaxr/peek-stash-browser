import type { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Any: { input: any; output: any; }
  BoolMap: { input: Record<string, boolean>; output: Record<string, boolean>; }
  Int64: { input: number; output: number; }
  Map: { input: Record<string, any>; output: Record<string, any>; }
  PluginConfigMap: { input: Record<string, any>; output: Record<string, any>; }
  Time: { input: string; output: string; }
  Timestamp: { input: string; output: string; }
  Upload: { input: File; output: File; }
};

export type AddTempDlnaipInput = {
  address: Scalars['String']['input'];
  /** Duration to enable, in minutes. 0 or null for indefinite. */
  duration?: InputMaybe<Scalars['Int']['input']>;
};

export type AnonymiseDatabaseInput = {
  download?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AssignSceneFileInput = {
  file_id: Scalars['ID']['input'];
  scene_id: Scalars['ID']['input'];
};

export type AutoTagMetadataInput = {
  /** Paths to tag, null for all files */
  paths?: InputMaybe<Array<Scalars['String']['input']>>;
  /** IDs of performers to tag files with, or "*" for all */
  performers?: InputMaybe<Array<Scalars['String']['input']>>;
  /** IDs of studios to tag files with, or "*" for all */
  studios?: InputMaybe<Array<Scalars['String']['input']>>;
  /** IDs of tags to tag files with, or "*" for all */
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type AutoTagMetadataOptions = {
  /** IDs of performers to tag files with, or "*" for all */
  performers?: Maybe<Array<Scalars['String']['output']>>;
  /** IDs of studios to tag files with, or "*" for all */
  studios?: Maybe<Array<Scalars['String']['output']>>;
  /** IDs of tags to tag files with, or "*" for all */
  tags?: Maybe<Array<Scalars['String']['output']>>;
};

export type BackupDatabaseInput = {
  download?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BaseFile = {
  basename: Scalars['String']['output'];
  created_at: Scalars['Time']['output'];
  fingerprint?: Maybe<Scalars['String']['output']>;
  fingerprints: Array<Fingerprint>;
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder: Folder;
  /** @deprecated Use parent_folder instead */
  parent_folder_id: Scalars['ID']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Int64']['output'];
  updated_at: Scalars['Time']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};


export type BaseFileFingerprintArgs = {
  type: Scalars['String']['input'];
};

export type BasicFile = BaseFile & {
  basename: Scalars['String']['output'];
  created_at: Scalars['Time']['output'];
  fingerprint?: Maybe<Scalars['String']['output']>;
  fingerprints: Array<Fingerprint>;
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder: Folder;
  /** @deprecated Use parent_folder instead */
  parent_folder_id: Scalars['ID']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Int64']['output'];
  updated_at: Scalars['Time']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};


export type BasicFileFingerprintArgs = {
  type: Scalars['String']['input'];
};

export enum BlobsStorageType {
  /** Database */
  Database = 'DATABASE',
  /** Filesystem */
  Filesystem = 'FILESYSTEM'
}

export type BulkGalleryUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<BulkUpdateIds>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  scene_ids?: InputMaybe<BulkUpdateIds>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkGroupUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  containing_groups?: InputMaybe<BulkUpdateGroupDescriptionsInput>;
  director?: InputMaybe<Scalars['String']['input']>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  sub_groups?: InputMaybe<BulkUpdateGroupDescriptionsInput>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkImageUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  gallery_ids?: InputMaybe<BulkUpdateIds>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<BulkUpdateIds>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkMovieUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkPerformerUpdateInput = {
  alias_list?: InputMaybe<BulkUpdateStrings>;
  birthdate?: InputMaybe<Scalars['String']['input']>;
  career_length?: InputMaybe<Scalars['String']['input']>;
  circumcised?: InputMaybe<CircumisedEnum>;
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Scalars['String']['input']>;
  custom_fields?: InputMaybe<CustomFieldsInput>;
  death_date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  disambiguation?: InputMaybe<Scalars['String']['input']>;
  ethnicity?: InputMaybe<Scalars['String']['input']>;
  eye_color?: InputMaybe<Scalars['String']['input']>;
  fake_tits?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  gender?: InputMaybe<GenderEnum>;
  hair_color?: InputMaybe<Scalars['String']['input']>;
  height_cm?: InputMaybe<Scalars['Int']['input']>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  measurements?: InputMaybe<Scalars['String']['input']>;
  penis_length?: InputMaybe<Scalars['Float']['input']>;
  piercings?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  tattoos?: InputMaybe<Scalars['String']['input']>;
  twitter?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<BulkUpdateStrings>;
  weight?: InputMaybe<Scalars['Int']['input']>;
};

export type BulkSceneMarkerUpdateInput = {
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  primary_tag_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type BulkSceneUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  gallery_ids?: InputMaybe<BulkUpdateIds>;
  group_ids?: InputMaybe<BulkUpdateIds>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  movie_ids?: InputMaybe<BulkUpdateIds>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<BulkUpdateIds>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkStudioUpdateInput = {
  details?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  parent_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  tag_ids?: InputMaybe<BulkUpdateIds>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<BulkUpdateStrings>;
};

export type BulkTagUpdateInput = {
  aliases?: InputMaybe<BulkUpdateStrings>;
  child_ids?: InputMaybe<BulkUpdateIds>;
  description?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  parent_ids?: InputMaybe<BulkUpdateIds>;
};

export type BulkUpdateGroupDescriptionsInput = {
  groups: Array<GroupDescriptionInput>;
  mode: BulkUpdateIdMode;
};

export enum BulkUpdateIdMode {
  Add = 'ADD',
  Remove = 'REMOVE',
  Set = 'SET'
}

export type BulkUpdateIds = {
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  mode: BulkUpdateIdMode;
};

export type BulkUpdateStrings = {
  mode: BulkUpdateIdMode;
  values?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CircumcisionCriterionInput = {
  modifier: CriterionModifier;
  value?: InputMaybe<Array<CircumisedEnum>>;
};

export enum CircumisedEnum {
  Cut = 'CUT',
  Uncut = 'UNCUT'
}

export type CleanGeneratedInput = {
  /** Clean blob files without blob entries */
  blobFiles?: InputMaybe<Scalars['Boolean']['input']>;
  /** Do a dry run. Don't delete any files */
  dryRun?: InputMaybe<Scalars['Boolean']['input']>;
  /** Clean image thumbnails/clips without image entries */
  imageThumbnails?: InputMaybe<Scalars['Boolean']['input']>;
  /** Clean marker files without marker entries */
  markers?: InputMaybe<Scalars['Boolean']['input']>;
  /** Clean preview files without scene entries */
  screenshots?: InputMaybe<Scalars['Boolean']['input']>;
  /** Clean sprite and vtt files without scene entries */
  sprites?: InputMaybe<Scalars['Boolean']['input']>;
  /** Clean scene transcodes without scene entries */
  transcodes?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CleanMetadataInput = {
  /** Do a dry run. Don't delete any files */
  dryRun: Scalars['Boolean']['input'];
  paths?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ConfigDlnaInput = {
  /** True if DLNA service should be enabled by default */
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** List of interfaces to run DLNA on. Empty for all */
  interfaces?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Defaults to 1338 */
  port?: InputMaybe<Scalars['Int']['input']>;
  serverName?: InputMaybe<Scalars['String']['input']>;
  /** Order to sort videos */
  videoSortOrder?: InputMaybe<Scalars['String']['input']>;
  /** List of IPs whitelisted for DLNA service */
  whitelistedIPs?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ConfigDlnaResult = {
  /** True if DLNA service should be enabled by default */
  enabled: Scalars['Boolean']['output'];
  /** List of interfaces to run DLNA on. Empty for all */
  interfaces: Array<Scalars['String']['output']>;
  /** Defaults to 1338 */
  port: Scalars['Int']['output'];
  serverName: Scalars['String']['output'];
  /** Order to sort videos */
  videoSortOrder: Scalars['String']['output'];
  /** List of IPs whitelisted for DLNA service */
  whitelistedIPs: Array<Scalars['String']['output']>;
};

export type ConfigDefaultSettingsInput = {
  autoTag?: InputMaybe<AutoTagMetadataInput>;
  /** If true, delete file checkbox will be checked by default */
  deleteFile?: InputMaybe<Scalars['Boolean']['input']>;
  /** If true, delete generated files checkbox will be checked by default */
  deleteGenerated?: InputMaybe<Scalars['Boolean']['input']>;
  generate?: InputMaybe<GenerateMetadataInput>;
  identify?: InputMaybe<IdentifyMetadataInput>;
  scan?: InputMaybe<ScanMetadataInput>;
};

export type ConfigDefaultSettingsResult = {
  autoTag?: Maybe<AutoTagMetadataOptions>;
  /** If true, delete file checkbox will be checked by default */
  deleteFile?: Maybe<Scalars['Boolean']['output']>;
  /** If true, delete generated supporting files checkbox will be checked by default */
  deleteGenerated?: Maybe<Scalars['Boolean']['output']>;
  generate?: Maybe<GenerateMetadataOptions>;
  identify?: Maybe<IdentifyMetadataTaskOptions>;
  scan?: Maybe<ScanMetadataOptions>;
};

export type ConfigDisableDropdownCreate = {
  gallery: Scalars['Boolean']['output'];
  movie: Scalars['Boolean']['output'];
  performer: Scalars['Boolean']['output'];
  studio: Scalars['Boolean']['output'];
  tag: Scalars['Boolean']['output'];
};

export type ConfigDisableDropdownCreateInput = {
  gallery?: InputMaybe<Scalars['Boolean']['input']>;
  movie?: InputMaybe<Scalars['Boolean']['input']>;
  performer?: InputMaybe<Scalars['Boolean']['input']>;
  studio?: InputMaybe<Scalars['Boolean']['input']>;
  tag?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ConfigGeneralInput = {
  /** Path to backup directory */
  backupDirectoryPath?: InputMaybe<Scalars['String']['input']>;
  /** Path to blobs - required for filesystem blob storage */
  blobsPath?: InputMaybe<Scalars['String']['input']>;
  /** Where to store blobs */
  blobsStorage?: InputMaybe<BlobsStorageType>;
  /** Path to cache */
  cachePath?: InputMaybe<Scalars['String']['input']>;
  /** Whether to calculate MD5 checksums for scene video files */
  calculateMD5?: InputMaybe<Scalars['Boolean']['input']>;
  /** True if galleries should be created from folders with images */
  createGalleriesFromFolders?: InputMaybe<Scalars['Boolean']['input']>;
  /** Create Image Clips from Video extensions when Videos are disabled in Library */
  createImageClipsFromVideos?: InputMaybe<Scalars['Boolean']['input']>;
  /** Custom Performer Image Location */
  customPerformerImageLocation?: InputMaybe<Scalars['String']['input']>;
  /** Path to the SQLite database */
  databasePath?: InputMaybe<Scalars['String']['input']>;
  /** Path to trash directory - if set, deleted files will be moved here instead of being permanently deleted */
  deleteTrashPath?: InputMaybe<Scalars['String']['input']>;
  /** whether to include range in generated funscript heatmaps */
  drawFunscriptHeatmapRange?: InputMaybe<Scalars['Boolean']['input']>;
  /** Array of file regexp to exclude from Video Scans */
  excludes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Path to the ffmpeg binary. If empty, stash will attempt to find it in the path or config directory */
  ffmpegPath?: InputMaybe<Scalars['String']['input']>;
  /** Path to the ffprobe binary. If empty, stash will attempt to find it in the path or config directory */
  ffprobePath?: InputMaybe<Scalars['String']['input']>;
  /** Regex used to identify images as gallery covers */
  galleryCoverRegex?: InputMaybe<Scalars['String']['input']>;
  /** Array of gallery zip file extensions */
  galleryExtensions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Path to generated files */
  generatedPath?: InputMaybe<Scalars['String']['input']>;
  /** Array of file regexp to exclude from Image Scans */
  imageExcludes?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Array of image file extensions */
  imageExtensions?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * ffmpeg stream input args - injected before input file
   * These are applied when live transcoding
   */
  liveTranscodeInputArgs?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * ffmpeg stream output args - injected before output file
   * These are applied when live transcoding
   */
  liveTranscodeOutputArgs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Whether to log http access */
  logAccess?: InputMaybe<Scalars['Boolean']['input']>;
  /** Name of the log file */
  logFile?: InputMaybe<Scalars['String']['input']>;
  /** Maximum log size */
  logFileMaxSize?: InputMaybe<Scalars['Int']['input']>;
  /** Minimum log level */
  logLevel?: InputMaybe<Scalars['String']['input']>;
  /** Whether to also output to stderr */
  logOut?: InputMaybe<Scalars['Boolean']['input']>;
  /** Maximum session cookie age */
  maxSessionAge?: InputMaybe<Scalars['Int']['input']>;
  /** Max streaming transcode size */
  maxStreamingTranscodeSize?: InputMaybe<StreamingResolutionEnum>;
  /** Max generated transcode size */
  maxTranscodeSize?: InputMaybe<StreamingResolutionEnum>;
  /** Path to import/export files */
  metadataPath?: InputMaybe<Scalars['String']['input']>;
  /** Number of parallel tasks to start during scan/generate */
  parallelTasks?: InputMaybe<Scalars['Int']['input']>;
  /** Password */
  password?: InputMaybe<Scalars['String']['input']>;
  /** Source of plugin packages */
  pluginPackageSources?: InputMaybe<Array<PackageSourceInput>>;
  /** Path to plugins */
  pluginsPath?: InputMaybe<Scalars['String']['input']>;
  /** Include audio stream in previews */
  previewAudio?: InputMaybe<Scalars['Boolean']['input']>;
  /** Duration of end of video to exclude when generating previews */
  previewExcludeEnd?: InputMaybe<Scalars['String']['input']>;
  /** Duration of start of video to exclude when generating previews */
  previewExcludeStart?: InputMaybe<Scalars['String']['input']>;
  /** Preset when generating preview */
  previewPreset?: InputMaybe<PreviewPreset>;
  /** Preview segment duration, in seconds */
  previewSegmentDuration?: InputMaybe<Scalars['Float']['input']>;
  /** Number of segments in a preview file */
  previewSegments?: InputMaybe<Scalars['Int']['input']>;
  /** Python path - resolved using path if unset */
  pythonPath?: InputMaybe<Scalars['String']['input']>;
  /** Source of scraper packages */
  scraperPackageSources?: InputMaybe<Array<PackageSourceInput>>;
  /** Path to scrapers */
  scrapersPath?: InputMaybe<Scalars['String']['input']>;
  /** Stash-box instances used for tagging */
  stashBoxes?: InputMaybe<Array<StashBoxInput>>;
  /** Array of file paths to content */
  stashes?: InputMaybe<Array<StashConfigInput>>;
  /** Transcode Hardware Acceleration */
  transcodeHardwareAcceleration?: InputMaybe<Scalars['Boolean']['input']>;
  /**
   * ffmpeg transcode input args - injected before input file
   * These are applied to generated transcodes (previews and transcodes)
   */
  transcodeInputArgs?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * ffmpeg transcode output args - injected before output file
   * These are applied to generated transcodes (previews and transcodes)
   */
  transcodeOutputArgs?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Username */
  username?: InputMaybe<Scalars['String']['input']>;
  /** Array of video file extensions */
  videoExtensions?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Hash algorithm to use for generated file naming */
  videoFileNamingAlgorithm?: InputMaybe<HashAlgorithm>;
  /** Write image thumbnails to disk when generating on the fly */
  writeImageThumbnails?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ConfigGeneralResult = {
  /** API Key */
  apiKey: Scalars['String']['output'];
  /** Path to backup directory */
  backupDirectoryPath: Scalars['String']['output'];
  /** Path to blobs - required for filesystem blob storage */
  blobsPath: Scalars['String']['output'];
  /** Where to store blobs */
  blobsStorage: BlobsStorageType;
  /** Path to cache */
  cachePath: Scalars['String']['output'];
  /** Whether to calculate MD5 checksums for scene video files */
  calculateMD5: Scalars['Boolean']['output'];
  /** Path to the config file used */
  configFilePath: Scalars['String']['output'];
  /** True if galleries should be created from folders with images */
  createGalleriesFromFolders: Scalars['Boolean']['output'];
  /** Create Image Clips from Video extensions when Videos are disabled in Library */
  createImageClipsFromVideos: Scalars['Boolean']['output'];
  /** Custom Performer Image Location */
  customPerformerImageLocation?: Maybe<Scalars['String']['output']>;
  /** Path to the SQLite database */
  databasePath: Scalars['String']['output'];
  /** Path to trash directory - if set, deleted files will be moved here instead of being permanently deleted */
  deleteTrashPath: Scalars['String']['output'];
  /** whether to include range in generated funscript heatmaps */
  drawFunscriptHeatmapRange: Scalars['Boolean']['output'];
  /** Array of file regexp to exclude from Video Scans */
  excludes: Array<Scalars['String']['output']>;
  /** Path to the ffmpeg binary. If empty, stash will attempt to find it in the path or config directory */
  ffmpegPath: Scalars['String']['output'];
  /** Path to the ffprobe binary. If empty, stash will attempt to find it in the path or config directory */
  ffprobePath: Scalars['String']['output'];
  /** Regex used to identify images as gallery covers */
  galleryCoverRegex: Scalars['String']['output'];
  /** Array of gallery zip file extensions */
  galleryExtensions: Array<Scalars['String']['output']>;
  /** Path to generated files */
  generatedPath: Scalars['String']['output'];
  /** Array of file regexp to exclude from Image Scans */
  imageExcludes: Array<Scalars['String']['output']>;
  /** Array of image file extensions */
  imageExtensions: Array<Scalars['String']['output']>;
  /**
   * ffmpeg stream input args - injected before input file
   * These are applied when live transcoding
   */
  liveTranscodeInputArgs: Array<Scalars['String']['output']>;
  /**
   * ffmpeg stream output args - injected before output file
   * These are applied when live transcoding
   */
  liveTranscodeOutputArgs: Array<Scalars['String']['output']>;
  /** Whether to log http access */
  logAccess: Scalars['Boolean']['output'];
  /** Name of the log file */
  logFile?: Maybe<Scalars['String']['output']>;
  /** Maximum log size */
  logFileMaxSize: Scalars['Int']['output'];
  /** Minimum log level */
  logLevel: Scalars['String']['output'];
  /** Whether to also output to stderr */
  logOut: Scalars['Boolean']['output'];
  /** Maximum session cookie age */
  maxSessionAge: Scalars['Int']['output'];
  /** Max streaming transcode size */
  maxStreamingTranscodeSize?: Maybe<StreamingResolutionEnum>;
  /** Max generated transcode size */
  maxTranscodeSize?: Maybe<StreamingResolutionEnum>;
  /** Path to import/export files */
  metadataPath: Scalars['String']['output'];
  /** Number of parallel tasks to start during scan/generate */
  parallelTasks: Scalars['Int']['output'];
  /** Password */
  password: Scalars['String']['output'];
  /** Source of plugin packages */
  pluginPackageSources: Array<PackageSource>;
  /** Path to plugins */
  pluginsPath: Scalars['String']['output'];
  /** Include audio stream in previews */
  previewAudio: Scalars['Boolean']['output'];
  /** Duration of end of video to exclude when generating previews */
  previewExcludeEnd: Scalars['String']['output'];
  /** Duration of start of video to exclude when generating previews */
  previewExcludeStart: Scalars['String']['output'];
  /** Preset when generating preview */
  previewPreset: PreviewPreset;
  /** Preview segment duration, in seconds */
  previewSegmentDuration: Scalars['Float']['output'];
  /** Number of segments in a preview file */
  previewSegments: Scalars['Int']['output'];
  /** Python path - resolved using path if unset */
  pythonPath: Scalars['String']['output'];
  /** Source of scraper packages */
  scraperPackageSources: Array<PackageSource>;
  /** Path to scrapers */
  scrapersPath: Scalars['String']['output'];
  /** Stash-box instances used for tagging */
  stashBoxes: Array<StashBox>;
  /** Array of file paths to content */
  stashes: Array<StashConfig>;
  /** Transcode Hardware Acceleration */
  transcodeHardwareAcceleration: Scalars['Boolean']['output'];
  /**
   * ffmpeg transcode input args - injected before input file
   * These are applied to generated transcodes (previews and transcodes)
   */
  transcodeInputArgs: Array<Scalars['String']['output']>;
  /**
   * ffmpeg transcode output args - injected before output file
   * These are applied to generated transcodes (previews and transcodes)
   */
  transcodeOutputArgs: Array<Scalars['String']['output']>;
  /** Username */
  username: Scalars['String']['output'];
  /** Array of video file extensions */
  videoExtensions: Array<Scalars['String']['output']>;
  /** Hash algorithm to use for generated file naming */
  videoFileNamingAlgorithm: HashAlgorithm;
  /** Write image thumbnails to disk when generating on the fly */
  writeImageThumbnails: Scalars['Boolean']['output'];
};

export type ConfigImageLightboxInput = {
  disableAnimation?: InputMaybe<Scalars['Boolean']['input']>;
  displayMode?: InputMaybe<ImageLightboxDisplayMode>;
  resetZoomOnNav?: InputMaybe<Scalars['Boolean']['input']>;
  scaleUp?: InputMaybe<Scalars['Boolean']['input']>;
  scrollAttemptsBeforeChange?: InputMaybe<Scalars['Int']['input']>;
  scrollMode?: InputMaybe<ImageLightboxScrollMode>;
  slideshowDelay?: InputMaybe<Scalars['Int']['input']>;
};

export type ConfigImageLightboxResult = {
  disableAnimation?: Maybe<Scalars['Boolean']['output']>;
  displayMode?: Maybe<ImageLightboxDisplayMode>;
  resetZoomOnNav?: Maybe<Scalars['Boolean']['output']>;
  scaleUp?: Maybe<Scalars['Boolean']['output']>;
  scrollAttemptsBeforeChange: Scalars['Int']['output'];
  scrollMode?: Maybe<ImageLightboxScrollMode>;
  slideshowDelay?: Maybe<Scalars['Int']['output']>;
};

export type ConfigInterfaceInput = {
  /** If true, video will autostart on load in the scene player */
  autostartVideo?: InputMaybe<Scalars['Boolean']['input']>;
  /** If true, video will autostart when loading from play random or play selected */
  autostartVideoOnPlaySelected?: InputMaybe<Scalars['Boolean']['input']>;
  /** If true, next scene in playlist will be played at video end by default */
  continuePlaylistDefault?: InputMaybe<Scalars['Boolean']['input']>;
  /** Custom CSS */
  css?: InputMaybe<Scalars['String']['input']>;
  cssEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Custom Locales */
  customLocales?: InputMaybe<Scalars['String']['input']>;
  customLocalesEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Set to true to disable creating new objects via the dropdown menus */
  disableDropdownCreate?: InputMaybe<ConfigDisableDropdownCreateInput>;
  /** Funscript Time Offset */
  funscriptOffset?: InputMaybe<Scalars['Int']['input']>;
  /** Handy Connection Key */
  handyKey?: InputMaybe<Scalars['String']['input']>;
  imageLightbox?: InputMaybe<ConfigImageLightboxInput>;
  /** Custom Javascript */
  javascript?: InputMaybe<Scalars['String']['input']>;
  javascriptEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** Interface language */
  language?: InputMaybe<Scalars['String']['input']>;
  /** Maximum duration (in seconds) in which a scene video will loop in the scene player */
  maximumLoopDuration?: InputMaybe<Scalars['Int']['input']>;
  /** Ordered list of items that should be shown in the menu */
  menuItems?: InputMaybe<Array<Scalars['String']['input']>>;
  /** True if we should not auto-open a browser window on startup */
  noBrowser?: InputMaybe<Scalars['Boolean']['input']>;
  /** True if we should send notifications to the desktop */
  notificationsEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  /** True if SFW content mode is enabled */
  sfwContentMode?: InputMaybe<Scalars['Boolean']['input']>;
  /** Show scene scrubber by default */
  showScrubber?: InputMaybe<Scalars['Boolean']['input']>;
  /** If true, studio overlays will be shown as text instead of logo images */
  showStudioAsText?: InputMaybe<Scalars['Boolean']['input']>;
  /** Enable sound on mouseover previews */
  soundOnPreview?: InputMaybe<Scalars['Boolean']['input']>;
  /** Whether to use Stash Hosted Funscript */
  useStashHostedFunscript?: InputMaybe<Scalars['Boolean']['input']>;
  /** Wall playback type */
  wallPlayback?: InputMaybe<Scalars['String']['input']>;
  /** Show title and tags in wall view */
  wallShowTitle?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ConfigInterfaceResult = {
  /** If true, video will autostart on load in the scene player */
  autostartVideo?: Maybe<Scalars['Boolean']['output']>;
  /** If true, video will autostart when loading from play random or play selected */
  autostartVideoOnPlaySelected?: Maybe<Scalars['Boolean']['output']>;
  /** If true, next scene in playlist will be played at video end by default */
  continuePlaylistDefault?: Maybe<Scalars['Boolean']['output']>;
  /** Custom CSS */
  css?: Maybe<Scalars['String']['output']>;
  cssEnabled?: Maybe<Scalars['Boolean']['output']>;
  /** Custom Locales */
  customLocales?: Maybe<Scalars['String']['output']>;
  customLocalesEnabled?: Maybe<Scalars['Boolean']['output']>;
  /** Fields are true if creating via dropdown menus are disabled */
  disableDropdownCreate: ConfigDisableDropdownCreate;
  /** Funscript Time Offset */
  funscriptOffset?: Maybe<Scalars['Int']['output']>;
  /** Handy Connection Key */
  handyKey?: Maybe<Scalars['String']['output']>;
  imageLightbox: ConfigImageLightboxResult;
  /** Custom Javascript */
  javascript?: Maybe<Scalars['String']['output']>;
  javascriptEnabled?: Maybe<Scalars['Boolean']['output']>;
  /** Interface language */
  language?: Maybe<Scalars['String']['output']>;
  /** Maximum duration (in seconds) in which a scene video will loop in the scene player */
  maximumLoopDuration?: Maybe<Scalars['Int']['output']>;
  /** Ordered list of items that should be shown in the menu */
  menuItems?: Maybe<Array<Scalars['String']['output']>>;
  /** True if we should not auto-open a browser window on startup */
  noBrowser?: Maybe<Scalars['Boolean']['output']>;
  /** True if we should send desktop notifications */
  notificationsEnabled?: Maybe<Scalars['Boolean']['output']>;
  /** True if SFW content mode is enabled */
  sfwContentMode: Scalars['Boolean']['output'];
  /** Show scene scrubber by default */
  showScrubber?: Maybe<Scalars['Boolean']['output']>;
  /** If true, studio overlays will be shown as text instead of logo images */
  showStudioAsText?: Maybe<Scalars['Boolean']['output']>;
  /** Enable sound on mouseover previews */
  soundOnPreview?: Maybe<Scalars['Boolean']['output']>;
  /** Whether to use Stash Hosted Funscript */
  useStashHostedFunscript?: Maybe<Scalars['Boolean']['output']>;
  /** Wall playback type */
  wallPlayback?: Maybe<Scalars['String']['output']>;
  /** Show title and tags in wall view */
  wallShowTitle?: Maybe<Scalars['Boolean']['output']>;
};

/** All configuration settings */
export type ConfigResult = {
  defaults: ConfigDefaultSettingsResult;
  dlna: ConfigDlnaResult;
  general: ConfigGeneralResult;
  interface: ConfigInterfaceResult;
  plugins: Scalars['PluginConfigMap']['output'];
  scraping: ConfigScrapingResult;
  ui: Scalars['Map']['output'];
};


/** All configuration settings */
export type ConfigResultPluginsArgs = {
  include?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type ConfigScrapingInput = {
  /** Tags blacklist during scraping */
  excludeTagPatterns?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Scraper CDP path. Path to chrome executable or remote address */
  scraperCDPPath?: InputMaybe<Scalars['String']['input']>;
  /** Whether the scraper should check for invalid certificates */
  scraperCertCheck?: InputMaybe<Scalars['Boolean']['input']>;
  /** Scraper user agent string */
  scraperUserAgent?: InputMaybe<Scalars['String']['input']>;
};

export type ConfigScrapingResult = {
  /** Tags blacklist during scraping */
  excludeTagPatterns: Array<Scalars['String']['output']>;
  /** Scraper CDP path. Path to chrome executable or remote address */
  scraperCDPPath?: Maybe<Scalars['String']['output']>;
  /** Whether the scraper should check for invalid certificates */
  scraperCertCheck: Scalars['Boolean']['output'];
  /** Scraper user agent string */
  scraperUserAgent?: Maybe<Scalars['String']['output']>;
};

export enum CriterionModifier {
  /** >= AND <= */
  Between = 'BETWEEN',
  /** = */
  Equals = 'EQUALS',
  Excludes = 'EXCLUDES',
  /** > */
  GreaterThan = 'GREATER_THAN',
  Includes = 'INCLUDES',
  /** INCLUDES ALL */
  IncludesAll = 'INCLUDES_ALL',
  /** IS NULL */
  IsNull = 'IS_NULL',
  /** < */
  LessThan = 'LESS_THAN',
  /** MATCHES REGEX */
  MatchesRegex = 'MATCHES_REGEX',
  /** < OR > */
  NotBetween = 'NOT_BETWEEN',
  /** != */
  NotEquals = 'NOT_EQUALS',
  /** NOT MATCHES REGEX */
  NotMatchesRegex = 'NOT_MATCHES_REGEX',
  /** IS NOT NULL */
  NotNull = 'NOT_NULL'
}

export type CustomFieldCriterionInput = {
  field: Scalars['String']['input'];
  modifier: CriterionModifier;
  value?: InputMaybe<Array<Scalars['Any']['input']>>;
};

export type CustomFieldsInput = {
  /** If populated, the entire custom fields map will be replaced with this value */
  full?: InputMaybe<Scalars['Map']['input']>;
  /** If populated, only the keys in this map will be updated */
  partial?: InputMaybe<Scalars['Map']['input']>;
  /** Remove any keys in this list */
  remove?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Dlnaip = {
  ipAddress: Scalars['String']['output'];
  /** Time until IP will be no longer allowed/disallowed */
  until?: Maybe<Scalars['Time']['output']>;
};

export type DlnaStatus = {
  allowedIPAddresses: Array<Dlnaip>;
  recentIPAddresses: Array<Scalars['String']['output']>;
  running: Scalars['Boolean']['output'];
  /** If not currently running, time until it will be started. If running, time until it will be stopped */
  until?: Maybe<Scalars['Time']['output']>;
};

export type DateCriterionInput = {
  modifier: CriterionModifier;
  value: Scalars['String']['input'];
  value2?: InputMaybe<Scalars['String']['input']>;
};

export type DestroyFilterInput = {
  id: Scalars['ID']['input'];
};

/** Directory structure of a path */
export type Directory = {
  directories: Array<Scalars['String']['output']>;
  parent?: Maybe<Scalars['String']['output']>;
  path: Scalars['String']['output'];
};

export type DisableDlnaInput = {
  /** Duration to enable, in minutes. 0 or null for indefinite. */
  duration?: InputMaybe<Scalars['Int']['input']>;
};

export type EnableDlnaInput = {
  /** Duration to enable, in minutes. 0 or null for indefinite. */
  duration?: InputMaybe<Scalars['Int']['input']>;
};

export type ExportObjectTypeInput = {
  all?: InputMaybe<Scalars['Boolean']['input']>;
  ids?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ExportObjectsInput = {
  galleries?: InputMaybe<ExportObjectTypeInput>;
  groups?: InputMaybe<ExportObjectTypeInput>;
  images?: InputMaybe<ExportObjectTypeInput>;
  includeDependencies?: InputMaybe<Scalars['Boolean']['input']>;
  movies?: InputMaybe<ExportObjectTypeInput>;
  performers?: InputMaybe<ExportObjectTypeInput>;
  scenes?: InputMaybe<ExportObjectTypeInput>;
  studios?: InputMaybe<ExportObjectTypeInput>;
  tags?: InputMaybe<ExportObjectTypeInput>;
};

export type FileFilterType = {
  AND?: InputMaybe<FileFilterType>;
  NOT?: InputMaybe<FileFilterType>;
  OR?: InputMaybe<FileFilterType>;
  basename?: InputMaybe<StringCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  dir?: InputMaybe<StringCriterionInput>;
  /** Filter files that have an exact match available */
  duplicated?: InputMaybe<PHashDuplicationCriterionInput>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  gallery_count?: InputMaybe<IntCriterionInput>;
  /** find files based on hash */
  hashes?: InputMaybe<Array<FingerprintFilterInput>>;
  image_count?: InputMaybe<IntCriterionInput>;
  image_file_filter?: InputMaybe<ImageFileFilterInput>;
  /** Filter by related images that meet this criteria */
  images_filter?: InputMaybe<ImageFilterType>;
  /** Filter by modification time */
  mod_time?: InputMaybe<TimestampCriterionInput>;
  parent_folder?: InputMaybe<HierarchicalMultiCriterionInput>;
  path?: InputMaybe<StringCriterionInput>;
  scene_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  video_file_filter?: InputMaybe<VideoFileFilterInput>;
  zip_file?: InputMaybe<MultiCriterionInput>;
};

export type FileSetFingerprintsInput = {
  /** only supplied fingerprint types will be modified */
  fingerprints: Array<SetFingerprintsInput>;
  id: Scalars['ID']['input'];
};

export enum FilterMode {
  Galleries = 'GALLERIES',
  Groups = 'GROUPS',
  Images = 'IMAGES',
  Movies = 'MOVIES',
  Performers = 'PERFORMERS',
  Scenes = 'SCENES',
  SceneMarkers = 'SCENE_MARKERS',
  Studios = 'STUDIOS',
  Tags = 'TAGS'
}

export type FindFilesResultType = {
  count: Scalars['Int']['output'];
  /** Total duration in seconds of any video files */
  duration: Scalars['Float']['output'];
  files: Array<BaseFile>;
  /** Total megapixels of any image files */
  megapixels: Scalars['Float']['output'];
  /** Total file size in bytes */
  size: Scalars['Int']['output'];
};

export type FindFilterType = {
  direction?: InputMaybe<SortDirectionEnum>;
  page?: InputMaybe<Scalars['Int']['input']>;
  /** use per_page = -1 to indicate all results. Defaults to 25. */
  per_page?: InputMaybe<Scalars['Int']['input']>;
  q?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['String']['input']>;
};

export type FindFoldersResultType = {
  count: Scalars['Int']['output'];
  folders: Array<Folder>;
};

export type FindGalleriesResultType = {
  count: Scalars['Int']['output'];
  galleries: Array<Gallery>;
};

export type FindGalleryChaptersResultType = {
  chapters: Array<GalleryChapter>;
  count: Scalars['Int']['output'];
};

export type FindGroupsResultType = {
  count: Scalars['Int']['output'];
  groups: Array<Group>;
};

export type FindImagesResultType = {
  count: Scalars['Int']['output'];
  /** Total file size in bytes */
  filesize: Scalars['Float']['output'];
  images: Array<Image>;
  /** Total megapixels of the images */
  megapixels: Scalars['Float']['output'];
};

export type FindJobInput = {
  id: Scalars['ID']['input'];
};

export type FindMoviesResultType = {
  count: Scalars['Int']['output'];
  movies: Array<Movie>;
};

export type FindPerformersResultType = {
  count: Scalars['Int']['output'];
  performers: Array<Performer>;
};

export type FindSceneMarkersResultType = {
  count: Scalars['Int']['output'];
  scene_markers: Array<SceneMarker>;
};

export type FindScenesResultType = {
  count: Scalars['Int']['output'];
  /** Total duration in seconds */
  duration: Scalars['Float']['output'];
  /** Total file size in bytes */
  filesize: Scalars['Float']['output'];
  scenes: Array<Scene>;
};

export type FindStudiosResultType = {
  count: Scalars['Int']['output'];
  studios: Array<Studio>;
};

export type FindTagsResultType = {
  count: Scalars['Int']['output'];
  tags: Array<Tag>;
};

export type Fingerprint = {
  type: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type FingerprintFilterInput = {
  /** Hamming distance - defaults to 0 */
  distance?: InputMaybe<Scalars['Int']['input']>;
  type: Scalars['String']['input'];
  value: Scalars['String']['input'];
};

export type FloatCriterionInput = {
  modifier: CriterionModifier;
  value: Scalars['Float']['input'];
  value2?: InputMaybe<Scalars['Float']['input']>;
};

export type Folder = {
  created_at: Scalars['Time']['output'];
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder?: Maybe<Folder>;
  /** @deprecated Use parent_folder instead */
  parent_folder_id?: Maybe<Scalars['ID']['output']>;
  path: Scalars['String']['output'];
  updated_at: Scalars['Time']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};

export type FolderFilterType = {
  AND?: InputMaybe<FolderFilterType>;
  NOT?: InputMaybe<FolderFilterType>;
  OR?: InputMaybe<FolderFilterType>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by files that meet this criteria */
  files_filter?: InputMaybe<FileFilterType>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  gallery_count?: InputMaybe<IntCriterionInput>;
  /** Filter by modification time */
  mod_time?: InputMaybe<TimestampCriterionInput>;
  parent_folder?: InputMaybe<HierarchicalMultiCriterionInput>;
  path?: InputMaybe<StringCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  zip_file?: InputMaybe<MultiCriterionInput>;
};

/** Gallery type */
export type Gallery = {
  chapters: Array<GalleryChapter>;
  code?: Maybe<Scalars['String']['output']>;
  cover?: Maybe<Image>;
  created_at: Scalars['Time']['output'];
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  files: Array<GalleryFile>;
  folder?: Maybe<Folder>;
  id: Scalars['ID']['output'];
  image: Image;
  image_count: Scalars['Int']['output'];
  organized: Scalars['Boolean']['output'];
  paths: GalleryPathsType;
  performers: Array<Performer>;
  photographer?: Maybe<Scalars['String']['output']>;
  rating100?: Maybe<Scalars['Int']['output']>;
  scenes: Array<Scene>;
  studio?: Maybe<Studio>;
  tags: Array<Tag>;
  title?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls: Array<Scalars['String']['output']>;
};


/** Gallery type */
export type GalleryImageArgs = {
  index: Scalars['Int']['input'];
};

export type GalleryAddInput = {
  gallery_id: Scalars['ID']['input'];
  image_ids: Array<Scalars['ID']['input']>;
};

export type GalleryChapter = {
  created_at: Scalars['Time']['output'];
  gallery: Gallery;
  id: Scalars['ID']['output'];
  image_index: Scalars['Int']['output'];
  title: Scalars['String']['output'];
  updated_at: Scalars['Time']['output'];
};

export type GalleryChapterCreateInput = {
  gallery_id: Scalars['ID']['input'];
  image_index: Scalars['Int']['input'];
  title: Scalars['String']['input'];
};

export type GalleryChapterUpdateInput = {
  gallery_id?: InputMaybe<Scalars['ID']['input']>;
  id: Scalars['ID']['input'];
  image_index?: InputMaybe<Scalars['Int']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type GalleryCreateInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  scene_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title: Scalars['String']['input'];
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type GalleryDestroyInput = {
  /**
   * If true, then the zip file will be deleted if the gallery is zip-file-based.
   * If gallery is folder-based, then any files not associated with other
   * galleries will be deleted, along with the folder, if it is not empty.
   */
  delete_file?: InputMaybe<Scalars['Boolean']['input']>;
  delete_generated?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export type GalleryFile = BaseFile & {
  basename: Scalars['String']['output'];
  created_at: Scalars['Time']['output'];
  fingerprint?: Maybe<Scalars['String']['output']>;
  fingerprints: Array<Fingerprint>;
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder: Folder;
  /** @deprecated Use parent_folder instead */
  parent_folder_id: Scalars['ID']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Int64']['output'];
  updated_at: Scalars['Time']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};


export type GalleryFileFingerprintArgs = {
  type: Scalars['String']['input'];
};

export type GalleryFilterType = {
  AND?: InputMaybe<GalleryFilterType>;
  NOT?: InputMaybe<GalleryFilterType>;
  OR?: InputMaybe<GalleryFilterType>;
  /** Filter by average image resolution */
  average_resolution?: InputMaybe<ResolutionCriterionInput>;
  /** Filter by file checksum */
  checksum?: InputMaybe<StringCriterionInput>;
  /** Filter by studio code */
  code?: InputMaybe<StringCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by date */
  date?: InputMaybe<DateCriterionInput>;
  details?: InputMaybe<StringCriterionInput>;
  /** Filter by zip-file count */
  file_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related files that meet this criteria */
  files_filter?: InputMaybe<FileFilterType>;
  /** Filter by related folders that meet this criteria */
  folders_filter?: InputMaybe<FolderFilterType>;
  /** Filter to only include galleries that have chapters. `true` or `false` */
  has_chapters?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<IntCriterionInput>;
  /** Filter by number of images in this gallery */
  image_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related images that meet this criteria */
  images_filter?: InputMaybe<ImageFilterType>;
  /** Filter to only include galleries missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  /** Filter to include/exclude galleries that were created from zip */
  is_zip?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by organized */
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by path */
  path?: InputMaybe<StringCriterionInput>;
  /** Filter galleries by performer age at time of gallery */
  performer_age?: InputMaybe<IntCriterionInput>;
  /** Filter by performer count */
  performer_count?: InputMaybe<IntCriterionInput>;
  /** Filter galleries that have performers that have been favorited */
  performer_favorite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter to only include galleries with performers with these tags */
  performer_tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter to only include galleries with these performers */
  performers?: InputMaybe<MultiCriterionInput>;
  /** Filter by related performers that meet this criteria */
  performers_filter?: InputMaybe<PerformerFilterType>;
  /** Filter by photographer */
  photographer?: InputMaybe<StringCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter to only include galleries with these scenes */
  scenes?: InputMaybe<MultiCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter to only include galleries with this studio */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related studios that meet this criteria */
  studios_filter?: InputMaybe<StudioFilterType>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include galleries with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related tags that meet this criteria */
  tags_filter?: InputMaybe<TagFilterType>;
  title?: InputMaybe<StringCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
};

export type GalleryPathsType = {
  cover: Scalars['String']['output'];
  preview: Scalars['String']['output'];
};

export type GalleryRemoveInput = {
  gallery_id: Scalars['ID']['input'];
  image_ids: Array<Scalars['ID']['input']>;
};

export type GalleryResetCoverInput = {
  gallery_id: Scalars['ID']['input'];
};

export type GallerySetCoverInput = {
  cover_image_id: Scalars['ID']['input'];
  gallery_id: Scalars['ID']['input'];
};

export type GalleryUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  primary_file_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  scene_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type GenderCriterionInput = {
  modifier: CriterionModifier;
  value?: InputMaybe<GenderEnum>;
  value_list?: InputMaybe<Array<GenderEnum>>;
};

export enum GenderEnum {
  Female = 'FEMALE',
  Intersex = 'INTERSEX',
  Male = 'MALE',
  NonBinary = 'NON_BINARY',
  TransgenderFemale = 'TRANSGENDER_FEMALE',
  TransgenderMale = 'TRANSGENDER_MALE'
}

export type GenerateApiKeyInput = {
  clear?: InputMaybe<Scalars['Boolean']['input']>;
};

export type GenerateMetadataInput = {
  clipPreviews?: InputMaybe<Scalars['Boolean']['input']>;
  covers?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate transcodes even if not required */
  forceTranscodes?: InputMaybe<Scalars['Boolean']['input']>;
  imagePreviews?: InputMaybe<Scalars['Boolean']['input']>;
  imageThumbnails?: InputMaybe<Scalars['Boolean']['input']>;
  interactiveHeatmapsSpeeds?: InputMaybe<Scalars['Boolean']['input']>;
  /** marker ids to generate for */
  markerIDs?: InputMaybe<Array<Scalars['ID']['input']>>;
  markerImagePreviews?: InputMaybe<Scalars['Boolean']['input']>;
  markerScreenshots?: InputMaybe<Scalars['Boolean']['input']>;
  markers?: InputMaybe<Scalars['Boolean']['input']>;
  /** overwrite existing media */
  overwrite?: InputMaybe<Scalars['Boolean']['input']>;
  phashes?: InputMaybe<Scalars['Boolean']['input']>;
  previewOptions?: InputMaybe<GeneratePreviewOptionsInput>;
  previews?: InputMaybe<Scalars['Boolean']['input']>;
  /** scene ids to generate for */
  sceneIDs?: InputMaybe<Array<Scalars['ID']['input']>>;
  sprites?: InputMaybe<Scalars['Boolean']['input']>;
  transcodes?: InputMaybe<Scalars['Boolean']['input']>;
};

export type GenerateMetadataOptions = {
  clipPreviews?: Maybe<Scalars['Boolean']['output']>;
  covers?: Maybe<Scalars['Boolean']['output']>;
  imagePreviews?: Maybe<Scalars['Boolean']['output']>;
  imageThumbnails?: Maybe<Scalars['Boolean']['output']>;
  interactiveHeatmapsSpeeds?: Maybe<Scalars['Boolean']['output']>;
  markerImagePreviews?: Maybe<Scalars['Boolean']['output']>;
  markerScreenshots?: Maybe<Scalars['Boolean']['output']>;
  markers?: Maybe<Scalars['Boolean']['output']>;
  phashes?: Maybe<Scalars['Boolean']['output']>;
  previewOptions?: Maybe<GeneratePreviewOptions>;
  previews?: Maybe<Scalars['Boolean']['output']>;
  sprites?: Maybe<Scalars['Boolean']['output']>;
  transcodes?: Maybe<Scalars['Boolean']['output']>;
};

export type GeneratePreviewOptions = {
  /** Duration of end of video to exclude when generating previews */
  previewExcludeEnd?: Maybe<Scalars['String']['output']>;
  /** Duration of start of video to exclude when generating previews */
  previewExcludeStart?: Maybe<Scalars['String']['output']>;
  /** Preset when generating preview */
  previewPreset?: Maybe<PreviewPreset>;
  /** Preview segment duration, in seconds */
  previewSegmentDuration?: Maybe<Scalars['Float']['output']>;
  /** Number of segments in a preview file */
  previewSegments?: Maybe<Scalars['Int']['output']>;
};

export type GeneratePreviewOptionsInput = {
  /** Duration of end of video to exclude when generating previews */
  previewExcludeEnd?: InputMaybe<Scalars['String']['input']>;
  /** Duration of start of video to exclude when generating previews */
  previewExcludeStart?: InputMaybe<Scalars['String']['input']>;
  /** Preset when generating preview */
  previewPreset?: InputMaybe<PreviewPreset>;
  /** Preview segment duration, in seconds */
  previewSegmentDuration?: InputMaybe<Scalars['Float']['input']>;
  /** Number of segments in a preview file */
  previewSegments?: InputMaybe<Scalars['Int']['input']>;
};

export type Group = {
  aliases?: Maybe<Scalars['String']['output']>;
  back_image_path?: Maybe<Scalars['String']['output']>;
  containing_groups: Array<GroupDescription>;
  created_at: Scalars['Time']['output'];
  date?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  /** Duration in seconds */
  duration?: Maybe<Scalars['Int']['output']>;
  front_image_path?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  o_counter?: Maybe<Scalars['Int']['output']>;
  performer_count: Scalars['Int']['output'];
  rating100?: Maybe<Scalars['Int']['output']>;
  scene_count: Scalars['Int']['output'];
  scenes: Array<Scene>;
  studio?: Maybe<Studio>;
  sub_group_count: Scalars['Int']['output'];
  sub_groups: Array<GroupDescription>;
  synopsis?: Maybe<Scalars['String']['output']>;
  tags: Array<Tag>;
  updated_at: Scalars['Time']['output'];
  urls: Array<Scalars['String']['output']>;
};


export type GroupPerformer_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type GroupScene_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type GroupSub_Group_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};

export type GroupCreateInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  back_image?: InputMaybe<Scalars['String']['input']>;
  containing_groups?: InputMaybe<Array<GroupDescriptionInput>>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  /** Duration in seconds */
  duration?: InputMaybe<Scalars['Int']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  front_image?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  sub_groups?: InputMaybe<Array<GroupDescriptionInput>>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** GroupDescription represents a relationship to a group with a description of the relationship */
export type GroupDescription = {
  description?: Maybe<Scalars['String']['output']>;
  group: Group;
};

export type GroupDescriptionInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  group_id: Scalars['ID']['input'];
};

export type GroupDestroyInput = {
  id: Scalars['ID']['input'];
};

export type GroupFilterType = {
  AND?: InputMaybe<GroupFilterType>;
  NOT?: InputMaybe<GroupFilterType>;
  OR?: InputMaybe<GroupFilterType>;
  /** Filter by number of containing groups the group has */
  containing_group_count?: InputMaybe<IntCriterionInput>;
  /** Filter by containing groups */
  containing_groups?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by date */
  date?: InputMaybe<DateCriterionInput>;
  director?: InputMaybe<StringCriterionInput>;
  /** Filter by duration (in seconds) */
  duration?: InputMaybe<IntCriterionInput>;
  /** Filter to only include groups missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<StringCriterionInput>;
  /** Filter by o-counter */
  o_counter?: InputMaybe<IntCriterionInput>;
  /** Filter to only include groups where performer appears in a scene */
  performers?: InputMaybe<MultiCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter to only include groups with this studio */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related studios that meet this criteria */
  studios_filter?: InputMaybe<StudioFilterType>;
  /** Filter by number of sub-groups the group has */
  sub_group_count?: InputMaybe<IntCriterionInput>;
  /** Filter by sub groups */
  sub_groups?: InputMaybe<HierarchicalMultiCriterionInput>;
  synopsis?: InputMaybe<StringCriterionInput>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include groups with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
};

export type GroupSubGroupAddInput = {
  containing_group_id: Scalars['ID']['input'];
  /** The index at which to insert the sub groups. If not provided, the sub groups will be appended to the end */
  insert_index?: InputMaybe<Scalars['Int']['input']>;
  sub_groups: Array<GroupDescriptionInput>;
};

export type GroupSubGroupRemoveInput = {
  containing_group_id: Scalars['ID']['input'];
  sub_group_ids: Array<Scalars['ID']['input']>;
};

export type GroupUpdateInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  back_image?: InputMaybe<Scalars['String']['input']>;
  containing_groups?: InputMaybe<Array<GroupDescriptionInput>>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  duration?: InputMaybe<Scalars['Int']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  front_image?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  sub_groups?: InputMaybe<Array<GroupDescriptionInput>>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export enum HashAlgorithm {
  Md5 = 'MD5',
  /** oshash */
  Oshash = 'OSHASH'
}

export type HierarchicalMultiCriterionInput = {
  depth?: InputMaybe<Scalars['Int']['input']>;
  excludes?: InputMaybe<Array<Scalars['ID']['input']>>;
  modifier: CriterionModifier;
  value?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type HistoryMutationResult = {
  count: Scalars['Int']['output'];
  history: Array<Scalars['Time']['output']>;
};

export type IdentifyFieldOptions = {
  /** creates missing objects if needed - only applicable for performers, tags and studios */
  createMissing?: Maybe<Scalars['Boolean']['output']>;
  field: Scalars['String']['output'];
  strategy: IdentifyFieldStrategy;
};

export type IdentifyFieldOptionsInput = {
  /** creates missing objects if needed - only applicable for performers, tags and studios */
  createMissing?: InputMaybe<Scalars['Boolean']['input']>;
  field: Scalars['String']['input'];
  strategy: IdentifyFieldStrategy;
};

export enum IdentifyFieldStrategy {
  /** Never sets the field value */
  Ignore = 'IGNORE',
  /**
   * For multi-value fields, merge with existing.
   * For single-value fields, ignore if already set
   */
  Merge = 'MERGE',
  /**
   * Always replaces the value if a value is found.
   * For multi-value fields, any existing values are removed and replaced with the
   * scraped values.
   */
  Overwrite = 'OVERWRITE'
}

export type IdentifyMetadataInput = {
  /** Options defined here override the configured defaults */
  options?: InputMaybe<IdentifyMetadataOptionsInput>;
  /** paths of scenes to identify - ignored if scene ids are set */
  paths?: InputMaybe<Array<Scalars['String']['input']>>;
  /** scene ids to identify */
  sceneIDs?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** An ordered list of sources to identify items with. Only the first source that finds a match is used. */
  sources: Array<IdentifySourceInput>;
};

export type IdentifyMetadataOptions = {
  /** any fields missing from here are defaulted to MERGE and createMissing false */
  fieldOptions?: Maybe<Array<IdentifyFieldOptions>>;
  /** defaults to true if not provided */
  includeMalePerformers?: Maybe<Scalars['Boolean']['output']>;
  /** defaults to true if not provided */
  setCoverImage?: Maybe<Scalars['Boolean']['output']>;
  setOrganized?: Maybe<Scalars['Boolean']['output']>;
  /** tag to tag skipped multiple matches with */
  skipMultipleMatchTag?: Maybe<Scalars['String']['output']>;
  /** defaults to true if not provided */
  skipMultipleMatches?: Maybe<Scalars['Boolean']['output']>;
  /** tag to tag skipped single name performers with */
  skipSingleNamePerformerTag?: Maybe<Scalars['String']['output']>;
  /** defaults to true if not provided */
  skipSingleNamePerformers?: Maybe<Scalars['Boolean']['output']>;
};

export type IdentifyMetadataOptionsInput = {
  /** any fields missing from here are defaulted to MERGE and createMissing false */
  fieldOptions?: InputMaybe<Array<IdentifyFieldOptionsInput>>;
  /** defaults to true if not provided */
  includeMalePerformers?: InputMaybe<Scalars['Boolean']['input']>;
  /** defaults to true if not provided */
  setCoverImage?: InputMaybe<Scalars['Boolean']['input']>;
  setOrganized?: InputMaybe<Scalars['Boolean']['input']>;
  /** tag to tag skipped multiple matches with */
  skipMultipleMatchTag?: InputMaybe<Scalars['String']['input']>;
  /** defaults to true if not provided */
  skipMultipleMatches?: InputMaybe<Scalars['Boolean']['input']>;
  /** tag to tag skipped single name performers with */
  skipSingleNamePerformerTag?: InputMaybe<Scalars['String']['input']>;
  /** defaults to true if not provided */
  skipSingleNamePerformers?: InputMaybe<Scalars['Boolean']['input']>;
};

export type IdentifyMetadataTaskOptions = {
  /** Options defined here override the configured defaults */
  options?: Maybe<IdentifyMetadataOptions>;
  /** An ordered list of sources to identify items with. Only the first source that finds a match is used. */
  sources: Array<IdentifySource>;
};

export type IdentifySource = {
  /** Options defined for a source override the defaults */
  options?: Maybe<IdentifyMetadataOptions>;
  source: ScraperSource;
};

export type IdentifySourceInput = {
  /** Options defined for a source override the defaults */
  options?: InputMaybe<IdentifyMetadataOptionsInput>;
  source: ScraperSourceInput;
};

export type Image = {
  code?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['Time']['output'];
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  /** @deprecated Use visual_files */
  files: Array<ImageFile>;
  galleries: Array<Gallery>;
  id: Scalars['ID']['output'];
  o_counter?: Maybe<Scalars['Int']['output']>;
  organized: Scalars['Boolean']['output'];
  paths: ImagePathsType;
  performers: Array<Performer>;
  photographer?: Maybe<Scalars['String']['output']>;
  rating100?: Maybe<Scalars['Int']['output']>;
  studio?: Maybe<Studio>;
  tags: Array<Tag>;
  title?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls: Array<Scalars['String']['output']>;
  visual_files: Array<VisualFile>;
};

export type ImageDestroyInput = {
  delete_file?: InputMaybe<Scalars['Boolean']['input']>;
  delete_generated?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};

export type ImageFile = BaseFile & {
  basename: Scalars['String']['output'];
  created_at: Scalars['Time']['output'];
  fingerprint?: Maybe<Scalars['String']['output']>;
  fingerprints: Array<Fingerprint>;
  format: Scalars['String']['output'];
  height: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder: Folder;
  /** @deprecated Use parent_folder instead */
  parent_folder_id: Scalars['ID']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Int64']['output'];
  updated_at: Scalars['Time']['output'];
  width: Scalars['Int']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};


export type ImageFileFingerprintArgs = {
  type: Scalars['String']['input'];
};

export type ImageFileFilterInput = {
  format?: InputMaybe<StringCriterionInput>;
  orientation?: InputMaybe<OrientationCriterionInput>;
  resolution?: InputMaybe<ResolutionCriterionInput>;
};

export type ImageFileType = {
  height: Scalars['Int']['output'];
  mod_time: Scalars['Time']['output'];
  size: Scalars['Int']['output'];
  width: Scalars['Int']['output'];
};

export type ImageFilterType = {
  AND?: InputMaybe<ImageFilterType>;
  NOT?: InputMaybe<ImageFilterType>;
  OR?: InputMaybe<ImageFilterType>;
  /** Filter by file checksum */
  checksum?: InputMaybe<StringCriterionInput>;
  /** Filter by studio code */
  code?: InputMaybe<StringCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by date */
  date?: InputMaybe<DateCriterionInput>;
  details?: InputMaybe<StringCriterionInput>;
  /** Filter by file count */
  file_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related files that meet this criteria */
  files_filter?: InputMaybe<FileFilterType>;
  /** Filter to only include images with these galleries */
  galleries?: InputMaybe<MultiCriterionInput>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  /**  Filter by image id */
  id?: InputMaybe<IntCriterionInput>;
  /** Filter to only include images missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  /** Filter by o-counter */
  o_counter?: InputMaybe<IntCriterionInput>;
  /** Filter by organized */
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by orientation */
  orientation?: InputMaybe<OrientationCriterionInput>;
  /** Filter by path */
  path?: InputMaybe<StringCriterionInput>;
  /** Filter images by performer age at time of image */
  performer_age?: InputMaybe<IntCriterionInput>;
  /** Filter by performer count */
  performer_count?: InputMaybe<IntCriterionInput>;
  /** Filter images that have performers that have been favorited */
  performer_favorite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter to only include images with performers with these tags */
  performer_tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter to only include images with these performers */
  performers?: InputMaybe<MultiCriterionInput>;
  /** Filter by related performers that meet this criteria */
  performers_filter?: InputMaybe<PerformerFilterType>;
  /** Filter by photographer */
  photographer?: InputMaybe<StringCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by resolution */
  resolution?: InputMaybe<ResolutionCriterionInput>;
  /** Filter to only include images with this studio */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related studios that meet this criteria */
  studios_filter?: InputMaybe<StudioFilterType>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include images with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related tags that meet this criteria */
  tags_filter?: InputMaybe<TagFilterType>;
  title?: InputMaybe<StringCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
};

export enum ImageLightboxDisplayMode {
  FitX = 'FIT_X',
  FitXy = 'FIT_XY',
  Original = 'ORIGINAL'
}

export enum ImageLightboxScrollMode {
  PanY = 'PAN_Y',
  Zoom = 'ZOOM'
}

export type ImagePathsType = {
  image?: Maybe<Scalars['String']['output']>;
  preview?: Maybe<Scalars['String']['output']>;
  thumbnail?: Maybe<Scalars['String']['output']>;
};

export type ImageUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  gallery_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  id: Scalars['ID']['input'];
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  primary_file_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ImagesDestroyInput = {
  delete_file?: InputMaybe<Scalars['Boolean']['input']>;
  delete_generated?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export enum ImportDuplicateEnum {
  Fail = 'FAIL',
  Ignore = 'IGNORE',
  Overwrite = 'OVERWRITE'
}

export enum ImportMissingRefEnum {
  Create = 'CREATE',
  Fail = 'FAIL',
  Ignore = 'IGNORE'
}

export type ImportObjectsInput = {
  duplicateBehaviour: ImportDuplicateEnum;
  file: Scalars['Upload']['input'];
  missingRefBehaviour: ImportMissingRefEnum;
};

export type IntCriterionInput = {
  modifier: CriterionModifier;
  value: Scalars['Int']['input'];
  value2?: InputMaybe<Scalars['Int']['input']>;
};

export type Job = {
  addTime: Scalars['Time']['output'];
  description: Scalars['String']['output'];
  endTime?: Maybe<Scalars['Time']['output']>;
  error?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  progress?: Maybe<Scalars['Float']['output']>;
  startTime?: Maybe<Scalars['Time']['output']>;
  status: JobStatus;
  subTasks?: Maybe<Array<Scalars['String']['output']>>;
};

export enum JobStatus {
  Cancelled = 'CANCELLED',
  Failed = 'FAILED',
  Finished = 'FINISHED',
  Ready = 'READY',
  Running = 'RUNNING',
  Stopping = 'STOPPING'
}

export type JobStatusUpdate = {
  job: Job;
  type: JobStatusUpdateType;
};

export enum JobStatusUpdateType {
  Add = 'ADD',
  Remove = 'REMOVE',
  Update = 'UPDATE'
}

export type LatestVersion = {
  release_date: Scalars['String']['output'];
  shorthash: Scalars['String']['output'];
  url: Scalars['String']['output'];
  version: Scalars['String']['output'];
};

export type LogEntry = {
  level: LogLevel;
  message: Scalars['String']['output'];
  time: Scalars['Time']['output'];
};

export enum LogLevel {
  Debug = 'Debug',
  Error = 'Error',
  Info = 'Info',
  Progress = 'Progress',
  Trace = 'Trace',
  Warning = 'Warning'
}

export type MarkerStringsResultType = {
  count: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
};

export type MigrateBlobsInput = {
  deleteOld?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MigrateInput = {
  backupPath: Scalars['String']['input'];
};

export type MigrateSceneScreenshotsInput = {
  deleteFiles?: InputMaybe<Scalars['Boolean']['input']>;
  overwriteExisting?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MoveFilesInput = {
  /** valid only for single file id. If empty, existing basename is used */
  destination_basename?: InputMaybe<Scalars['String']['input']>;
  /** valid for single or multiple file ids */
  destination_folder?: InputMaybe<Scalars['String']['input']>;
  /** valid for single or multiple file ids */
  destination_folder_id?: InputMaybe<Scalars['ID']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

export type Movie = {
  aliases?: Maybe<Scalars['String']['output']>;
  back_image_path?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['Time']['output'];
  date?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  /** Duration in seconds */
  duration?: Maybe<Scalars['Int']['output']>;
  front_image_path?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  rating100?: Maybe<Scalars['Int']['output']>;
  scene_count: Scalars['Int']['output'];
  scenes: Array<Scene>;
  studio?: Maybe<Studio>;
  synopsis?: Maybe<Scalars['String']['output']>;
  tags: Array<Tag>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls: Array<Scalars['String']['output']>;
};


export type MovieScene_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};

export type MovieCreateInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  back_image?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  /** Duration in seconds */
  duration?: InputMaybe<Scalars['Int']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  front_image?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MovieDestroyInput = {
  id: Scalars['ID']['input'];
};

export type MovieFilterType = {
  AND?: InputMaybe<MovieFilterType>;
  NOT?: InputMaybe<MovieFilterType>;
  OR?: InputMaybe<MovieFilterType>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by date */
  date?: InputMaybe<DateCriterionInput>;
  director?: InputMaybe<StringCriterionInput>;
  /** Filter by duration (in seconds) */
  duration?: InputMaybe<IntCriterionInput>;
  /** Filter to only include movies missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<StringCriterionInput>;
  /** Filter to only include movies where performer appears in a scene */
  performers?: InputMaybe<MultiCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter to only include movies with this studio */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related studios that meet this criteria */
  studios_filter?: InputMaybe<StudioFilterType>;
  synopsis?: InputMaybe<StringCriterionInput>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include movies with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
};

export type MovieUpdateInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  back_image?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  duration?: InputMaybe<Scalars['Int']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  front_image?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['ID']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type MultiCriterionInput = {
  excludes?: InputMaybe<Array<Scalars['ID']['input']>>;
  modifier: CriterionModifier;
  value?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type Mutation = {
  addGalleryImages: Scalars['Boolean']['output'];
  addGroupSubGroups: Scalars['Boolean']['output'];
  /** Enables an IP address for DLNA for an optional duration */
  addTempDLNAIP: Scalars['Boolean']['output'];
  /** Anonymise the database in a separate file. Optionally returns a link to download the database file */
  anonymiseDatabase?: Maybe<Scalars['String']['output']>;
  /** Backup the database. Optionally returns a link to download the database file */
  backupDatabase?: Maybe<Scalars['String']['output']>;
  bulkGalleryUpdate?: Maybe<Array<Gallery>>;
  bulkGroupUpdate?: Maybe<Array<Group>>;
  bulkImageUpdate?: Maybe<Array<Image>>;
  /** @deprecated Use bulkGroupUpdate instead */
  bulkMovieUpdate?: Maybe<Array<Movie>>;
  bulkPerformerUpdate?: Maybe<Array<Performer>>;
  bulkSceneMarkerUpdate?: Maybe<Array<SceneMarker>>;
  bulkSceneUpdate?: Maybe<Array<Scene>>;
  bulkStudioUpdate?: Maybe<Array<Studio>>;
  bulkTagUpdate?: Maybe<Array<Tag>>;
  configureDLNA: ConfigDlnaResult;
  configureDefaults: ConfigDefaultSettingsResult;
  /** Change general configuration options */
  configureGeneral: ConfigGeneralResult;
  configureInterface: ConfigInterfaceResult;
  /** overwrites the entire plugin configuration for the given plugin */
  configurePlugin: Scalars['Map']['output'];
  configureScraping: ConfigScrapingResult;
  /**
   * overwrites the UI configuration
   * if input is provided, then the entire UI configuration is replaced
   * if partial is provided, then the partial UI configuration is merged into the existing UI configuration
   */
  configureUI: Scalars['Map']['output'];
  /**
   * sets a single UI key value
   * key is a dot separated path to the value
   */
  configureUISetting: Scalars['Map']['output'];
  deleteFiles: Scalars['Boolean']['output'];
  destroySavedFilter: Scalars['Boolean']['output'];
  /** Disables DLNA for an optional duration. Has no effect if DLNA is disabled by default */
  disableDLNA: Scalars['Boolean']['output'];
  /** Downloads and installs ffmpeg and ffprobe binaries into the configuration directory. Returns the job ID. */
  downloadFFMpeg: Scalars['ID']['output'];
  /** Enables DLNA for an optional duration. Has no effect if DLNA is enabled by default */
  enableDLNA: Scalars['Boolean']['output'];
  /** DANGEROUS: Execute an arbitrary SQL statement without returning any rows. */
  execSQL: SqlExecResult;
  /** Returns a link to download the result */
  exportObjects?: Maybe<Scalars['String']['output']>;
  fileSetFingerprints: Scalars['Boolean']['output'];
  galleriesUpdate?: Maybe<Array<Maybe<Gallery>>>;
  galleryChapterCreate?: Maybe<GalleryChapter>;
  galleryChapterDestroy: Scalars['Boolean']['output'];
  galleryChapterUpdate?: Maybe<GalleryChapter>;
  galleryCreate?: Maybe<Gallery>;
  galleryDestroy: Scalars['Boolean']['output'];
  galleryUpdate?: Maybe<Gallery>;
  /** Generate and set (or clear) API key */
  generateAPIKey: Scalars['String']['output'];
  groupCreate?: Maybe<Group>;
  groupDestroy: Scalars['Boolean']['output'];
  groupUpdate?: Maybe<Group>;
  groupsDestroy: Scalars['Boolean']['output'];
  /** Decrements the o-counter for an image. Returns the new value */
  imageDecrementO: Scalars['Int']['output'];
  imageDestroy: Scalars['Boolean']['output'];
  /** Increments the o-counter for an image. Returns the new value */
  imageIncrementO: Scalars['Int']['output'];
  /** Resets the o-counter for a image to 0. Returns the new value */
  imageResetO: Scalars['Int']['output'];
  imageUpdate?: Maybe<Image>;
  imagesDestroy: Scalars['Boolean']['output'];
  imagesUpdate?: Maybe<Array<Maybe<Image>>>;
  /** Performs an incremental import. Returns the job ID */
  importObjects: Scalars['ID']['output'];
  /**
   * Installs the given packages.
   * If a package is already installed, it will be updated if needed..
   * If an error occurs when installing a package, the job will continue to install the remaining packages.
   * Returns the job ID
   */
  installPackages: Scalars['ID']['output'];
  /** Start auto-tagging. Returns the job ID */
  metadataAutoTag: Scalars['ID']['output'];
  /** Clean metadata. Returns the job ID */
  metadataClean: Scalars['ID']['output'];
  /** Clean generated files. Returns the job ID */
  metadataCleanGenerated: Scalars['ID']['output'];
  /** Start a full export. Outputs to the metadata directory. Returns the job ID */
  metadataExport: Scalars['ID']['output'];
  /** Start generating content. Returns the job ID */
  metadataGenerate: Scalars['ID']['output'];
  /** Identifies scenes using scrapers. Returns the job ID */
  metadataIdentify: Scalars['ID']['output'];
  /** Start an full import. Completely wipes the database and imports from the metadata directory. Returns the job ID */
  metadataImport: Scalars['ID']['output'];
  /** Start a scan. Returns the job ID */
  metadataScan: Scalars['ID']['output'];
  /** Migrates the schema to the required version. Returns the job ID */
  migrate: Scalars['ID']['output'];
  /** Migrates blobs from the old storage system to the current one */
  migrateBlobs: Scalars['ID']['output'];
  /** Migrate generated files for the current hash naming */
  migrateHashNaming: Scalars['ID']['output'];
  /** Migrates legacy scene screenshot files into the blob storage */
  migrateSceneScreenshots: Scalars['ID']['output'];
  /**
   * Moves the given files to the given destination. Returns true if successful.
   * Either the destination_folder or destination_folder_id must be provided.
   * If both are provided, the destination_folder_id takes precedence.
   * Destination folder must be a subfolder of one of the stash library paths.
   * If provided, destination_basename must be a valid filename with an extension that
   * matches one of the media extensions.
   * Creates folder hierarchy if needed.
   */
  moveFiles: Scalars['Boolean']['output'];
  /** @deprecated Use groupCreate instead */
  movieCreate?: Maybe<Movie>;
  /** @deprecated Use groupDestroy instead */
  movieDestroy: Scalars['Boolean']['output'];
  /** @deprecated Use groupUpdate instead */
  movieUpdate?: Maybe<Movie>;
  /** @deprecated Use groupsDestroy instead */
  moviesDestroy: Scalars['Boolean']['output'];
  /** Optimises the database. Returns the job ID */
  optimiseDatabase: Scalars['ID']['output'];
  performerCreate?: Maybe<Performer>;
  performerDestroy: Scalars['Boolean']['output'];
  performerUpdate?: Maybe<Performer>;
  performersDestroy: Scalars['Boolean']['output'];
  /** DANGEROUS: Execute an arbitrary SQL statement that returns rows. */
  querySQL: SqlQueryResult;
  reloadPlugins: Scalars['Boolean']['output'];
  /** Reload scrapers */
  reloadScrapers: Scalars['Boolean']['output'];
  removeGalleryImages: Scalars['Boolean']['output'];
  removeGroupSubGroups: Scalars['Boolean']['output'];
  /** Removes an IP address from the temporary DLNA whitelist */
  removeTempDLNAIP: Scalars['Boolean']['output'];
  /** Reorder sub groups within a group. Returns true if successful. */
  reorderSubGroups: Scalars['Boolean']['output'];
  resetGalleryCover: Scalars['Boolean']['output'];
  /**
   * Runs a plugin operation. The operation is run immediately and does not use the job queue.
   * Returns a map of the result.
   */
  runPluginOperation?: Maybe<Scalars['Any']['output']>;
  /**
   * Run a plugin task.
   * If task_name is provided, then the task must exist in the plugin config and the tasks configuration
   * will be used to run the plugin.
   * If no task_name is provided, then the plugin will be executed with the arguments provided only.
   * Returns the job ID
   */
  runPluginTask: Scalars['ID']['output'];
  saveFilter: SavedFilter;
  /** Increments the o-counter for a scene. Uses the current time if none provided. */
  sceneAddO: HistoryMutationResult;
  /** Increments the play count for the scene. Uses the current time if none provided. */
  sceneAddPlay: HistoryMutationResult;
  sceneAssignFile: Scalars['Boolean']['output'];
  sceneCreate?: Maybe<Scene>;
  /**
   * Decrements the o-counter for a scene. Returns the new value
   * @deprecated Use sceneRemoveO instead
   */
  sceneDecrementO: Scalars['Int']['output'];
  /** Decrements the o-counter for a scene, removing the last recorded time if specific time not provided. Returns the new value */
  sceneDeleteO: HistoryMutationResult;
  /** Decrements the play count for the scene, removing the specific times or the last recorded time if not provided. */
  sceneDeletePlay: HistoryMutationResult;
  sceneDestroy: Scalars['Boolean']['output'];
  /** Generates screenshot at specified time in seconds. Leave empty to generate default screenshot */
  sceneGenerateScreenshot: Scalars['String']['output'];
  /**
   * Increments the o-counter for a scene. Returns the new value
   * @deprecated Use sceneAddO instead
   */
  sceneIncrementO: Scalars['Int']['output'];
  /**
   * Increments the play count for the scene. Returns the new play count value.
   * @deprecated Use sceneAddPlay instead
   */
  sceneIncrementPlayCount: Scalars['Int']['output'];
  sceneMarkerCreate?: Maybe<SceneMarker>;
  sceneMarkerDestroy: Scalars['Boolean']['output'];
  sceneMarkerUpdate?: Maybe<SceneMarker>;
  sceneMarkersDestroy: Scalars['Boolean']['output'];
  sceneMerge?: Maybe<Scene>;
  /** Resets the resume time point and play duration */
  sceneResetActivity: Scalars['Boolean']['output'];
  /** Resets the o-counter for a scene to 0. Returns the new value */
  sceneResetO: Scalars['Int']['output'];
  /** Resets the play count for a scene to 0. Returns the new play count value. */
  sceneResetPlayCount: Scalars['Int']['output'];
  /** Sets the resume time point (if provided) and adds the provided duration to the scene's play duration */
  sceneSaveActivity: Scalars['Boolean']['output'];
  sceneUpdate?: Maybe<Scene>;
  scenesDestroy: Scalars['Boolean']['output'];
  scenesUpdate?: Maybe<Array<Maybe<Scene>>>;
  /** @deprecated now uses UI config */
  setDefaultFilter: Scalars['Boolean']['output'];
  setGalleryCover: Scalars['Boolean']['output'];
  /**
   * Enable/disable plugins - enabledMap is a map of plugin IDs to enabled booleans.
   * Plugins not in the map are not affected.
   */
  setPluginsEnabled: Scalars['Boolean']['output'];
  setup: Scalars['Boolean']['output'];
  /** Run batch performer tag task. Returns the job ID. */
  stashBoxBatchPerformerTag: Scalars['String']['output'];
  /** Run batch studio tag task. Returns the job ID. */
  stashBoxBatchStudioTag: Scalars['String']['output'];
  stopAllJobs: Scalars['Boolean']['output'];
  stopJob: Scalars['Boolean']['output'];
  studioCreate?: Maybe<Studio>;
  studioDestroy: Scalars['Boolean']['output'];
  studioUpdate?: Maybe<Studio>;
  studiosDestroy: Scalars['Boolean']['output'];
  /** Submit fingerprints to stash-box instance */
  submitStashBoxFingerprints: Scalars['Boolean']['output'];
  /** Submit performer as draft to stash-box instance */
  submitStashBoxPerformerDraft?: Maybe<Scalars['ID']['output']>;
  /** Submit scene as draft to stash-box instance */
  submitStashBoxSceneDraft?: Maybe<Scalars['ID']['output']>;
  tagCreate?: Maybe<Tag>;
  tagDestroy: Scalars['Boolean']['output'];
  tagUpdate?: Maybe<Tag>;
  tagsDestroy: Scalars['Boolean']['output'];
  tagsMerge?: Maybe<Tag>;
  /**
   * Uninstalls the given packages.
   * If an error occurs when uninstalling a package, the job will continue to uninstall the remaining packages.
   * Returns the job ID
   */
  uninstallPackages: Scalars['ID']['output'];
  /**
   * Updates the given packages.
   * If a package is not installed, it will not be installed.
   * If a package does not need to be updated, it will not be updated.
   * If no packages are provided, all packages of the given type will be updated.
   * If an error occurs when updating a package, the job will continue to update the remaining packages.
   * Returns the job ID.
   */
  updatePackages: Scalars['ID']['output'];
};


export type MutationAddGalleryImagesArgs = {
  input: GalleryAddInput;
};


export type MutationAddGroupSubGroupsArgs = {
  input: GroupSubGroupAddInput;
};


export type MutationAddTempDlnaipArgs = {
  input: AddTempDlnaipInput;
};


export type MutationAnonymiseDatabaseArgs = {
  input: AnonymiseDatabaseInput;
};


export type MutationBackupDatabaseArgs = {
  input: BackupDatabaseInput;
};


export type MutationBulkGalleryUpdateArgs = {
  input: BulkGalleryUpdateInput;
};


export type MutationBulkGroupUpdateArgs = {
  input: BulkGroupUpdateInput;
};


export type MutationBulkImageUpdateArgs = {
  input: BulkImageUpdateInput;
};


export type MutationBulkMovieUpdateArgs = {
  input: BulkMovieUpdateInput;
};


export type MutationBulkPerformerUpdateArgs = {
  input: BulkPerformerUpdateInput;
};


export type MutationBulkSceneMarkerUpdateArgs = {
  input: BulkSceneMarkerUpdateInput;
};


export type MutationBulkSceneUpdateArgs = {
  input: BulkSceneUpdateInput;
};


export type MutationBulkStudioUpdateArgs = {
  input: BulkStudioUpdateInput;
};


export type MutationBulkTagUpdateArgs = {
  input: BulkTagUpdateInput;
};


export type MutationConfigureDlnaArgs = {
  input: ConfigDlnaInput;
};


export type MutationConfigureDefaultsArgs = {
  input: ConfigDefaultSettingsInput;
};


export type MutationConfigureGeneralArgs = {
  input: ConfigGeneralInput;
};


export type MutationConfigureInterfaceArgs = {
  input: ConfigInterfaceInput;
};


export type MutationConfigurePluginArgs = {
  input: Scalars['Map']['input'];
  plugin_id: Scalars['ID']['input'];
};


export type MutationConfigureScrapingArgs = {
  input: ConfigScrapingInput;
};


export type MutationConfigureUiArgs = {
  input?: InputMaybe<Scalars['Map']['input']>;
  partial?: InputMaybe<Scalars['Map']['input']>;
};


export type MutationConfigureUiSettingArgs = {
  key: Scalars['String']['input'];
  value?: InputMaybe<Scalars['Any']['input']>;
};


export type MutationDeleteFilesArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationDestroySavedFilterArgs = {
  input: DestroyFilterInput;
};


export type MutationDisableDlnaArgs = {
  input: DisableDlnaInput;
};


export type MutationEnableDlnaArgs = {
  input: EnableDlnaInput;
};


export type MutationExecSqlArgs = {
  args?: InputMaybe<Array<InputMaybe<Scalars['Any']['input']>>>;
  sql: Scalars['String']['input'];
};


export type MutationExportObjectsArgs = {
  input: ExportObjectsInput;
};


export type MutationFileSetFingerprintsArgs = {
  input: FileSetFingerprintsInput;
};


export type MutationGalleriesUpdateArgs = {
  input: Array<GalleryUpdateInput>;
};


export type MutationGalleryChapterCreateArgs = {
  input: GalleryChapterCreateInput;
};


export type MutationGalleryChapterDestroyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationGalleryChapterUpdateArgs = {
  input: GalleryChapterUpdateInput;
};


export type MutationGalleryCreateArgs = {
  input: GalleryCreateInput;
};


export type MutationGalleryDestroyArgs = {
  input: GalleryDestroyInput;
};


export type MutationGalleryUpdateArgs = {
  input: GalleryUpdateInput;
};


export type MutationGenerateApiKeyArgs = {
  input: GenerateApiKeyInput;
};


export type MutationGroupCreateArgs = {
  input: GroupCreateInput;
};


export type MutationGroupDestroyArgs = {
  input: GroupDestroyInput;
};


export type MutationGroupUpdateArgs = {
  input: GroupUpdateInput;
};


export type MutationGroupsDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationImageDecrementOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationImageDestroyArgs = {
  input: ImageDestroyInput;
};


export type MutationImageIncrementOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationImageResetOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationImageUpdateArgs = {
  input: ImageUpdateInput;
};


export type MutationImagesDestroyArgs = {
  input: ImagesDestroyInput;
};


export type MutationImagesUpdateArgs = {
  input: Array<ImageUpdateInput>;
};


export type MutationImportObjectsArgs = {
  input: ImportObjectsInput;
};


export type MutationInstallPackagesArgs = {
  packages: Array<PackageSpecInput>;
  type: PackageType;
};


export type MutationMetadataAutoTagArgs = {
  input: AutoTagMetadataInput;
};


export type MutationMetadataCleanArgs = {
  input: CleanMetadataInput;
};


export type MutationMetadataCleanGeneratedArgs = {
  input: CleanGeneratedInput;
};


export type MutationMetadataGenerateArgs = {
  input: GenerateMetadataInput;
};


export type MutationMetadataIdentifyArgs = {
  input: IdentifyMetadataInput;
};


export type MutationMetadataScanArgs = {
  input: ScanMetadataInput;
};


export type MutationMigrateArgs = {
  input: MigrateInput;
};


export type MutationMigrateBlobsArgs = {
  input: MigrateBlobsInput;
};


export type MutationMigrateSceneScreenshotsArgs = {
  input: MigrateSceneScreenshotsInput;
};


export type MutationMoveFilesArgs = {
  input: MoveFilesInput;
};


export type MutationMovieCreateArgs = {
  input: MovieCreateInput;
};


export type MutationMovieDestroyArgs = {
  input: MovieDestroyInput;
};


export type MutationMovieUpdateArgs = {
  input: MovieUpdateInput;
};


export type MutationMoviesDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationPerformerCreateArgs = {
  input: PerformerCreateInput;
};


export type MutationPerformerDestroyArgs = {
  input: PerformerDestroyInput;
};


export type MutationPerformerUpdateArgs = {
  input: PerformerUpdateInput;
};


export type MutationPerformersDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationQuerySqlArgs = {
  args?: InputMaybe<Array<InputMaybe<Scalars['Any']['input']>>>;
  sql: Scalars['String']['input'];
};


export type MutationRemoveGalleryImagesArgs = {
  input: GalleryRemoveInput;
};


export type MutationRemoveGroupSubGroupsArgs = {
  input: GroupSubGroupRemoveInput;
};


export type MutationRemoveTempDlnaipArgs = {
  input: RemoveTempDlnaipInput;
};


export type MutationReorderSubGroupsArgs = {
  input: ReorderSubGroupsInput;
};


export type MutationResetGalleryCoverArgs = {
  input: GalleryResetCoverInput;
};


export type MutationRunPluginOperationArgs = {
  args?: InputMaybe<Scalars['Map']['input']>;
  plugin_id: Scalars['ID']['input'];
};


export type MutationRunPluginTaskArgs = {
  args?: InputMaybe<Array<PluginArgInput>>;
  args_map?: InputMaybe<Scalars['Map']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  plugin_id: Scalars['ID']['input'];
  task_name?: InputMaybe<Scalars['String']['input']>;
};


export type MutationSaveFilterArgs = {
  input: SaveFilterInput;
};


export type MutationSceneAddOArgs = {
  id: Scalars['ID']['input'];
  times?: InputMaybe<Array<Scalars['Timestamp']['input']>>;
};


export type MutationSceneAddPlayArgs = {
  id: Scalars['ID']['input'];
  times?: InputMaybe<Array<Scalars['Timestamp']['input']>>;
};


export type MutationSceneAssignFileArgs = {
  input: AssignSceneFileInput;
};


export type MutationSceneCreateArgs = {
  input: SceneCreateInput;
};


export type MutationSceneDecrementOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneDeleteOArgs = {
  id: Scalars['ID']['input'];
  times?: InputMaybe<Array<Scalars['Timestamp']['input']>>;
};


export type MutationSceneDeletePlayArgs = {
  id: Scalars['ID']['input'];
  times?: InputMaybe<Array<Scalars['Timestamp']['input']>>;
};


export type MutationSceneDestroyArgs = {
  input: SceneDestroyInput;
};


export type MutationSceneGenerateScreenshotArgs = {
  at?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationSceneIncrementOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneIncrementPlayCountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneMarkerCreateArgs = {
  input: SceneMarkerCreateInput;
};


export type MutationSceneMarkerDestroyArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneMarkerUpdateArgs = {
  input: SceneMarkerUpdateInput;
};


export type MutationSceneMarkersDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationSceneMergeArgs = {
  input: SceneMergeInput;
};


export type MutationSceneResetActivityArgs = {
  id: Scalars['ID']['input'];
  reset_duration?: InputMaybe<Scalars['Boolean']['input']>;
  reset_resume?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationSceneResetOArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneResetPlayCountArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSceneSaveActivityArgs = {
  id: Scalars['ID']['input'];
  playDuration?: InputMaybe<Scalars['Float']['input']>;
  resume_time?: InputMaybe<Scalars['Float']['input']>;
};


export type MutationSceneUpdateArgs = {
  input: SceneUpdateInput;
};


export type MutationScenesDestroyArgs = {
  input: ScenesDestroyInput;
};


export type MutationScenesUpdateArgs = {
  input: Array<SceneUpdateInput>;
};


export type MutationSetDefaultFilterArgs = {
  input: SetDefaultFilterInput;
};


export type MutationSetGalleryCoverArgs = {
  input: GallerySetCoverInput;
};


export type MutationSetPluginsEnabledArgs = {
  enabledMap: Scalars['BoolMap']['input'];
};


export type MutationSetupArgs = {
  input: SetupInput;
};


export type MutationStashBoxBatchPerformerTagArgs = {
  input: StashBoxBatchTagInput;
};


export type MutationStashBoxBatchStudioTagArgs = {
  input: StashBoxBatchTagInput;
};


export type MutationStopJobArgs = {
  job_id: Scalars['ID']['input'];
};


export type MutationStudioCreateArgs = {
  input: StudioCreateInput;
};


export type MutationStudioDestroyArgs = {
  input: StudioDestroyInput;
};


export type MutationStudioUpdateArgs = {
  input: StudioUpdateInput;
};


export type MutationStudiosDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationSubmitStashBoxFingerprintsArgs = {
  input: StashBoxFingerprintSubmissionInput;
};


export type MutationSubmitStashBoxPerformerDraftArgs = {
  input: StashBoxDraftSubmissionInput;
};


export type MutationSubmitStashBoxSceneDraftArgs = {
  input: StashBoxDraftSubmissionInput;
};


export type MutationTagCreateArgs = {
  input: TagCreateInput;
};


export type MutationTagDestroyArgs = {
  input: TagDestroyInput;
};


export type MutationTagUpdateArgs = {
  input: TagUpdateInput;
};


export type MutationTagsDestroyArgs = {
  ids: Array<Scalars['ID']['input']>;
};


export type MutationTagsMergeArgs = {
  input: TagsMergeInput;
};


export type MutationUninstallPackagesArgs = {
  packages: Array<PackageSpecInput>;
  type: PackageType;
};


export type MutationUpdatePackagesArgs = {
  packages?: InputMaybe<Array<PackageSpecInput>>;
  type: PackageType;
};

export type OrientationCriterionInput = {
  value: Array<OrientationEnum>;
};

export enum OrientationEnum {
  /** Landscape */
  Landscape = 'LANDSCAPE',
  /** Portrait */
  Portrait = 'PORTRAIT',
  /** Square */
  Square = 'SQUARE'
}

export type PHashDuplicationCriterionInput = {
  /** Currently unimplemented */
  distance?: InputMaybe<Scalars['Int']['input']>;
  duplicated?: InputMaybe<Scalars['Boolean']['input']>;
};

export type Package = {
  date?: Maybe<Scalars['Timestamp']['output']>;
  metadata: Scalars['Map']['output'];
  name: Scalars['String']['output'];
  package_id: Scalars['String']['output'];
  requires: Array<Package>;
  sourceURL: Scalars['String']['output'];
  /** The version of this package currently available from the remote source */
  source_package?: Maybe<Package>;
  version?: Maybe<Scalars['String']['output']>;
};

export type PackageSource = {
  local_path?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  url: Scalars['String']['output'];
};

export type PackageSourceInput = {
  local_path?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  url: Scalars['String']['input'];
};

export type PackageSpecInput = {
  id: Scalars['String']['input'];
  sourceURL: Scalars['String']['input'];
};

export enum PackageType {
  Plugin = 'Plugin',
  Scraper = 'Scraper'
}

export type Performer = {
  alias_list: Array<Scalars['String']['output']>;
  birthdate?: Maybe<Scalars['String']['output']>;
  career_length?: Maybe<Scalars['String']['output']>;
  circumcised?: Maybe<CircumisedEnum>;
  country?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['Time']['output'];
  custom_fields: Scalars['Map']['output'];
  death_date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  disambiguation?: Maybe<Scalars['String']['output']>;
  ethnicity?: Maybe<Scalars['String']['output']>;
  eye_color?: Maybe<Scalars['String']['output']>;
  fake_tits?: Maybe<Scalars['String']['output']>;
  favorite: Scalars['Boolean']['output'];
  gallery_count: Scalars['Int']['output'];
  gender?: Maybe<GenderEnum>;
  group_count: Scalars['Int']['output'];
  groups: Array<Group>;
  hair_color?: Maybe<Scalars['String']['output']>;
  height_cm?: Maybe<Scalars['Int']['output']>;
  id: Scalars['ID']['output'];
  ignore_auto_tag: Scalars['Boolean']['output'];
  image_count: Scalars['Int']['output'];
  image_path?: Maybe<Scalars['String']['output']>;
  /** @deprecated Use urls */
  instagram?: Maybe<Scalars['String']['output']>;
  measurements?: Maybe<Scalars['String']['output']>;
  /** @deprecated use group_count instead */
  movie_count: Scalars['Int']['output'];
  /** @deprecated use groups instead */
  movies: Array<Movie>;
  name: Scalars['String']['output'];
  o_counter?: Maybe<Scalars['Int']['output']>;
  penis_length?: Maybe<Scalars['Float']['output']>;
  performer_count: Scalars['Int']['output'];
  piercings?: Maybe<Scalars['String']['output']>;
  rating100?: Maybe<Scalars['Int']['output']>;
  scene_count: Scalars['Int']['output'];
  scenes: Array<Scene>;
  stash_ids: Array<StashId>;
  tags: Array<Tag>;
  tattoos?: Maybe<Scalars['String']['output']>;
  /** @deprecated Use urls */
  twitter?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
  weight?: Maybe<Scalars['Int']['output']>;
};

export type PerformerCreateInput = {
  alias_list?: InputMaybe<Array<Scalars['String']['input']>>;
  birthdate?: InputMaybe<Scalars['String']['input']>;
  career_length?: InputMaybe<Scalars['String']['input']>;
  circumcised?: InputMaybe<CircumisedEnum>;
  country?: InputMaybe<Scalars['String']['input']>;
  custom_fields?: InputMaybe<Scalars['Map']['input']>;
  death_date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  disambiguation?: InputMaybe<Scalars['String']['input']>;
  ethnicity?: InputMaybe<Scalars['String']['input']>;
  eye_color?: InputMaybe<Scalars['String']['input']>;
  fake_tits?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  gender?: InputMaybe<GenderEnum>;
  hair_color?: InputMaybe<Scalars['String']['input']>;
  height_cm?: InputMaybe<Scalars['Int']['input']>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  measurements?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  penis_length?: InputMaybe<Scalars['Float']['input']>;
  piercings?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  tattoos?: InputMaybe<Scalars['String']['input']>;
  twitter?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
  weight?: InputMaybe<Scalars['Int']['input']>;
};

export type PerformerDestroyInput = {
  id: Scalars['ID']['input'];
};

export type PerformerFilterType = {
  AND?: InputMaybe<PerformerFilterType>;
  NOT?: InputMaybe<PerformerFilterType>;
  OR?: InputMaybe<PerformerFilterType>;
  /** Filter by age */
  age?: InputMaybe<IntCriterionInput>;
  /** Filter by aliases */
  aliases?: InputMaybe<StringCriterionInput>;
  /** Filter by birth year */
  birth_year?: InputMaybe<IntCriterionInput>;
  /** Filter by birthdate */
  birthdate?: InputMaybe<DateCriterionInput>;
  /** Filter by career length */
  career_length?: InputMaybe<StringCriterionInput>;
  /** Filter by ciricumcision */
  circumcised?: InputMaybe<CircumcisionCriterionInput>;
  /** Filter by country */
  country?: InputMaybe<StringCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  custom_fields?: InputMaybe<Array<CustomFieldCriterionInput>>;
  /** Filter by death date */
  death_date?: InputMaybe<DateCriterionInput>;
  /** Filter by death year */
  death_year?: InputMaybe<IntCriterionInput>;
  details?: InputMaybe<StringCriterionInput>;
  disambiguation?: InputMaybe<StringCriterionInput>;
  /** Filter by ethnicity */
  ethnicity?: InputMaybe<StringCriterionInput>;
  /** Filter by eye color */
  eye_color?: InputMaybe<StringCriterionInput>;
  /** Filter by fake tits value */
  fake_tits?: InputMaybe<StringCriterionInput>;
  /** Filter by favorite */
  filter_favorites?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  /** Filter by gallery count */
  gallery_count?: InputMaybe<IntCriterionInput>;
  /** Filter by gender */
  gender?: InputMaybe<GenderCriterionInput>;
  /** Filter by groups where performer appears in scene */
  groups?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by hair color */
  hair_color?: InputMaybe<StringCriterionInput>;
  /** Filter by height in cm */
  height_cm?: InputMaybe<IntCriterionInput>;
  /** Filter by autotag ignore value */
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by image count */
  image_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related images that meet this criteria */
  images_filter?: InputMaybe<ImageFilterType>;
  /** Filter to only include performers missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  /** Filter by measurements */
  measurements?: InputMaybe<StringCriterionInput>;
  name?: InputMaybe<StringCriterionInput>;
  /** Filter by o count */
  o_counter?: InputMaybe<IntCriterionInput>;
  /** Filter by penis length value */
  penis_length?: InputMaybe<FloatCriterionInput>;
  /** Filter by performers where performer appears with another performer in scene/image/gallery */
  performers?: InputMaybe<MultiCriterionInput>;
  /** Filter by piercings */
  piercings?: InputMaybe<StringCriterionInput>;
  /** Filter by play count */
  play_count?: InputMaybe<IntCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by scene count */
  scene_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter by StashID */
  stash_id_endpoint?: InputMaybe<StashIdCriterionInput>;
  /** Filter by studios where performer appears in scene/image/gallery */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include performers with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related tags that meet this criteria */
  tags_filter?: InputMaybe<TagFilterType>;
  /** Filter by tattoos */
  tattoos?: InputMaybe<StringCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
  /** Filter by weight */
  weight?: InputMaybe<IntCriterionInput>;
};

export type PerformerUpdateInput = {
  alias_list?: InputMaybe<Array<Scalars['String']['input']>>;
  birthdate?: InputMaybe<Scalars['String']['input']>;
  career_length?: InputMaybe<Scalars['String']['input']>;
  circumcised?: InputMaybe<CircumisedEnum>;
  country?: InputMaybe<Scalars['String']['input']>;
  custom_fields?: InputMaybe<CustomFieldsInput>;
  death_date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  disambiguation?: InputMaybe<Scalars['String']['input']>;
  ethnicity?: InputMaybe<Scalars['String']['input']>;
  eye_color?: InputMaybe<Scalars['String']['input']>;
  fake_tits?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  gender?: InputMaybe<GenderEnum>;
  hair_color?: InputMaybe<Scalars['String']['input']>;
  height_cm?: InputMaybe<Scalars['Int']['input']>;
  id: Scalars['ID']['input'];
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  measurements?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  penis_length?: InputMaybe<Scalars['Float']['input']>;
  piercings?: InputMaybe<Scalars['String']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  tattoos?: InputMaybe<Scalars['String']['input']>;
  twitter?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
  weight?: InputMaybe<Scalars['Int']['input']>;
};

export type PhashDistanceCriterionInput = {
  distance?: InputMaybe<Scalars['Int']['input']>;
  modifier: CriterionModifier;
  value: Scalars['String']['input'];
};

export type Plugin = {
  description?: Maybe<Scalars['String']['output']>;
  enabled: Scalars['Boolean']['output'];
  hooks?: Maybe<Array<PluginHook>>;
  id: Scalars['ID']['output'];
  name: Scalars['String']['output'];
  paths: PluginPaths;
  /**
   * Plugin IDs of plugins that this plugin depends on.
   * Applies only for UI plugins to indicate css/javascript load order.
   */
  requires?: Maybe<Array<Scalars['ID']['output']>>;
  settings?: Maybe<Array<PluginSetting>>;
  tasks?: Maybe<Array<PluginTask>>;
  url?: Maybe<Scalars['String']['output']>;
  version?: Maybe<Scalars['String']['output']>;
};

export type PluginArgInput = {
  key: Scalars['String']['input'];
  value?: InputMaybe<PluginValueInput>;
};

export type PluginHook = {
  description?: Maybe<Scalars['String']['output']>;
  hooks?: Maybe<Array<Scalars['String']['output']>>;
  name: Scalars['String']['output'];
  plugin: Plugin;
};

export type PluginPaths = {
  css?: Maybe<Array<Scalars['String']['output']>>;
  javascript?: Maybe<Array<Scalars['String']['output']>>;
};

export type PluginResult = {
  error?: Maybe<Scalars['String']['output']>;
  result?: Maybe<Scalars['String']['output']>;
};

export type PluginSetting = {
  description?: Maybe<Scalars['String']['output']>;
  display_name?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  type: PluginSettingTypeEnum;
};

export enum PluginSettingTypeEnum {
  Boolean = 'BOOLEAN',
  Number = 'NUMBER',
  String = 'STRING'
}

export type PluginTask = {
  description?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  plugin: Plugin;
};

export type PluginValueInput = {
  a?: InputMaybe<Array<PluginValueInput>>;
  b?: InputMaybe<Scalars['Boolean']['input']>;
  f?: InputMaybe<Scalars['Float']['input']>;
  i?: InputMaybe<Scalars['Int']['input']>;
  o?: InputMaybe<Array<PluginArgInput>>;
  str?: InputMaybe<Scalars['String']['input']>;
};

export enum PreviewPreset {
  /** X264_FAST */
  Fast = 'fast',
  /** X264_MEDIUM */
  Medium = 'medium',
  /** X264_SLOW */
  Slow = 'slow',
  /** X264_SLOWER */
  Slower = 'slower',
  /** X264_ULTRAFAST */
  Ultrafast = 'ultrafast',
  /** X264_VERYFAST */
  Veryfast = 'veryfast',
  /** X264_VERYSLOW */
  Veryslow = 'veryslow'
}

/** The query root for this schema */
export type Query = {
  /** @deprecated Use findGalleries instead */
  allGalleries: Array<Gallery>;
  /** @deprecated Use findImages instead */
  allImages: Array<Image>;
  /** @deprecated Use findGroups instead */
  allMovies: Array<Movie>;
  allPerformers: Array<Performer>;
  /** @deprecated Use findSceneMarkers instead */
  allSceneMarkers: Array<SceneMarker>;
  /** @deprecated Use findScenes instead */
  allScenes: Array<Scene>;
  /** @deprecated Use findStudios instead */
  allStudios: Array<Studio>;
  /** @deprecated Use findTags instead */
  allTags: Array<Tag>;
  /** List available packages */
  availablePackages: Array<Package>;
  /** Returns the current, complete configuration */
  configuration: ConfigResult;
  /** Returns an array of paths for the given path */
  directory: Directory;
  dlnaStatus: DlnaStatus;
  /** @deprecated default filter now stored in UI config */
  findDefaultFilter?: Maybe<SavedFilter>;
  /**
   * Returns any groups of scenes that are perceptual duplicates within the queried distance
   * and the difference between their duration is smaller than durationDiff
   */
  findDuplicateScenes: Array<Array<Scene>>;
  /** Find a file by its id or path */
  findFile: BaseFile;
  /** Queries for Files */
  findFiles: FindFilesResultType;
  /** Find a file by its id or path */
  findFolder: Folder;
  /** Queries for Files */
  findFolders: FindFoldersResultType;
  findGalleries: FindGalleriesResultType;
  findGallery?: Maybe<Gallery>;
  /** Find a group by ID */
  findGroup?: Maybe<Group>;
  /** A function which queries Group objects */
  findGroups: FindGroupsResultType;
  findImage?: Maybe<Image>;
  /** A function which queries Scene objects */
  findImages: FindImagesResultType;
  findJob?: Maybe<Job>;
  /**
   * Find a movie by ID
   * @deprecated Use findGroup instead
   */
  findMovie?: Maybe<Movie>;
  /**
   * A function which queries Movie objects
   * @deprecated Use findGroups instead
   */
  findMovies: FindMoviesResultType;
  /** Find a performer by ID */
  findPerformer?: Maybe<Performer>;
  /** A function which queries Performer objects */
  findPerformers: FindPerformersResultType;
  findSavedFilter?: Maybe<SavedFilter>;
  findSavedFilters: Array<SavedFilter>;
  /** Find a scene by ID or Checksum */
  findScene?: Maybe<Scene>;
  findSceneByHash?: Maybe<Scene>;
  /** A function which queries SceneMarker objects */
  findSceneMarkers: FindSceneMarkersResultType;
  /** A function which queries Scene objects */
  findScenes: FindScenesResultType;
  findScenesByPathRegex: FindScenesResultType;
  /** Find a studio by ID */
  findStudio?: Maybe<Studio>;
  /** A function which queries Studio objects */
  findStudios: FindStudiosResultType;
  findTag?: Maybe<Tag>;
  findTags: FindTagsResultType;
  /** List installed packages */
  installedPackages: Array<Package>;
  jobQueue?: Maybe<Array<Job>>;
  latestversion: LatestVersion;
  /** List available scrapers */
  listScrapers: Array<Scraper>;
  logs: Array<LogEntry>;
  /** Get marker strings */
  markerStrings: Array<Maybe<MarkerStringsResultType>>;
  /** Retrieve random scene markers for the wall */
  markerWall: Array<SceneMarker>;
  parseSceneFilenames: SceneParserResultType;
  /** List available plugin operations */
  pluginTasks?: Maybe<Array<PluginTask>>;
  /** List loaded plugins */
  plugins?: Maybe<Array<Plugin>>;
  /** Organize scene markers by tag for a given scene ID */
  sceneMarkerTags: Array<SceneMarkerTag>;
  /** Return valid stream paths */
  sceneStreams: Array<SceneStreamEndpoint>;
  /** Retrieve random scenes for the wall */
  sceneWall: Array<Scene>;
  /** Scrapes a complete gallery record based on a URL */
  scrapeGalleryURL?: Maybe<ScrapedGallery>;
  /** Scrapes a complete group record based on a URL */
  scrapeGroupURL?: Maybe<ScrapedGroup>;
  /** Scrapes a complete image record based on a URL */
  scrapeImageURL?: Maybe<ScrapedImage>;
  /**
   * Scrapes a complete movie record based on a URL
   * @deprecated Use scrapeGroupURL instead
   */
  scrapeMovieURL?: Maybe<ScrapedMovie>;
  /** Scrape for multiple performers */
  scrapeMultiPerformers: Array<Array<ScrapedPerformer>>;
  /** Scrape for multiple scenes */
  scrapeMultiScenes: Array<Array<ScrapedScene>>;
  /** Scrapes a complete performer record based on a URL */
  scrapePerformerURL?: Maybe<ScrapedPerformer>;
  /** Scrapes a complete scene record based on a URL */
  scrapeSceneURL?: Maybe<ScrapedScene>;
  /** Scrape for a single gallery */
  scrapeSingleGallery: Array<ScrapedGallery>;
  /** Scrape for a single group */
  scrapeSingleGroup: Array<ScrapedGroup>;
  /** Scrape for a single image */
  scrapeSingleImage: Array<ScrapedImage>;
  /**
   * Scrape for a single movie
   * @deprecated Use scrapeSingleGroup instead
   */
  scrapeSingleMovie: Array<ScrapedMovie>;
  /** Scrape for a single performer */
  scrapeSinglePerformer: Array<ScrapedPerformer>;
  /** Scrape for a single scene */
  scrapeSingleScene: Array<ScrapedScene>;
  /** Scrape for a single studio */
  scrapeSingleStudio: Array<ScrapedStudio>;
  /** Scrape for a single tag */
  scrapeSingleTag: Array<ScrapedTag>;
  /** Scrapes content based on a URL */
  scrapeURL?: Maybe<ScrapedContent>;
  /** Get stats */
  stats: StatsResultType;
  systemStatus: SystemStatus;
  validateStashBoxCredentials: StashBoxValidationResult;
  version: Version;
};


/** The query root for this schema */
export type QueryAvailablePackagesArgs = {
  source: Scalars['String']['input'];
  type: PackageType;
};


/** The query root for this schema */
export type QueryDirectoryArgs = {
  locale?: InputMaybe<Scalars['String']['input']>;
  path?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryFindDefaultFilterArgs = {
  mode: FilterMode;
};


/** The query root for this schema */
export type QueryFindDuplicateScenesArgs = {
  distance?: InputMaybe<Scalars['Int']['input']>;
  duration_diff?: InputMaybe<Scalars['Float']['input']>;
};


/** The query root for this schema */
export type QueryFindFileArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  path?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryFindFilesArgs = {
  file_filter?: InputMaybe<FileFilterType>;
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};


/** The query root for this schema */
export type QueryFindFolderArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
  path?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryFindFoldersArgs = {
  filter?: InputMaybe<FindFilterType>;
  folder_filter?: InputMaybe<FolderFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};


/** The query root for this schema */
export type QueryFindGalleriesArgs = {
  filter?: InputMaybe<FindFilterType>;
  gallery_filter?: InputMaybe<GalleryFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};


/** The query root for this schema */
export type QueryFindGalleryArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindGroupArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindGroupsArgs = {
  filter?: InputMaybe<FindFilterType>;
  group_filter?: InputMaybe<GroupFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};


/** The query root for this schema */
export type QueryFindImageArgs = {
  checksum?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
};


/** The query root for this schema */
export type QueryFindImagesArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  image_filter?: InputMaybe<ImageFilterType>;
  image_ids?: InputMaybe<Array<Scalars['Int']['input']>>;
};


/** The query root for this schema */
export type QueryFindJobArgs = {
  input: FindJobInput;
};


/** The query root for this schema */
export type QueryFindMovieArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindMoviesArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  movie_filter?: InputMaybe<MovieFilterType>;
};


/** The query root for this schema */
export type QueryFindPerformerArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindPerformersArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  performer_filter?: InputMaybe<PerformerFilterType>;
  performer_ids?: InputMaybe<Array<Scalars['Int']['input']>>;
};


/** The query root for this schema */
export type QueryFindSavedFilterArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindSavedFiltersArgs = {
  mode?: InputMaybe<FilterMode>;
};


/** The query root for this schema */
export type QueryFindSceneArgs = {
  checksum?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<Scalars['ID']['input']>;
};


/** The query root for this schema */
export type QueryFindSceneByHashArgs = {
  input: SceneHashInput;
};


/** The query root for this schema */
export type QueryFindSceneMarkersArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  scene_marker_filter?: InputMaybe<SceneMarkerFilterType>;
};


/** The query root for this schema */
export type QueryFindScenesArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  scene_filter?: InputMaybe<SceneFilterType>;
  scene_ids?: InputMaybe<Array<Scalars['Int']['input']>>;
};


/** The query root for this schema */
export type QueryFindScenesByPathRegexArgs = {
  filter?: InputMaybe<FindFilterType>;
};


/** The query root for this schema */
export type QueryFindStudioArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindStudiosArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  studio_filter?: InputMaybe<StudioFilterType>;
};


/** The query root for this schema */
export type QueryFindTagArgs = {
  id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QueryFindTagsArgs = {
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  tag_filter?: InputMaybe<TagFilterType>;
};


/** The query root for this schema */
export type QueryInstalledPackagesArgs = {
  type: PackageType;
};


/** The query root for this schema */
export type QueryListScrapersArgs = {
  types: Array<ScrapeContentType>;
};


/** The query root for this schema */
export type QueryMarkerStringsArgs = {
  q?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryMarkerWallArgs = {
  q?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryParseSceneFilenamesArgs = {
  config: SceneParserInput;
  filter?: InputMaybe<FindFilterType>;
};


/** The query root for this schema */
export type QuerySceneMarkerTagsArgs = {
  scene_id: Scalars['ID']['input'];
};


/** The query root for this schema */
export type QuerySceneStreamsArgs = {
  id?: InputMaybe<Scalars['ID']['input']>;
};


/** The query root for this schema */
export type QuerySceneWallArgs = {
  q?: InputMaybe<Scalars['String']['input']>;
};


/** The query root for this schema */
export type QueryScrapeGalleryUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeGroupUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeImageUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeMovieUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeMultiPerformersArgs = {
  input: ScrapeMultiPerformersInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeMultiScenesArgs = {
  input: ScrapeMultiScenesInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapePerformerUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeSceneUrlArgs = {
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryScrapeSingleGalleryArgs = {
  input: ScrapeSingleGalleryInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleGroupArgs = {
  input: ScrapeSingleGroupInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleImageArgs = {
  input: ScrapeSingleImageInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleMovieArgs = {
  input: ScrapeSingleMovieInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSinglePerformerArgs = {
  input: ScrapeSinglePerformerInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleSceneArgs = {
  input: ScrapeSingleSceneInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleStudioArgs = {
  input: ScrapeSingleStudioInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeSingleTagArgs = {
  input: ScrapeSingleTagInput;
  source: ScraperSourceInput;
};


/** The query root for this schema */
export type QueryScrapeUrlArgs = {
  ty: ScrapeContentType;
  url: Scalars['String']['input'];
};


/** The query root for this schema */
export type QueryValidateStashBoxCredentialsArgs = {
  input: StashBoxInput;
};

export type RemoveTempDlnaipInput = {
  address: Scalars['String']['input'];
};

export type ReorderSubGroupsInput = {
  /** ID of the group to reorder sub groups for */
  group_id: Scalars['ID']['input'];
  /** If true, the sub groups will be inserted after the insert_index, otherwise they will be inserted before */
  insert_after?: InputMaybe<Scalars['Boolean']['input']>;
  /** The sub-group ID at which to insert the sub groups */
  insert_at_id: Scalars['ID']['input'];
  /**
   * IDs of the sub groups to reorder. These must be a subset of the current sub groups.
   * Sub groups will be inserted in this order at the insert_index
   */
  sub_group_ids: Array<Scalars['ID']['input']>;
};

export type ResolutionCriterionInput = {
  modifier: CriterionModifier;
  value: ResolutionEnum;
};

export enum ResolutionEnum {
  /** 8K */
  EightK = 'EIGHT_K',
  /** 5K */
  FiveK = 'FIVE_K',
  /** 4K */
  FourK = 'FOUR_K',
  /** 1080p */
  FullHd = 'FULL_HD',
  /** 8K+ */
  Huge = 'HUGE',
  /** 240p */
  Low = 'LOW',
  /** 1440p */
  QuadHd = 'QUAD_HD',
  /** 360p */
  R360P = 'R360P',
  /** 7K */
  SevenK = 'SEVEN_K',
  /** 6K */
  SixK = 'SIX_K',
  /** 480p */
  Standard = 'STANDARD',
  /** 720p */
  StandardHd = 'STANDARD_HD',
  /** 144p */
  VeryLow = 'VERY_LOW',
  /**
   * 1920p
   * @deprecated Use 4K instead
   */
  VrHd = 'VR_HD',
  /** 540p */
  WebHd = 'WEB_HD'
}

export type SqlExecResult = {
  /**
   * The integer generated by the database in response to a command.
   * Typically this will be from an "auto increment" column when inserting a new row.
   * Not all databases support this feature, and the syntax of such statements varies.
   */
  last_insert_id?: Maybe<Scalars['Int64']['output']>;
  /**
   * The number of rows affected by the query, usually an UPDATE, INSERT, or DELETE.
   * Not all queries or databases support this feature.
   */
  rows_affected?: Maybe<Scalars['Int64']['output']>;
};

export type SqlQueryResult = {
  /** The column names, in the order they appear in the result set. */
  columns: Array<Scalars['String']['output']>;
  /** The returned rows. */
  rows: Array<Array<Maybe<Scalars['Any']['output']>>>;
};

export type SaveFilterInput = {
  find_filter?: InputMaybe<FindFilterType>;
  /** provide ID to overwrite existing filter */
  id?: InputMaybe<Scalars['ID']['input']>;
  mode: FilterMode;
  name: Scalars['String']['input'];
  object_filter?: InputMaybe<Scalars['Map']['input']>;
  ui_options?: InputMaybe<Scalars['Map']['input']>;
};

export type SavedFilter = {
  /**
   * JSON-encoded filter string
   * @deprecated use find_filter and object_filter instead
   */
  filter: Scalars['String']['output'];
  find_filter?: Maybe<SavedFindFilterType>;
  id: Scalars['ID']['output'];
  mode: FilterMode;
  name: Scalars['String']['output'];
  object_filter?: Maybe<Scalars['Map']['output']>;
  ui_options?: Maybe<Scalars['Map']['output']>;
};

export type SavedFindFilterType = {
  direction?: Maybe<SortDirectionEnum>;
  page?: Maybe<Scalars['Int']['output']>;
  /** use per_page = -1 to indicate all results. Defaults to 25. */
  per_page?: Maybe<Scalars['Int']['output']>;
  q?: Maybe<Scalars['String']['output']>;
  sort?: Maybe<Scalars['String']['output']>;
};

/** Filter options for meta data scannning */
export type ScanMetaDataFilterInput = {
  /** If set, files with a modification time before this time point are ignored by the scan */
  minModTime?: InputMaybe<Scalars['Timestamp']['input']>;
};

export type ScanMetadataInput = {
  /** Filter options for the scan */
  filter?: InputMaybe<ScanMetaDataFilterInput>;
  paths?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Forces a rescan on files even if modification time is unchanged */
  rescan?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate image clip previews during scan */
  scanGenerateClipPreviews?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate covers during scan */
  scanGenerateCovers?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate image previews during scan */
  scanGenerateImagePreviews?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate phashes during scan */
  scanGeneratePhashes?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate previews during scan */
  scanGeneratePreviews?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate sprites during scan */
  scanGenerateSprites?: InputMaybe<Scalars['Boolean']['input']>;
  /** Generate image thumbnails during scan */
  scanGenerateThumbnails?: InputMaybe<Scalars['Boolean']['input']>;
};

export type ScanMetadataOptions = {
  /** Forces a rescan on files even if modification time is unchanged */
  rescan: Scalars['Boolean']['output'];
  /** Generate image clip previews during scan */
  scanGenerateClipPreviews: Scalars['Boolean']['output'];
  /** Generate covers during scan */
  scanGenerateCovers: Scalars['Boolean']['output'];
  /** Generate image previews during scan */
  scanGenerateImagePreviews: Scalars['Boolean']['output'];
  /** Generate phashes during scan */
  scanGeneratePhashes: Scalars['Boolean']['output'];
  /** Generate previews during scan */
  scanGeneratePreviews: Scalars['Boolean']['output'];
  /** Generate sprites during scan */
  scanGenerateSprites: Scalars['Boolean']['output'];
  /** Generate image thumbnails during scan */
  scanGenerateThumbnails: Scalars['Boolean']['output'];
};

export type Scene = {
  captions?: Maybe<Array<VideoCaption>>;
  code?: Maybe<Scalars['String']['output']>;
  created_at: Scalars['Time']['output'];
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  files: Array<VideoFile>;
  galleries: Array<Gallery>;
  groups: Array<SceneGroup>;
  id: Scalars['ID']['output'];
  interactive: Scalars['Boolean']['output'];
  interactive_speed?: Maybe<Scalars['Int']['output']>;
  /** The last time play count was updated */
  last_played_at?: Maybe<Scalars['Time']['output']>;
  /** @deprecated Use groups */
  movies: Array<SceneMovie>;
  o_counter?: Maybe<Scalars['Int']['output']>;
  /** Times the o counter was incremented */
  o_history: Array<Scalars['Time']['output']>;
  organized: Scalars['Boolean']['output'];
  paths: ScenePathsType;
  performers: Array<Performer>;
  /** The number ot times a scene has been played */
  play_count?: Maybe<Scalars['Int']['output']>;
  /** The total time a scene has spent playing */
  play_duration?: Maybe<Scalars['Float']['output']>;
  /** Times a scene was played */
  play_history: Array<Scalars['Time']['output']>;
  rating100?: Maybe<Scalars['Int']['output']>;
  /** The time index a scene was left at */
  resume_time?: Maybe<Scalars['Float']['output']>;
  /** Return valid stream paths */
  sceneStreams: Array<SceneStreamEndpoint>;
  scene_markers: Array<SceneMarker>;
  stash_ids: Array<StashId>;
  studio?: Maybe<Studio>;
  tags: Array<Tag>;
  title?: Maybe<Scalars['String']['output']>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls: Array<Scalars['String']['output']>;
};

export type SceneCreateInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  cover_image?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  /**
   * The first id will be assigned as primary.
   * Files will be reassigned from existing scenes if applicable.
   * Files must not already be primary for another scene.
   */
  file_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  gallery_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  groups?: InputMaybe<Array<SceneGroupInput>>;
  movies?: InputMaybe<Array<SceneMovieInput>>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type SceneDestroyInput = {
  delete_file?: InputMaybe<Scalars['Boolean']['input']>;
  delete_generated?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};

export type SceneFileType = {
  audio_codec?: Maybe<Scalars['String']['output']>;
  bitrate?: Maybe<Scalars['Int']['output']>;
  duration?: Maybe<Scalars['Float']['output']>;
  framerate?: Maybe<Scalars['Float']['output']>;
  height?: Maybe<Scalars['Int']['output']>;
  size?: Maybe<Scalars['String']['output']>;
  video_codec?: Maybe<Scalars['String']['output']>;
  width?: Maybe<Scalars['Int']['output']>;
};

export type SceneFilterType = {
  AND?: InputMaybe<SceneFilterType>;
  NOT?: InputMaybe<SceneFilterType>;
  OR?: InputMaybe<SceneFilterType>;
  /** Filter by audio codec */
  audio_codec?: InputMaybe<StringCriterionInput>;
  /** Filter by bit rate */
  bitrate?: InputMaybe<IntCriterionInput>;
  /** Filter by captions */
  captions?: InputMaybe<StringCriterionInput>;
  /** Filter by file checksum */
  checksum?: InputMaybe<StringCriterionInput>;
  code?: InputMaybe<StringCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by date */
  date?: InputMaybe<DateCriterionInput>;
  details?: InputMaybe<StringCriterionInput>;
  director?: InputMaybe<StringCriterionInput>;
  /** Filter Scenes that have an exact phash match available */
  duplicated?: InputMaybe<PHashDuplicationCriterionInput>;
  /** Filter by duration (in seconds) */
  duration?: InputMaybe<IntCriterionInput>;
  /** Filter by file count */
  file_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related files that meet this criteria */
  files_filter?: InputMaybe<FileFilterType>;
  /** Filter by frame rate */
  framerate?: InputMaybe<IntCriterionInput>;
  /** Filter to only include scenes with this gallery */
  galleries?: InputMaybe<MultiCriterionInput>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  /** Filter to only include scenes with this group */
  groups?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related groups that meet this criteria */
  groups_filter?: InputMaybe<GroupFilterType>;
  /** Filter to only include scenes which have markers. `true` or `false` */
  has_markers?: InputMaybe<Scalars['String']['input']>;
  id?: InputMaybe<IntCriterionInput>;
  /** Filter by interactive */
  interactive?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by InteractiveSpeed */
  interactive_speed?: InputMaybe<IntCriterionInput>;
  /** Filter to only include scenes missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  /** Filter by scene last played time */
  last_played_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by related markers that meet this criteria */
  markers_filter?: InputMaybe<SceneMarkerFilterType>;
  /** Filter to only include scenes with this movie */
  movies?: InputMaybe<MultiCriterionInput>;
  /** Filter by related movies that meet this criteria */
  movies_filter?: InputMaybe<MovieFilterType>;
  /** Filter by o-counter */
  o_counter?: InputMaybe<IntCriterionInput>;
  /** Filter by organized */
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by orientation */
  orientation?: InputMaybe<OrientationCriterionInput>;
  /** Filter by file oshash */
  oshash?: InputMaybe<StringCriterionInput>;
  /** Filter by path */
  path?: InputMaybe<StringCriterionInput>;
  /** Filter scenes by performer age at time of scene */
  performer_age?: InputMaybe<IntCriterionInput>;
  /** Filter by performer count */
  performer_count?: InputMaybe<IntCriterionInput>;
  /** Filter scenes that have performers that have been favorited */
  performer_favorite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter to only include scenes with performers with these tags */
  performer_tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter to only include scenes with these performers */
  performers?: InputMaybe<MultiCriterionInput>;
  /** Filter by related performers that meet this criteria */
  performers_filter?: InputMaybe<PerformerFilterType>;
  /** Filter by file phash */
  phash?: InputMaybe<StringCriterionInput>;
  /** Filter by file phash distance */
  phash_distance?: InputMaybe<PhashDistanceCriterionInput>;
  /** Filter by play count */
  play_count?: InputMaybe<IntCriterionInput>;
  /** Filter by play duration (in seconds) */
  play_duration?: InputMaybe<IntCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by resolution */
  resolution?: InputMaybe<ResolutionCriterionInput>;
  /** Filter by resume time */
  resume_time?: InputMaybe<IntCriterionInput>;
  /** Filter by StashID */
  stash_id_endpoint?: InputMaybe<StashIdCriterionInput>;
  /** Filter to only include scenes with this studio */
  studios?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related studios that meet this criteria */
  studios_filter?: InputMaybe<StudioFilterType>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include scenes with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by related tags that meet this criteria */
  tags_filter?: InputMaybe<TagFilterType>;
  title?: InputMaybe<StringCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
  /** Filter by video codec */
  video_codec?: InputMaybe<StringCriterionInput>;
};

export type SceneGroup = {
  group: Group;
  scene_index?: Maybe<Scalars['Int']['output']>;
};

export type SceneGroupInput = {
  group_id: Scalars['ID']['input'];
  scene_index?: InputMaybe<Scalars['Int']['input']>;
};

export type SceneHashInput = {
  checksum?: InputMaybe<Scalars['String']['input']>;
  oshash?: InputMaybe<Scalars['String']['input']>;
};

export type SceneMarker = {
  created_at: Scalars['Time']['output'];
  /** The optional end time of the marker (in seconds). Supports decimals. */
  end_seconds?: Maybe<Scalars['Float']['output']>;
  id: Scalars['ID']['output'];
  /** The path to the preview image for this marker */
  preview: Scalars['String']['output'];
  primary_tag: Tag;
  scene: Scene;
  /** The path to the screenshot image for this marker */
  screenshot: Scalars['String']['output'];
  /** The required start time of the marker (in seconds). Supports decimals. */
  seconds: Scalars['Float']['output'];
  /** The path to stream this marker */
  stream: Scalars['String']['output'];
  tags: Array<Tag>;
  title: Scalars['String']['output'];
  updated_at: Scalars['Time']['output'];
};

export type SceneMarkerCreateInput = {
  /** The optional end time of the marker (in seconds). Supports decimals. */
  end_seconds?: InputMaybe<Scalars['Float']['input']>;
  primary_tag_id: Scalars['ID']['input'];
  scene_id: Scalars['ID']['input'];
  /** The required start time of the marker (in seconds). Supports decimals. */
  seconds: Scalars['Float']['input'];
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title: Scalars['String']['input'];
};

export type SceneMarkerFilterType = {
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by duration (in seconds) */
  duration?: InputMaybe<FloatCriterionInput>;
  /** Filter to only include scene markers with these performers */
  performers?: InputMaybe<MultiCriterionInput>;
  /** Filter by cscene reation time */
  scene_created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by scene date */
  scene_date?: InputMaybe<DateCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scene_filter?: InputMaybe<SceneFilterType>;
  /** Filter to only include scene markers attached to a scene with these tags */
  scene_tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by lscene ast update time */
  scene_updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter to only include scene markers from these scenes */
  scenes?: InputMaybe<MultiCriterionInput>;
  /** Filter to only include scene markers with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
};

export type SceneMarkerTag = {
  scene_markers: Array<SceneMarker>;
  tag: Tag;
};

export type SceneMarkerUpdateInput = {
  /** The end time of the marker (in seconds). Supports decimals. */
  end_seconds?: InputMaybe<Scalars['Float']['input']>;
  id: Scalars['ID']['input'];
  primary_tag_id?: InputMaybe<Scalars['ID']['input']>;
  scene_id?: InputMaybe<Scalars['ID']['input']>;
  /** The start time of the marker (in seconds). Supports decimals. */
  seconds?: InputMaybe<Scalars['Float']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type SceneMergeInput = {
  destination: Scalars['ID']['input'];
  o_history?: InputMaybe<Scalars['Boolean']['input']>;
  play_history?: InputMaybe<Scalars['Boolean']['input']>;
  /**
   * If destination scene has no files, then the primary file of the
   * first source scene will be assigned as primary
   */
  source: Array<Scalars['ID']['input']>;
  values?: InputMaybe<SceneUpdateInput>;
};

export type SceneMovie = {
  movie: Movie;
  scene_index?: Maybe<Scalars['Int']['output']>;
};

export type SceneMovieId = {
  movie_id: Scalars['ID']['output'];
  scene_index?: Maybe<Scalars['String']['output']>;
};

export type SceneMovieInput = {
  movie_id: Scalars['ID']['input'];
  scene_index?: InputMaybe<Scalars['Int']['input']>;
};

export type SceneParserInput = {
  capitalizeTitle?: InputMaybe<Scalars['Boolean']['input']>;
  ignoreOrganized?: InputMaybe<Scalars['Boolean']['input']>;
  ignoreWords?: InputMaybe<Array<Scalars['String']['input']>>;
  whitespaceCharacters?: InputMaybe<Scalars['String']['input']>;
};

export type SceneParserResult = {
  code?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  gallery_ids?: Maybe<Array<Scalars['ID']['output']>>;
  movies?: Maybe<Array<SceneMovieId>>;
  performer_ids?: Maybe<Array<Scalars['ID']['output']>>;
  /** @deprecated Use 1-100 range with rating100 */
  rating?: Maybe<Scalars['Int']['output']>;
  rating100?: Maybe<Scalars['Int']['output']>;
  scene: Scene;
  studio_id?: Maybe<Scalars['ID']['output']>;
  tag_ids?: Maybe<Array<Scalars['ID']['output']>>;
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type SceneParserResultType = {
  count: Scalars['Int']['output'];
  results: Array<SceneParserResult>;
};

export type ScenePathsType = {
  caption?: Maybe<Scalars['String']['output']>;
  funscript?: Maybe<Scalars['String']['output']>;
  interactive_heatmap?: Maybe<Scalars['String']['output']>;
  preview?: Maybe<Scalars['String']['output']>;
  screenshot?: Maybe<Scalars['String']['output']>;
  sprite?: Maybe<Scalars['String']['output']>;
  stream?: Maybe<Scalars['String']['output']>;
  vtt?: Maybe<Scalars['String']['output']>;
  webp?: Maybe<Scalars['String']['output']>;
};

export type SceneStreamEndpoint = {
  label?: Maybe<Scalars['String']['output']>;
  mime_type?: Maybe<Scalars['String']['output']>;
  url: Scalars['String']['output'];
};

export type SceneUpdateInput = {
  clientMutationId?: InputMaybe<Scalars['String']['input']>;
  code?: InputMaybe<Scalars['String']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  cover_image?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  gallery_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  groups?: InputMaybe<Array<SceneGroupInput>>;
  id: Scalars['ID']['input'];
  movies?: InputMaybe<Array<SceneMovieInput>>;
  o_counter?: InputMaybe<Scalars['Int']['input']>;
  organized?: InputMaybe<Scalars['Boolean']['input']>;
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** The number ot times a scene has been played */
  play_count?: InputMaybe<Scalars['Int']['input']>;
  /** The total time a scene has spent playing */
  play_duration?: InputMaybe<Scalars['Float']['input']>;
  primary_file_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  /** The time index a scene was left at */
  resume_time?: InputMaybe<Scalars['Float']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  studio_id?: InputMaybe<Scalars['ID']['input']>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ScenesDestroyInput = {
  delete_file?: InputMaybe<Scalars['Boolean']['input']>;
  delete_generated?: InputMaybe<Scalars['Boolean']['input']>;
  ids: Array<Scalars['ID']['input']>;
};

/** Type of the content a scraper generates */
export enum ScrapeContentType {
  Gallery = 'GALLERY',
  Group = 'GROUP',
  Image = 'IMAGE',
  Movie = 'MOVIE',
  Performer = 'PERFORMER',
  Scene = 'SCENE'
}

export type ScrapeMultiPerformersInput = {
  /** Instructs to query by scene fingerprints */
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type ScrapeMultiScenesInput = {
  /** Instructs to query by scene fingerprints */
  scene_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type ScrapeSingleGalleryInput = {
  /** Instructs to query by gallery id */
  gallery_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by gallery fragment */
  gallery_input?: InputMaybe<ScrapedGalleryInput>;
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSingleGroupInput = {
  /** Instructs to query by group id */
  group_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by group fragment */
  group_input?: InputMaybe<ScrapedGroupInput>;
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSingleImageInput = {
  /** Instructs to query by image id */
  image_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by image fragment */
  image_input?: InputMaybe<ScrapedImageInput>;
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSingleMovieInput = {
  /** Instructs to query by movie id */
  movie_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by movie fragment */
  movie_input?: InputMaybe<ScrapedMovieInput>;
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSinglePerformerInput = {
  /** Instructs to query by performer id */
  performer_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by performer fragment */
  performer_input?: InputMaybe<ScrapedPerformerInput>;
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSingleSceneInput = {
  /** Instructs to query by string */
  query?: InputMaybe<Scalars['String']['input']>;
  /** Instructs to query by scene fingerprints */
  scene_id?: InputMaybe<Scalars['ID']['input']>;
  /** Instructs to query by scene fragment */
  scene_input?: InputMaybe<ScrapedSceneInput>;
};

export type ScrapeSingleStudioInput = {
  /** Query can be either a name or a Stash ID */
  query?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapeSingleTagInput = {
  /** Query can be either a name or a Stash ID */
  query?: InputMaybe<Scalars['String']['input']>;
};

export enum ScrapeType {
  /** From existing object */
  Fragment = 'FRAGMENT',
  /** From text query */
  Name = 'NAME',
  /** From URL */
  Url = 'URL'
}

/** Scraped Content is the forming union over the different scrapers */
export type ScrapedContent = ScrapedGallery | ScrapedGroup | ScrapedImage | ScrapedMovie | ScrapedPerformer | ScrapedScene | ScrapedStudio | ScrapedTag;

export type ScrapedGallery = {
  code?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  performers?: Maybe<Array<ScrapedPerformer>>;
  photographer?: Maybe<Scalars['String']['output']>;
  studio?: Maybe<ScrapedStudio>;
  tags?: Maybe<Array<ScrapedTag>>;
  title?: Maybe<Scalars['String']['output']>;
  /** @deprecated use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedGalleryInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  photographer?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** A group from a scraping operation... */
export type ScrapedGroup = {
  aliases?: Maybe<Scalars['String']['output']>;
  /** This should be a base64 encoded data URL */
  back_image?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  duration?: Maybe<Scalars['String']['output']>;
  /** This should be a base64 encoded data URL */
  front_image?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  rating?: Maybe<Scalars['String']['output']>;
  stored_id?: Maybe<Scalars['ID']['output']>;
  studio?: Maybe<ScrapedStudio>;
  synopsis?: Maybe<Scalars['String']['output']>;
  tags?: Maybe<Array<ScrapedTag>>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedGroupInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  duration?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  rating?: InputMaybe<Scalars['String']['input']>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ScrapedImage = {
  code?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  performers?: Maybe<Array<ScrapedPerformer>>;
  photographer?: Maybe<Scalars['String']['output']>;
  studio?: Maybe<ScrapedStudio>;
  tags?: Maybe<Array<ScrapedTag>>;
  title?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedImageInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** A movie from a scraping operation... */
export type ScrapedMovie = {
  aliases?: Maybe<Scalars['String']['output']>;
  /** This should be a base64 encoded data URL */
  back_image?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  duration?: Maybe<Scalars['String']['output']>;
  /** This should be a base64 encoded data URL */
  front_image?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  rating?: Maybe<Scalars['String']['output']>;
  stored_id?: Maybe<Scalars['ID']['output']>;
  studio?: Maybe<ScrapedStudio>;
  synopsis?: Maybe<Scalars['String']['output']>;
  tags?: Maybe<Array<ScrapedTag>>;
  /** @deprecated use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedMovieInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  duration?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  rating?: InputMaybe<Scalars['String']['input']>;
  synopsis?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

/** A performer from a scraping operation... */
export type ScrapedPerformer = {
  aliases?: Maybe<Scalars['String']['output']>;
  birthdate?: Maybe<Scalars['String']['output']>;
  career_length?: Maybe<Scalars['String']['output']>;
  circumcised?: Maybe<Scalars['String']['output']>;
  country?: Maybe<Scalars['String']['output']>;
  death_date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  disambiguation?: Maybe<Scalars['String']['output']>;
  ethnicity?: Maybe<Scalars['String']['output']>;
  eye_color?: Maybe<Scalars['String']['output']>;
  fake_tits?: Maybe<Scalars['String']['output']>;
  gender?: Maybe<Scalars['String']['output']>;
  hair_color?: Maybe<Scalars['String']['output']>;
  height?: Maybe<Scalars['String']['output']>;
  /**
   * This should be a base64 encoded data URL
   * @deprecated use images instead
   */
  image?: Maybe<Scalars['String']['output']>;
  images?: Maybe<Array<Scalars['String']['output']>>;
  /** @deprecated use urls */
  instagram?: Maybe<Scalars['String']['output']>;
  measurements?: Maybe<Scalars['String']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  penis_length?: Maybe<Scalars['String']['output']>;
  piercings?: Maybe<Scalars['String']['output']>;
  remote_site_id?: Maybe<Scalars['String']['output']>;
  /** Set if performer matched */
  stored_id?: Maybe<Scalars['ID']['output']>;
  tags?: Maybe<Array<ScrapedTag>>;
  tattoos?: Maybe<Scalars['String']['output']>;
  /** @deprecated use urls */
  twitter?: Maybe<Scalars['String']['output']>;
  /** @deprecated use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
  weight?: Maybe<Scalars['String']['output']>;
};

export type ScrapedPerformerInput = {
  aliases?: InputMaybe<Scalars['String']['input']>;
  birthdate?: InputMaybe<Scalars['String']['input']>;
  career_length?: InputMaybe<Scalars['String']['input']>;
  circumcised?: InputMaybe<Scalars['String']['input']>;
  country?: InputMaybe<Scalars['String']['input']>;
  death_date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  disambiguation?: InputMaybe<Scalars['String']['input']>;
  ethnicity?: InputMaybe<Scalars['String']['input']>;
  eye_color?: InputMaybe<Scalars['String']['input']>;
  fake_tits?: InputMaybe<Scalars['String']['input']>;
  gender?: InputMaybe<Scalars['String']['input']>;
  hair_color?: InputMaybe<Scalars['String']['input']>;
  height?: InputMaybe<Scalars['String']['input']>;
  instagram?: InputMaybe<Scalars['String']['input']>;
  measurements?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  penis_length?: InputMaybe<Scalars['String']['input']>;
  piercings?: InputMaybe<Scalars['String']['input']>;
  remote_site_id?: InputMaybe<Scalars['String']['input']>;
  /** Set if performer matched */
  stored_id?: InputMaybe<Scalars['ID']['input']>;
  tattoos?: InputMaybe<Scalars['String']['input']>;
  twitter?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
  weight?: InputMaybe<Scalars['String']['input']>;
};

export type ScrapedScene = {
  code?: Maybe<Scalars['String']['output']>;
  date?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  director?: Maybe<Scalars['String']['output']>;
  duration?: Maybe<Scalars['Int']['output']>;
  file?: Maybe<SceneFileType>;
  fingerprints?: Maybe<Array<StashBoxFingerprint>>;
  groups?: Maybe<Array<ScrapedGroup>>;
  /** This should be a base64 encoded data URL */
  image?: Maybe<Scalars['String']['output']>;
  /** @deprecated use groups */
  movies?: Maybe<Array<ScrapedMovie>>;
  performers?: Maybe<Array<ScrapedPerformer>>;
  remote_site_id?: Maybe<Scalars['String']['output']>;
  studio?: Maybe<ScrapedStudio>;
  tags?: Maybe<Array<ScrapedTag>>;
  title?: Maybe<Scalars['String']['output']>;
  /** @deprecated use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedSceneInput = {
  code?: InputMaybe<Scalars['String']['input']>;
  date?: InputMaybe<Scalars['String']['input']>;
  details?: InputMaybe<Scalars['String']['input']>;
  director?: InputMaybe<Scalars['String']['input']>;
  remote_site_id?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type ScrapedStudio = {
  /** Aliases must be comma-delimited to be parsed correctly */
  aliases?: Maybe<Scalars['String']['output']>;
  details?: Maybe<Scalars['String']['output']>;
  image?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  parent?: Maybe<ScrapedStudio>;
  remote_site_id?: Maybe<Scalars['String']['output']>;
  /** Set if studio matched */
  stored_id?: Maybe<Scalars['ID']['output']>;
  tags?: Maybe<Array<ScrapedTag>>;
  /** @deprecated use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type ScrapedTag = {
  name: Scalars['String']['output'];
  /** Remote site ID, if applicable */
  remote_site_id?: Maybe<Scalars['String']['output']>;
  /** Set if tag matched */
  stored_id?: Maybe<Scalars['ID']['output']>;
};

export type Scraper = {
  /** Details for gallery scraper */
  gallery?: Maybe<ScraperSpec>;
  /** Details for group scraper */
  group?: Maybe<ScraperSpec>;
  id: Scalars['ID']['output'];
  /** Details for image scraper */
  image?: Maybe<ScraperSpec>;
  /**
   * Details for movie scraper
   * @deprecated use group
   */
  movie?: Maybe<ScraperSpec>;
  name: Scalars['String']['output'];
  /** Details for performer scraper */
  performer?: Maybe<ScraperSpec>;
  /** Details for scene scraper */
  scene?: Maybe<ScraperSpec>;
};

export type ScraperSource = {
  /** Scraper ID to scrape with. Should be unset if stash_box_endpoint/stash_box_index is set */
  scraper_id?: Maybe<Scalars['ID']['output']>;
  /** Stash-box endpoint */
  stash_box_endpoint?: Maybe<Scalars['String']['output']>;
  /**
   * Index of the configured stash-box instance to use. Should be unset if scraper_id is set
   * @deprecated use stash_box_endpoint
   */
  stash_box_index?: Maybe<Scalars['Int']['output']>;
};

export type ScraperSourceInput = {
  /** Scraper ID to scrape with. Should be unset if stash_box_endpoint/stash_box_index is set */
  scraper_id?: InputMaybe<Scalars['ID']['input']>;
  /** Stash-box endpoint */
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  /** Index of the configured stash-box instance to use. Should be unset if scraper_id is set */
  stash_box_index?: InputMaybe<Scalars['Int']['input']>;
};

export type ScraperSpec = {
  supported_scrapes: Array<ScrapeType>;
  /** URLs matching these can be scraped with */
  urls?: Maybe<Array<Scalars['String']['output']>>;
};

export type SetDefaultFilterInput = {
  /** null to clear */
  find_filter?: InputMaybe<FindFilterType>;
  mode: FilterMode;
  object_filter?: InputMaybe<Scalars['Map']['input']>;
  ui_options?: InputMaybe<Scalars['Map']['input']>;
};

export type SetFingerprintsInput = {
  type: Scalars['String']['input'];
  /** an null value will remove the fingerprint */
  value?: InputMaybe<Scalars['String']['input']>;
};

export type SetupInput = {
  /** Empty to indicate default - only applicable if storeBlobsInDatabase is false */
  blobsLocation: Scalars['String']['input'];
  /** Empty to indicate default */
  cacheLocation: Scalars['String']['input'];
  /** Empty to indicate $HOME/.stash/config.yml default */
  configLocation: Scalars['String']['input'];
  /** Empty to indicate default */
  databaseFile: Scalars['String']['input'];
  /** Empty to indicate default */
  generatedLocation: Scalars['String']['input'];
  /** True if SFW content mode is enabled */
  sfwContentMode?: InputMaybe<Scalars['Boolean']['input']>;
  stashes: Array<StashConfigInput>;
  storeBlobsInDatabase: Scalars['Boolean']['input'];
};

export enum SortDirectionEnum {
  Asc = 'ASC',
  Desc = 'DESC'
}

export type StashBox = {
  api_key: Scalars['String']['output'];
  endpoint: Scalars['String']['output'];
  max_requests_per_minute: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

/**
 * Accepts either ids, or a combination of names and stash_ids.
 * If none are set, then all existing items will be tagged.
 */
export type StashBoxBatchTagInput = {
  /** If batch adding studios, should their parent studios also be created? */
  createParent: Scalars['Boolean']['input'];
  /** Stash endpoint to use for the tagging */
  endpoint?: InputMaybe<Scalars['Int']['input']>;
  /** Fields to exclude when executing the tagging */
  exclude_fields?: InputMaybe<Array<Scalars['String']['input']>>;
  /**
   * IDs in stash of the items to update.
   * If set, names and stash_ids fields will be ignored.
   */
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Names of the items in the stash-box instance to search for and create */
  names?: InputMaybe<Array<Scalars['String']['input']>>;
  /** IDs in stash of the performers to update */
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Names of the performers in the stash-box instance to search for and create */
  performer_names?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Refresh items already tagged by StashBox if true. Only tag items with no StashBox tagging if false */
  refresh: Scalars['Boolean']['input'];
  /** Endpoint of the stash-box instance to use */
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  /** Stash IDs of the items in the stash-box instance to search for and create */
  stash_ids?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type StashBoxDraftSubmissionInput = {
  id: Scalars['String']['input'];
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  stash_box_index?: InputMaybe<Scalars['Int']['input']>;
};

export type StashBoxFingerprint = {
  algorithm: Scalars['String']['output'];
  duration: Scalars['Int']['output'];
  hash: Scalars['String']['output'];
};

export type StashBoxFingerprintSubmissionInput = {
  scene_ids: Array<Scalars['String']['input']>;
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  stash_box_index?: InputMaybe<Scalars['Int']['input']>;
};

export type StashBoxInput = {
  api_key: Scalars['String']['input'];
  endpoint: Scalars['String']['input'];
  max_requests_per_minute?: InputMaybe<Scalars['Int']['input']>;
  name: Scalars['String']['input'];
};

export type StashBoxPerformerQueryInput = {
  /** Instructs query by scene fingerprints */
  performer_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Query by query string */
  q?: InputMaybe<Scalars['String']['input']>;
  /** Endpoint of the stash-box instance to use */
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  /** Index of the configured stash-box instance to use */
  stash_box_index?: InputMaybe<Scalars['Int']['input']>;
};

export type StashBoxPerformerQueryResult = {
  query: Scalars['String']['output'];
  results: Array<ScrapedPerformer>;
};

export type StashBoxSceneQueryInput = {
  /** Query by query string */
  q?: InputMaybe<Scalars['String']['input']>;
  /** Instructs query by scene fingerprints */
  scene_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Endpoint of the stash-box instance to use */
  stash_box_endpoint?: InputMaybe<Scalars['String']['input']>;
  /** Index of the configured stash-box instance to use */
  stash_box_index?: InputMaybe<Scalars['Int']['input']>;
};

export type StashBoxValidationResult = {
  status: Scalars['String']['output'];
  valid: Scalars['Boolean']['output'];
};

export type StashConfig = {
  excludeImage: Scalars['Boolean']['output'];
  excludeVideo: Scalars['Boolean']['output'];
  path: Scalars['String']['output'];
};

/** Stash configuration details */
export type StashConfigInput = {
  excludeImage: Scalars['Boolean']['input'];
  excludeVideo: Scalars['Boolean']['input'];
  path: Scalars['String']['input'];
};

export type StashId = {
  endpoint: Scalars['String']['output'];
  stash_id: Scalars['String']['output'];
  updated_at: Scalars['Time']['output'];
};

export type StashIdCriterionInput = {
  /**
   * If present, this value is treated as a predicate.
   * That is, it will filter based on stash_ids with the matching endpoint
   */
  endpoint?: InputMaybe<Scalars['String']['input']>;
  modifier: CriterionModifier;
  stash_id?: InputMaybe<Scalars['String']['input']>;
};

export type StashIdInput = {
  endpoint: Scalars['String']['input'];
  stash_id: Scalars['String']['input'];
  updated_at?: InputMaybe<Scalars['Time']['input']>;
};

export type StatsResultType = {
  gallery_count: Scalars['Int']['output'];
  group_count: Scalars['Int']['output'];
  image_count: Scalars['Int']['output'];
  images_size: Scalars['Float']['output'];
  /** @deprecated use group_count instead */
  movie_count: Scalars['Int']['output'];
  performer_count: Scalars['Int']['output'];
  scene_count: Scalars['Int']['output'];
  scenes_duration: Scalars['Float']['output'];
  scenes_played: Scalars['Int']['output'];
  scenes_size: Scalars['Float']['output'];
  studio_count: Scalars['Int']['output'];
  tag_count: Scalars['Int']['output'];
  total_o_count: Scalars['Int']['output'];
  total_play_count: Scalars['Int']['output'];
  total_play_duration: Scalars['Float']['output'];
};

export enum StreamingResolutionEnum {
  /** 4k */
  FourK = 'FOUR_K',
  /** 1080p */
  FullHd = 'FULL_HD',
  /** 240p */
  Low = 'LOW',
  /** Original */
  Original = 'ORIGINAL',
  /** 480p */
  Standard = 'STANDARD',
  /** 720p */
  StandardHd = 'STANDARD_HD'
}

export type StringCriterionInput = {
  modifier: CriterionModifier;
  value: Scalars['String']['input'];
};

export type Studio = {
  aliases: Array<Scalars['String']['output']>;
  child_studios: Array<Studio>;
  created_at: Scalars['Time']['output'];
  details?: Maybe<Scalars['String']['output']>;
  favorite: Scalars['Boolean']['output'];
  gallery_count: Scalars['Int']['output'];
  group_count: Scalars['Int']['output'];
  groups: Array<Group>;
  id: Scalars['ID']['output'];
  ignore_auto_tag: Scalars['Boolean']['output'];
  image_count: Scalars['Int']['output'];
  image_path?: Maybe<Scalars['String']['output']>;
  /** @deprecated use group_count instead */
  movie_count: Scalars['Int']['output'];
  /** @deprecated use groups instead */
  movies: Array<Movie>;
  name: Scalars['String']['output'];
  o_counter?: Maybe<Scalars['Int']['output']>;
  parent_studio?: Maybe<Studio>;
  performer_count: Scalars['Int']['output'];
  rating100?: Maybe<Scalars['Int']['output']>;
  scene_count: Scalars['Int']['output'];
  stash_ids: Array<StashId>;
  tags: Array<Tag>;
  updated_at: Scalars['Time']['output'];
  /** @deprecated Use urls */
  url?: Maybe<Scalars['String']['output']>;
  urls: Array<Scalars['String']['output']>;
};


export type StudioGallery_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type StudioGroup_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type StudioImage_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type StudioMovie_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type StudioPerformer_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type StudioScene_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};

export type StudioCreateInput = {
  aliases?: InputMaybe<Array<Scalars['String']['input']>>;
  details?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  parent_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type StudioDestroyInput = {
  id: Scalars['ID']['input'];
};

export type StudioFilterType = {
  AND?: InputMaybe<StudioFilterType>;
  NOT?: InputMaybe<StudioFilterType>;
  OR?: InputMaybe<StudioFilterType>;
  /** Filter by studio aliases */
  aliases?: InputMaybe<StringCriterionInput>;
  /** Filter by subsidiary studio count */
  child_count?: InputMaybe<IntCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  details?: InputMaybe<StringCriterionInput>;
  /** Filter by favorite */
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  /** Filter by gallery count */
  gallery_count?: InputMaybe<IntCriterionInput>;
  /** Filter by autotag ignore value */
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by image count */
  image_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related images that meet this criteria */
  images_filter?: InputMaybe<ImageFilterType>;
  /** Filter to only include studios missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<StringCriterionInput>;
  /** Filter to only include studios with this parent studio */
  parents?: InputMaybe<MultiCriterionInput>;
  rating100?: InputMaybe<IntCriterionInput>;
  /** Filter by scene count */
  scene_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter by StashID */
  stash_id_endpoint?: InputMaybe<StashIdCriterionInput>;
  /** Filter by tag count */
  tag_count?: InputMaybe<IntCriterionInput>;
  /** Filter to only include studios with these tags */
  tags?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by url */
  url?: InputMaybe<StringCriterionInput>;
};

export type StudioUpdateInput = {
  aliases?: InputMaybe<Array<Scalars['String']['input']>>;
  details?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parent_id?: InputMaybe<Scalars['ID']['input']>;
  rating100?: InputMaybe<Scalars['Int']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
  tag_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  url?: InputMaybe<Scalars['String']['input']>;
  urls?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Subscription = {
  /** Update from the metadata manager */
  jobsSubscribe: JobStatusUpdate;
  loggingSubscribe: Array<LogEntry>;
  scanCompleteSubscribe: Scalars['Boolean']['output'];
};

export type SystemStatus = {
  appSchema: Scalars['Int']['output'];
  configPath?: Maybe<Scalars['String']['output']>;
  databasePath?: Maybe<Scalars['String']['output']>;
  databaseSchema?: Maybe<Scalars['Int']['output']>;
  ffmpegPath?: Maybe<Scalars['String']['output']>;
  ffprobePath?: Maybe<Scalars['String']['output']>;
  homeDir: Scalars['String']['output'];
  os: Scalars['String']['output'];
  status: SystemStatusEnum;
  workingDir: Scalars['String']['output'];
};

export enum SystemStatusEnum {
  NeedsMigration = 'NEEDS_MIGRATION',
  Ok = 'OK',
  Setup = 'SETUP'
}

export type Tag = {
  aliases: Array<Scalars['String']['output']>;
  child_count: Scalars['Int']['output'];
  children: Array<Tag>;
  created_at: Scalars['Time']['output'];
  description?: Maybe<Scalars['String']['output']>;
  favorite: Scalars['Boolean']['output'];
  gallery_count: Scalars['Int']['output'];
  group_count: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  ignore_auto_tag: Scalars['Boolean']['output'];
  image_count: Scalars['Int']['output'];
  image_path?: Maybe<Scalars['String']['output']>;
  /** @deprecated use group_count instead */
  movie_count: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  parent_count: Scalars['Int']['output'];
  parents: Array<Tag>;
  performer_count: Scalars['Int']['output'];
  scene_count: Scalars['Int']['output'];
  scene_marker_count: Scalars['Int']['output'];
  /** Value that does not appear in the UI but overrides name for sorting */
  sort_name?: Maybe<Scalars['String']['output']>;
  stash_ids: Array<StashId>;
  studio_count: Scalars['Int']['output'];
  updated_at: Scalars['Time']['output'];
};


export type TagGallery_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagGroup_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagImage_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagMovie_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagPerformer_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagScene_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagScene_Marker_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};


export type TagStudio_CountArgs = {
  depth?: InputMaybe<Scalars['Int']['input']>;
};

export type TagCreateInput = {
  aliases?: InputMaybe<Array<Scalars['String']['input']>>;
  child_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  description?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  parent_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Value that does not appear in the UI but overrides name for sorting */
  sort_name?: InputMaybe<Scalars['String']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
};

export type TagDestroyInput = {
  id: Scalars['ID']['input'];
};

export type TagFilterType = {
  AND?: InputMaybe<TagFilterType>;
  NOT?: InputMaybe<TagFilterType>;
  OR?: InputMaybe<TagFilterType>;
  /** Filter by tag aliases */
  aliases?: InputMaybe<StringCriterionInput>;
  /** Filter by number f child tags the tag has */
  child_count?: InputMaybe<IntCriterionInput>;
  /** Filter by child tags */
  children?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by creation time */
  created_at?: InputMaybe<TimestampCriterionInput>;
  /** Filter by tag description */
  description?: InputMaybe<StringCriterionInput>;
  /** Filter by favorite */
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by related galleries that meet this criteria */
  galleries_filter?: InputMaybe<GalleryFilterType>;
  /** Filter by number of galleries with this tag */
  gallery_count?: InputMaybe<IntCriterionInput>;
  /** Filter by number of group with this tag */
  group_count?: InputMaybe<IntCriterionInput>;
  /** Filter by autotag ignore value */
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** Filter by number of images with this tag */
  image_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related images that meet this criteria */
  images_filter?: InputMaybe<ImageFilterType>;
  /** Filter to only include tags missing this property */
  is_missing?: InputMaybe<Scalars['String']['input']>;
  /** Filter by number of markers with this tag */
  marker_count?: InputMaybe<IntCriterionInput>;
  /** Filter by number of movies with this tag */
  movie_count?: InputMaybe<IntCriterionInput>;
  /** Filter by tag name */
  name?: InputMaybe<StringCriterionInput>;
  /** Filter by number of parent tags the tag has */
  parent_count?: InputMaybe<IntCriterionInput>;
  /** Filter by parent tags */
  parents?: InputMaybe<HierarchicalMultiCriterionInput>;
  /** Filter by number of performers with this tag */
  performer_count?: InputMaybe<IntCriterionInput>;
  /** Filter by number of scenes with this tag */
  scene_count?: InputMaybe<IntCriterionInput>;
  /** Filter by related scenes that meet this criteria */
  scenes_filter?: InputMaybe<SceneFilterType>;
  /** Filter by tag sort_name */
  sort_name?: InputMaybe<StringCriterionInput>;
  /** Filter by StashID */
  stash_id_endpoint?: InputMaybe<StashIdCriterionInput>;
  /** Filter by number of studios with this tag */
  studio_count?: InputMaybe<IntCriterionInput>;
  /** Filter by last update time */
  updated_at?: InputMaybe<TimestampCriterionInput>;
};

export type TagUpdateInput = {
  aliases?: InputMaybe<Array<Scalars['String']['input']>>;
  child_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  description?: InputMaybe<Scalars['String']['input']>;
  favorite?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
  ignore_auto_tag?: InputMaybe<Scalars['Boolean']['input']>;
  /** This should be a URL or a base64 encoded data URL */
  image?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  parent_ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  /** Value that does not appear in the UI but overrides name for sorting */
  sort_name?: InputMaybe<Scalars['String']['input']>;
  stash_ids?: InputMaybe<Array<StashIdInput>>;
};

export type TagsMergeInput = {
  destination: Scalars['ID']['input'];
  source: Array<Scalars['ID']['input']>;
};

export type TimestampCriterionInput = {
  modifier: CriterionModifier;
  value: Scalars['String']['input'];
  value2?: InputMaybe<Scalars['String']['input']>;
};

export type Version = {
  build_time: Scalars['String']['output'];
  hash: Scalars['String']['output'];
  version?: Maybe<Scalars['String']['output']>;
};

export type VideoCaption = {
  caption_type: Scalars['String']['output'];
  language_code: Scalars['String']['output'];
};

export type VideoFile = BaseFile & {
  audio_codec: Scalars['String']['output'];
  basename: Scalars['String']['output'];
  bit_rate: Scalars['Int']['output'];
  created_at: Scalars['Time']['output'];
  duration: Scalars['Float']['output'];
  fingerprint?: Maybe<Scalars['String']['output']>;
  fingerprints: Array<Fingerprint>;
  format: Scalars['String']['output'];
  frame_rate: Scalars['Float']['output'];
  height: Scalars['Int']['output'];
  id: Scalars['ID']['output'];
  mod_time: Scalars['Time']['output'];
  parent_folder: Folder;
  /** @deprecated Use parent_folder instead */
  parent_folder_id: Scalars['ID']['output'];
  path: Scalars['String']['output'];
  size: Scalars['Int64']['output'];
  updated_at: Scalars['Time']['output'];
  video_codec: Scalars['String']['output'];
  width: Scalars['Int']['output'];
  zip_file?: Maybe<BasicFile>;
  /** @deprecated Use zip_file instead */
  zip_file_id?: Maybe<Scalars['ID']['output']>;
};


export type VideoFileFingerprintArgs = {
  type: Scalars['String']['input'];
};

export type VideoFileFilterInput = {
  audio_codec?: InputMaybe<StringCriterionInput>;
  bitrate?: InputMaybe<IntCriterionInput>;
  captions?: InputMaybe<StringCriterionInput>;
  /** in seconds */
  duration?: InputMaybe<IntCriterionInput>;
  format?: InputMaybe<StringCriterionInput>;
  framerate?: InputMaybe<IntCriterionInput>;
  interactive?: InputMaybe<Scalars['Boolean']['input']>;
  interactive_speed?: InputMaybe<IntCriterionInput>;
  orientation?: InputMaybe<OrientationCriterionInput>;
  resolution?: InputMaybe<ResolutionCriterionInput>;
  video_codec?: InputMaybe<StringCriterionInput>;
};

export type VisualFile = ImageFile | VideoFile;

export type ConfigurationQueryVariables = Exact<{ [key: string]: never; }>;


export type ConfigurationQuery = { configuration: { general: { stashes: Array<{ path: string, excludeVideo: boolean, excludeImage: boolean }> } } };

export type FindGalleriesQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  gallery_filter?: InputMaybe<GalleryFilterType>;
}>;


export type FindGalleriesQuery = { findGalleries: { count: number, galleries: Array<{ id: string, title?: string | null, code?: string | null, urls: Array<string>, date?: string | null, details?: string | null, photographer?: string | null, rating100?: number | null, organized: boolean, created_at: string, updated_at: string, image_count: number, studio?: { id: string, name: string, aliases: Array<string>, details?: string | null, favorite: boolean, rating100?: number | null, url?: string | null, parent_studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> } | null, performers: Array<{ id: string, name: string, image_path?: string | null, alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gender?: GenderEnum | null, hair_color?: string | null, height_cm?: number | null, measurements?: string | null, penis_length?: number | null, piercings?: string | null, rating100?: number | null, tattoos?: string | null, tags: Array<{ id: string, name: string }> }>, tags: Array<{ id: string, name: string, aliases: Array<string>, description?: string | null, favorite: boolean, ignore_auto_tag: boolean, image_path?: string | null, parent_count: number, child_count: number }>, scenes: Array<{ id: string, title?: string | null }>, files: Array<{ basename: string, path: string, size: number, created_at: string, updated_at: string }>, folder?: { path: string } | null, cover?: { id: string } | null, paths: { cover: string, preview: string } }> } };

export type FindGalleryQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type FindGalleryQuery = { findGallery?: { id: string, title?: string | null, code?: string | null, urls: Array<string>, date?: string | null, details?: string | null, photographer?: string | null, rating100?: number | null, organized: boolean, created_at: string, updated_at: string, image_count: number, studio?: { id: string, name: string, aliases: Array<string>, details?: string | null, favorite: boolean, rating100?: number | null, url?: string | null, parent_studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> } | null, performers: Array<{ id: string, name: string, alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gender?: GenderEnum | null, hair_color?: string | null, height_cm?: number | null, measurements?: string | null, penis_length?: number | null, piercings?: string | null, rating100?: number | null, tattoos?: string | null, tags: Array<{ id: string, name: string }> }>, tags: Array<{ id: string, name: string, aliases: Array<string>, description?: string | null, favorite: boolean, ignore_auto_tag: boolean, image_path?: string | null, parent_count: number, child_count: number }>, scenes: Array<{ id: string, title?: string | null }>, chapters: Array<{ id: string, title: string, image_index: number }>, files: Array<{ basename: string, path: string, size: number, created_at: string, updated_at: string }>, paths: { cover: string, preview: string } } | null };

export type FindGalleryIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  gallery_filter?: InputMaybe<GalleryFilterType>;
}>;


export type FindGalleryIDsQuery = { findGalleries: { count: number, galleries: Array<{ id: string }> } };

export type FindGroupQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type FindGroupQuery = { findGroup?: { id: string, name: string, aliases?: string | null, duration?: number | null, date?: string | null, rating100?: number | null, director?: string | null, synopsis?: string | null, urls: Array<string>, created_at: string, updated_at: string, front_image_path?: string | null, back_image_path?: string | null, scene_count: number, performer_count: number, sub_group_count: number, studio?: { id: string, name: string, image_path?: string | null } | null, tags: Array<{ id: string, name: string }>, containing_groups: Array<{ description?: string | null, group: { id: string, name: string } }>, sub_groups: Array<{ description?: string | null, group: { id: string, name: string } }> } | null };

export type FindGroupIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  group_filter?: InputMaybe<GroupFilterType>;
}>;


export type FindGroupIDsQuery = { findGroups: { count: number, groups: Array<{ id: string }> } };

export type FindGroupsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  group_filter?: InputMaybe<GroupFilterType>;
}>;


export type FindGroupsQuery = { findGroups: { count: number, groups: Array<{ id: string, name: string, aliases?: string | null, duration?: number | null, date?: string | null, rating100?: number | null, director?: string | null, synopsis?: string | null, urls: Array<string>, created_at: string, updated_at: string, front_image_path?: string | null, back_image_path?: string | null, scene_count: number, performer_count: number, sub_group_count: number, studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> }> } };

export type FindImageIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  image_filter?: InputMaybe<ImageFilterType>;
}>;


export type FindImageIDsQuery = { findImages: { count: number, images: Array<{ id: string }> } };

export type FindImagesQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  image_filter?: InputMaybe<ImageFilterType>;
  image_ids?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>;
}>;


export type FindImagesQuery = { findImages: { count: number, images: Array<{ id: string, title?: string | null, code?: string | null, rating100?: number | null, urls: Array<string>, date?: string | null, details?: string | null, photographer?: string | null, organized: boolean, created_at: string, updated_at: string, o_counter?: number | null, files: Array<{ id: string, basename: string, path: string, size: number, width: number, height: number }>, paths: { thumbnail?: string | null, preview?: string | null, image?: string | null }, galleries: Array<{ id: string, title?: string | null }>, studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string }>, performers: Array<{ id: string, name: string }> }> } };

export type FindPerformerIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  performer_filter?: InputMaybe<PerformerFilterType>;
}>;


export type FindPerformerIDsQuery = { findPerformers: { count: number, performers: Array<{ id: string }> } };

export type FindPerformersQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  performer_filter?: InputMaybe<PerformerFilterType>;
  performer_ids?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>;
}>;


export type FindPerformersQuery = { findPerformers: { count: number, performers: Array<{ alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, created_at: string, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gallery_count: number, gender?: GenderEnum | null, group_count: number, hair_color?: string | null, height_cm?: number | null, id: string, image_count: number, image_path?: string | null, instagram?: string | null, measurements?: string | null, movie_count: number, name: string, o_counter?: number | null, penis_length?: number | null, piercings?: string | null, rating100?: number | null, scene_count: number, tattoos?: string | null, twitter?: string | null, updated_at: string, url?: string | null, urls?: Array<string> | null, weight?: number | null, tags: Array<{ id: string, name: string, description?: string | null, image_path?: string | null, favorite: boolean }>, stash_ids: Array<{ endpoint: string, stash_id: string }> }> } };

export type FindSceneIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  scene_filter?: InputMaybe<SceneFilterType>;
}>;


export type FindSceneIDsQuery = { findScenes: { count: number, scenes: Array<{ id: string }> } };

export type FindSceneMarkersQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  scene_marker_filter?: InputMaybe<SceneMarkerFilterType>;
}>;


export type FindSceneMarkersQuery = { findSceneMarkers: { count: number, scene_markers: Array<{ id: string, title: string, seconds: number, end_seconds?: number | null, preview: string, screenshot: string, stream: string, created_at: string, updated_at: string, primary_tag: { id: string, name: string }, tags: Array<{ id: string, name: string }>, scene: { id: string } }> } };

export type FindScenesQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  scene_filter?: InputMaybe<SceneFilterType>;
  scene_ids?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>;
}>;


export type FindScenesQuery = { findScenes: { count: number, duration: number, filesize: number, scenes: Array<{ created_at: string, code?: string | null, date?: string | null, details?: string | null, director?: string | null, id: string, o_counter?: number | null, organized: boolean, play_count?: number | null, play_duration?: number | null, rating100?: number | null, resume_time?: number | null, title?: string | null, updated_at: string, studio?: { aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, name: string, rating100?: number | null, updated_at: string, url?: string | null, parent_studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string, image_path?: string | null, favorite: boolean }> } | null, performers: Array<{ alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, created_at: string, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gender?: GenderEnum | null, hair_color?: string | null, height_cm?: number | null, id: string, image_path?: string | null, measurements?: string | null, name: string, penis_length?: number | null, piercings?: string | null, rating100?: number | null, tattoos?: string | null, updated_at: string, tags: Array<{ id: string, name: string, image_path?: string | null, favorite: boolean }> }>, tags: Array<{ aliases: Array<string>, child_count: number, created_at: string, description?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, image_path?: string | null, name: string, parent_count: number, updated_at: string }>, files: Array<{ audio_codec: string, basename: string, bit_rate: number, created_at: string, duration: number, format: string, frame_rate: number, height: number, path: string, size: number, updated_at: string, video_codec: string, width: number }>, paths: { preview?: string | null, screenshot?: string | null, sprite?: string | null, vtt?: string | null, webp?: string | null }, sceneStreams: Array<{ url: string, mime_type?: string | null, label?: string | null }>, galleries: Array<{ id: string, title?: string | null }>, groups: Array<{ scene_index?: number | null, group: { id: string, name: string } }> }> } };

export type FindScenesCompactQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  scene_filter?: InputMaybe<SceneFilterType>;
  scene_ids?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>;
}>;


export type FindScenesCompactQuery = { findScenes: { count: number, duration: number, filesize: number, scenes: Array<{ created_at: string, code?: string | null, date?: string | null, details?: string | null, director?: string | null, id: string, o_counter?: number | null, organized: boolean, play_count?: number | null, play_duration?: number | null, rating100?: number | null, resume_time?: number | null, title?: string | null, updated_at: string, urls: Array<string>, studio?: { id: string, name: string, tags: Array<{ id: string, name: string, image_path?: string | null, favorite: boolean }> } | null, performers: Array<{ id: string, name: string, image_path?: string | null, gender?: GenderEnum | null, tags: Array<{ id: string, name: string, image_path?: string | null, favorite: boolean }> }>, tags: Array<{ id: string, name: string, image_path?: string | null, favorite: boolean }>, files: Array<{ audio_codec: string, basename: string, bit_rate: number, created_at: string, duration: number, format: string, frame_rate: number, height: number, path: string, size: number, updated_at: string, video_codec: string, width: number, fingerprints: Array<{ type: string, value: string }> }>, paths: { preview?: string | null, screenshot?: string | null, sprite?: string | null, vtt?: string | null, webp?: string | null, caption?: string | null }, sceneStreams: Array<{ url: string, mime_type?: string | null, label?: string | null }>, captions?: Array<{ language_code: string, caption_type: string }> | null, galleries: Array<{ id: string, title?: string | null }>, groups: Array<{ scene_index?: number | null, group: { id: string, name: string } }> }> } };

export type FindStudioIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  studio_filter?: InputMaybe<StudioFilterType>;
}>;


export type FindStudioIDsQuery = { findStudios: { count: number, studios: Array<{ id: string }> } };

export type FindStudiosQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  studio_filter?: InputMaybe<StudioFilterType>;
}>;


export type FindStudiosQuery = { findStudios: { count: number, studios: Array<{ aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, gallery_count: number, group_count: number, id: string, image_count: number, image_path?: string | null, movie_count: number, name: string, performer_count: number, rating100?: number | null, scene_count: number, updated_at: string, url?: string | null, child_studios: Array<{ id: string, name: string }>, groups: Array<{ id: string, name: string }>, movies: Array<{ id: string, name: string }>, parent_studio?: { id: string, name: string, image_path?: string | null } | null, tags: Array<{ description?: string | null, id: string, name: string, image_path?: string | null, favorite: boolean }>, stash_ids: Array<{ endpoint: string, stash_id: string }> }> } };

export type FindTagIDsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  tag_filter?: InputMaybe<TagFilterType>;
}>;


export type FindTagIDsQuery = { findTags: { count: number, tags: Array<{ id: string }> } };

export type FindTagsQueryVariables = Exact<{
  filter?: InputMaybe<FindFilterType>;
  ids?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  tag_filter?: InputMaybe<TagFilterType>;
}>;


export type FindTagsQuery = { findTags: { count: number, tags: Array<{ aliases: Array<string>, child_count: number, created_at: string, description?: string | null, favorite: boolean, gallery_count: number, group_count: number, id: string, image_count: number, image_path?: string | null, movie_count: number, name: string, parent_count: number, performer_count: number, scene_count: number, scene_marker_count: number, studio_count: number, updated_at: string, children: Array<{ id: string, name: string }>, parents: Array<{ id: string, name: string }>, stash_ids: Array<{ endpoint: string, stash_id: string }> }> } };

export type GalleryUpdateMutationVariables = Exact<{
  input: GalleryUpdateInput;
}>;


export type GalleryUpdateMutation = { galleryUpdate?: { id: string, title?: string | null, code?: string | null, urls: Array<string>, date?: string | null, details?: string | null, photographer?: string | null, rating100?: number | null, organized: boolean, created_at: string, updated_at: string, studio?: { id: string, name: string } | null, performers: Array<{ id: string, name: string }>, tags: Array<{ id: string, name: string }>, scenes: Array<{ id: string, title?: string | null }> } | null };

export type GroupUpdateMutationVariables = Exact<{
  input: GroupUpdateInput;
}>;


export type GroupUpdateMutation = { groupUpdate?: { id: string, name: string, aliases?: string | null, duration?: number | null, date?: string | null, rating100?: number | null, director?: string | null, synopsis?: string | null, urls: Array<string>, created_at: string, updated_at: string, front_image_path?: string | null, back_image_path?: string | null, studio?: { id: string, name: string } | null, tags: Array<{ id: string, name: string }> } | null };

export type ImageUpdateMutationVariables = Exact<{
  input: ImageUpdateInput;
}>;


export type ImageUpdateMutation = { imageUpdate?: { id: string, title?: string | null, code?: string | null, rating100?: number | null, urls: Array<string>, date?: string | null, details?: string | null, photographer?: string | null, o_counter?: number | null, organized: boolean, created_at: string, updated_at: string, studio?: { id: string, name: string } | null, performers: Array<{ id: string, name: string }>, tags: Array<{ id: string, name: string }>, galleries: Array<{ id: string, title?: string | null }> } | null };

export type MetadataScanMutationVariables = Exact<{
  input: ScanMetadataInput;
}>;


export type MetadataScanMutation = { metadataScan: string };

export type PerformerDestroyMutationVariables = Exact<{
  input: PerformerDestroyInput;
}>;


export type PerformerDestroyMutation = { performerDestroy: boolean };

export type PerformerUpdateMutationVariables = Exact<{
  input: PerformerUpdateInput;
}>;


export type PerformerUpdateMutation = { performerUpdate?: { alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, created_at: string, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gallery_count: number, gender?: GenderEnum | null, group_count: number, hair_color?: string | null, height_cm?: number | null, id: string, image_count: number, image_path?: string | null, instagram?: string | null, measurements?: string | null, movie_count: number, name: string, o_counter?: number | null, penis_length?: number | null, piercings?: string | null, rating100?: number | null, scene_count: number, tattoos?: string | null, twitter?: string | null, updated_at: string, url?: string | null, urls?: Array<string> | null, weight?: number | null, tags: Array<{ id: string, name: string, description?: string | null }>, stash_ids: Array<{ endpoint: string, stash_id: string }> } | null };

export type PerformersDestroyMutationVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type PerformersDestroyMutation = { performersDestroy: boolean };

export type SceneAddPlayMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  times?: InputMaybe<Array<Scalars['Timestamp']['input']> | Scalars['Timestamp']['input']>;
}>;


export type SceneAddPlayMutation = { sceneAddPlay: { count: number, history: Array<string> } };

export type SceneDecrementOMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type SceneDecrementOMutation = { sceneDecrementO: number };

export type SceneDestroyMutationVariables = Exact<{
  input: SceneDestroyInput;
}>;


export type SceneDestroyMutation = { sceneDestroy: boolean };

export type SceneIncrementOMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type SceneIncrementOMutation = { sceneIncrementO: number };

export type SceneSaveActivityMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  resume_time?: InputMaybe<Scalars['Float']['input']>;
  playDuration?: InputMaybe<Scalars['Float']['input']>;
}>;


export type SceneSaveActivityMutation = { sceneSaveActivity: boolean };

export type SceneUpdateMutationVariables = Exact<{
  input: SceneUpdateInput;
}>;


export type SceneUpdateMutation = { sceneUpdate?: { code?: string | null, created_at: string, date?: string | null, details?: string | null, director?: string | null, id: string, o_counter?: number | null, organized: boolean, play_count?: number | null, play_duration?: number | null, rating100?: number | null, resume_time?: number | null, title?: string | null, updated_at: string, urls: Array<string>, files: Array<{ audio_codec: string, basename: string, bit_rate: number, created_at: string, duration: number, format: string, frame_rate: number, height: number, id: string, mod_time: string, path: string, size: number, updated_at: string, video_codec: string, width: number, fingerprints: Array<{ type: string, value: string }> }>, galleries: Array<{ id: string, title?: string | null }>, groups: Array<{ group: { id: string, name: string } }>, movies: Array<{ movie: { id: string, name: string } }>, paths: { preview?: string | null, screenshot?: string | null, sprite?: string | null, stream?: string | null, webp?: string | null }, performers: Array<{ alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, created_at: string, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gender?: GenderEnum | null, hair_color?: string | null, height_cm?: number | null, id: string, measurements?: string | null, name: string, penis_length?: number | null, piercings?: string | null, rating100?: number | null, tattoos?: string | null, updated_at: string }>, studio?: { aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, name: string, rating100?: number | null, updated_at: string, url?: string | null, parent_studio?: { id: string, name: string } | null } | null, tags: Array<{ aliases: Array<string>, child_count: number, created_at: string, description?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, name: string, parent_count: number, updated_at: string }> } | null };

export type ScenesUpdateMutationVariables = Exact<{
  input: BulkSceneUpdateInput;
}>;


export type ScenesUpdateMutation = { bulkSceneUpdate?: Array<{ code?: string | null, created_at: string, date?: string | null, details?: string | null, director?: string | null, id: string, o_counter?: number | null, organized: boolean, play_count?: number | null, play_duration?: number | null, rating100?: number | null, resume_time?: number | null, title?: string | null, updated_at: string, urls: Array<string>, files: Array<{ audio_codec: string, basename: string, bit_rate: number, created_at: string, duration: number, format: string, frame_rate: number, height: number, id: string, mod_time: string, path: string, size: number, updated_at: string, video_codec: string, width: number, fingerprints: Array<{ type: string, value: string }> }>, galleries: Array<{ id: string, title?: string | null }>, groups: Array<{ group: { id: string, name: string } }>, movies: Array<{ movie: { id: string, name: string } }>, paths: { preview?: string | null, screenshot?: string | null, sprite?: string | null, stream?: string | null, webp?: string | null }, performers: Array<{ alias_list: Array<string>, birthdate?: string | null, career_length?: string | null, circumcised?: CircumisedEnum | null, country?: string | null, created_at: string, death_date?: string | null, details?: string | null, disambiguation?: string | null, ethnicity?: string | null, eye_color?: string | null, fake_tits?: string | null, favorite: boolean, gender?: GenderEnum | null, hair_color?: string | null, height_cm?: number | null, id: string, measurements?: string | null, name: string, penis_length?: number | null, piercings?: string | null, rating100?: number | null, tattoos?: string | null, updated_at: string }>, studio?: { aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, name: string, rating100?: number | null, updated_at: string, url?: string | null, parent_studio?: { id: string, name: string } | null } | null, tags: Array<{ aliases: Array<string>, child_count: number, created_at: string, description?: string | null, favorite: boolean, id: string, ignore_auto_tag: boolean, name: string, parent_count: number, updated_at: string }> }> | null };

export type StudioDestroyMutationVariables = Exact<{
  input: StudioDestroyInput;
}>;


export type StudioDestroyMutation = { studioDestroy: boolean };

export type StudioUpdateMutationVariables = Exact<{
  input: StudioUpdateInput;
}>;


export type StudioUpdateMutation = { studioUpdate?: { aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, gallery_count: number, group_count: number, id: string, ignore_auto_tag: boolean, image_count: number, image_path?: string | null, movie_count: number, name: string, performer_count: number, rating100?: number | null, scene_count: number, updated_at: string, url?: string | null, child_studios: Array<{ id: string, name: string }>, groups: Array<{ id: string, name: string }>, movies: Array<{ id: string, name: string }>, parent_studio?: { aliases: Array<string>, created_at: string, details?: string | null, favorite: boolean, id: string, image_count: number, image_path?: string | null, gallery_count: number, movie_count: number, name: string, performer_count: number, rating100?: number | null, scene_count: number, updated_at: string, url?: string | null } | null, stash_ids: Array<{ endpoint: string, stash_id: string }>, tags: Array<{ description?: string | null, id: string, name: string }> } | null };

export type StudiosDestroyMutationVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type StudiosDestroyMutation = { studiosDestroy: boolean };

export type TagCreateMutationVariables = Exact<{
  input: TagCreateInput;
}>;


export type TagCreateMutation = { tagCreate?: { aliases: Array<string>, created_at: string, description?: string | null, favorite: boolean, gallery_count: number, group_count: number, id: string, image_count: number, image_path?: string | null, movie_count: number, name: string, parent_count: number, performer_count: number, scene_count: number, scene_marker_count: number, sort_name?: string | null, studio_count: number, updated_at: string, parents: Array<{ id: string, name: string }> } | null };

export type TagDestroyMutationVariables = Exact<{
  input: TagDestroyInput;
}>;


export type TagDestroyMutation = { tagDestroy: boolean };

export type TagUpdateMutationVariables = Exact<{
  input: TagUpdateInput;
}>;


export type TagUpdateMutation = { tagUpdate?: { aliases: Array<string>, created_at: string, description?: string | null, favorite: boolean, gallery_count: number, group_count: number, id: string, image_count: number, image_path?: string | null, movie_count: number, name: string, parent_count: number, performer_count: number, scene_count: number, scene_marker_count: number, sort_name?: string | null, studio_count: number, updated_at: string, parents: Array<{ id: string, name: string }> } | null };

export type TagsDestroyMutationVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type TagsDestroyMutation = { tagsDestroy: boolean };

export type VersionQueryVariables = Exact<{ [key: string]: never; }>;


export type VersionQuery = { version: { version?: string | null, hash: string, build_time: string } };


export const ConfigurationDocument = gql`
    query Configuration {
  configuration {
    general {
      stashes {
        path
        excludeVideo
        excludeImage
      }
    }
  }
}
    `;
export const FindGalleriesDocument = gql`
    query FindGalleries($filter: FindFilterType, $ids: [ID!], $gallery_filter: GalleryFilterType) {
  findGalleries(filter: $filter, ids: $ids, gallery_filter: $gallery_filter) {
    count
    galleries {
      id
      title
      code
      urls
      date
      details
      photographer
      rating100
      organized
      created_at
      updated_at
      image_count
      studio {
        id
        name
        aliases
        details
        favorite
        rating100
        url
        parent_studio {
          id
          name
        }
        tags {
          id
          name
        }
      }
      performers {
        id
        name
        image_path
        alias_list
        birthdate
        career_length
        circumcised
        country
        death_date
        details
        disambiguation
        ethnicity
        eye_color
        fake_tits
        favorite
        gender
        hair_color
        height_cm
        measurements
        penis_length
        piercings
        rating100
        tattoos
        tags {
          id
          name
        }
      }
      tags {
        id
        name
        aliases
        description
        favorite
        ignore_auto_tag
        image_path
        parent_count
        child_count
      }
      scenes {
        id
        title
      }
      files {
        basename
        path
        size
        created_at
        updated_at
      }
      folder {
        path
      }
      cover {
        id
      }
      paths {
        cover
        preview
      }
    }
  }
}
    `;
export const FindGalleryDocument = gql`
    query FindGallery($id: ID!) {
  findGallery(id: $id) {
    id
    title
    code
    urls
    date
    details
    photographer
    rating100
    organized
    created_at
    updated_at
    image_count
    studio {
      id
      name
      aliases
      details
      favorite
      rating100
      url
      parent_studio {
        id
        name
      }
      tags {
        id
        name
      }
    }
    performers {
      id
      name
      alias_list
      birthdate
      career_length
      circumcised
      country
      death_date
      details
      disambiguation
      ethnicity
      eye_color
      fake_tits
      favorite
      gender
      hair_color
      height_cm
      measurements
      penis_length
      piercings
      rating100
      tattoos
      tags {
        id
        name
      }
    }
    tags {
      id
      name
      aliases
      description
      favorite
      ignore_auto_tag
      image_path
      parent_count
      child_count
    }
    scenes {
      id
      title
    }
    chapters {
      id
      title
      image_index
    }
    files {
      basename
      path
      size
      created_at
      updated_at
    }
    paths {
      cover
      preview
    }
  }
}
    `;
export const FindGalleryIDsDocument = gql`
    query FindGalleryIDs($filter: FindFilterType, $gallery_filter: GalleryFilterType) {
  findGalleries(filter: $filter, gallery_filter: $gallery_filter) {
    count
    galleries {
      id
    }
  }
}
    `;
export const FindGroupDocument = gql`
    query FindGroup($id: ID!) {
  findGroup(id: $id) {
    id
    name
    aliases
    duration
    date
    rating100
    studio {
      id
      name
      image_path
    }
    director
    synopsis
    urls
    tags {
      id
      name
    }
    created_at
    updated_at
    containing_groups {
      group {
        id
        name
      }
      description
    }
    sub_groups {
      group {
        id
        name
      }
      description
    }
    front_image_path
    back_image_path
    scene_count
    performer_count
    sub_group_count
  }
}
    `;
export const FindGroupIDsDocument = gql`
    query FindGroupIDs($filter: FindFilterType, $group_filter: GroupFilterType) {
  findGroups(filter: $filter, group_filter: $group_filter) {
    count
    groups {
      id
    }
  }
}
    `;
export const FindGroupsDocument = gql`
    query FindGroups($filter: FindFilterType, $ids: [ID!], $group_filter: GroupFilterType) {
  findGroups(filter: $filter, ids: $ids, group_filter: $group_filter) {
    count
    groups {
      id
      name
      aliases
      duration
      date
      rating100
      studio {
        id
        name
      }
      director
      synopsis
      urls
      tags {
        id
        name
      }
      created_at
      updated_at
      front_image_path
      back_image_path
      scene_count
      performer_count
      sub_group_count
    }
  }
}
    `;
export const FindImageIDsDocument = gql`
    query FindImageIDs($filter: FindFilterType, $image_filter: ImageFilterType) {
  findImages(filter: $filter, image_filter: $image_filter) {
    count
    images {
      id
    }
  }
}
    `;
export const FindImagesDocument = gql`
    query FindImages($filter: FindFilterType, $image_filter: ImageFilterType, $image_ids: [Int!]) {
  findImages(filter: $filter, image_filter: $image_filter, image_ids: $image_ids) {
    count
    images {
      id
      title
      code
      rating100
      urls
      date
      details
      photographer
      organized
      created_at
      updated_at
      o_counter
      files {
        id
        basename
        path
        size
        width
        height
      }
      paths {
        thumbnail
        preview
        image
      }
      galleries {
        id
        title
      }
      studio {
        id
        name
      }
      tags {
        id
        name
      }
      performers {
        id
        name
      }
    }
  }
}
    `;
export const FindPerformerIDsDocument = gql`
    query FindPerformerIDs($filter: FindFilterType, $performer_filter: PerformerFilterType) {
  findPerformers(filter: $filter, performer_filter: $performer_filter) {
    count
    performers {
      id
    }
  }
}
    `;
export const FindPerformersDocument = gql`
    query FindPerformers($filter: FindFilterType, $ids: [ID!], $performer_filter: PerformerFilterType, $performer_ids: [Int!]) {
  findPerformers(
    filter: $filter
    ids: $ids
    performer_filter: $performer_filter
    performer_ids: $performer_ids
  ) {
    count
    performers {
      alias_list
      birthdate
      career_length
      circumcised
      country
      created_at
      death_date
      details
      disambiguation
      ethnicity
      eye_color
      fake_tits
      favorite
      gallery_count
      gender
      group_count
      hair_color
      height_cm
      id
      image_count
      image_path
      instagram
      measurements
      movie_count
      name
      o_counter
      penis_length
      piercings
      rating100
      scene_count
      tattoos
      twitter
      updated_at
      url
      urls
      weight
      tags {
        id
        name
        description
        image_path
        favorite
      }
      stash_ids {
        endpoint
        stash_id
      }
    }
  }
}
    `;
export const FindSceneIDsDocument = gql`
    query FindSceneIDs($filter: FindFilterType, $scene_filter: SceneFilterType) {
  findScenes(filter: $filter, scene_filter: $scene_filter) {
    count
    scenes {
      id
    }
  }
}
    `;
export const FindSceneMarkersDocument = gql`
    query FindSceneMarkers($filter: FindFilterType, $scene_marker_filter: SceneMarkerFilterType) {
  findSceneMarkers(filter: $filter, scene_marker_filter: $scene_marker_filter) {
    count
    scene_markers {
      id
      title
      seconds
      end_seconds
      preview
      screenshot
      stream
      created_at
      updated_at
      primary_tag {
        id
        name
      }
      tags {
        id
        name
      }
      scene {
        id
      }
    }
  }
}
    `;
export const FindScenesDocument = gql`
    query FindScenes($filter: FindFilterType, $ids: [ID!], $scene_filter: SceneFilterType, $scene_ids: [Int!]) {
  findScenes(
    filter: $filter
    ids: $ids
    scene_filter: $scene_filter
    scene_ids: $scene_ids
  ) {
    count
    duration
    filesize
    scenes {
      created_at
      code
      date
      details
      director
      id
      o_counter
      organized
      play_count
      play_duration
      rating100
      resume_time
      title
      updated_at
      studio {
        aliases
        created_at
        details
        favorite
        id
        ignore_auto_tag
        name
        parent_studio {
          id
          name
        }
        rating100
        updated_at
        url
        tags {
          id
          name
          image_path
          favorite
        }
      }
      performers {
        alias_list
        birthdate
        career_length
        circumcised
        country
        created_at
        death_date
        details
        disambiguation
        ethnicity
        eye_color
        fake_tits
        favorite
        gender
        hair_color
        height_cm
        id
        image_path
        measurements
        name
        penis_length
        piercings
        rating100
        tattoos
        updated_at
        tags {
          id
          name
          image_path
          favorite
        }
      }
      tags {
        aliases
        child_count
        created_at
        description
        favorite
        id
        ignore_auto_tag
        image_path
        name
        parent_count
        updated_at
      }
      files {
        audio_codec
        basename
        bit_rate
        created_at
        duration
        format
        frame_rate
        height
        path
        size
        updated_at
        video_codec
        width
      }
      paths {
        preview
        screenshot
        sprite
        vtt
        webp
      }
      sceneStreams {
        url
        mime_type
        label
      }
      galleries {
        id
        title
      }
      groups {
        scene_index
        group {
          id
          name
        }
      }
      created_at
      updated_at
    }
  }
}
    `;
export const FindScenesCompactDocument = gql`
    query FindScenesCompact($filter: FindFilterType, $ids: [ID!], $scene_filter: SceneFilterType, $scene_ids: [Int!]) {
  findScenes(
    filter: $filter
    ids: $ids
    scene_filter: $scene_filter
    scene_ids: $scene_ids
  ) {
    count
    duration
    filesize
    scenes {
      created_at
      code
      date
      details
      director
      id
      o_counter
      organized
      play_count
      play_duration
      rating100
      resume_time
      title
      updated_at
      urls
      studio {
        id
        name
        tags {
          id
          name
          image_path
          favorite
        }
      }
      performers {
        id
        name
        image_path
        gender
        tags {
          id
          name
          image_path
          favorite
        }
      }
      tags {
        id
        name
        image_path
        favorite
      }
      files {
        audio_codec
        basename
        bit_rate
        created_at
        duration
        format
        frame_rate
        height
        path
        size
        updated_at
        video_codec
        width
        fingerprints {
          type
          value
        }
      }
      paths {
        preview
        screenshot
        sprite
        vtt
        webp
        caption
      }
      sceneStreams {
        url
        mime_type
        label
      }
      captions {
        language_code
        caption_type
      }
      galleries {
        id
        title
      }
      groups {
        group {
          id
          name
        }
        scene_index
      }
      created_at
      updated_at
    }
  }
}
    `;
export const FindStudioIDsDocument = gql`
    query FindStudioIDs($filter: FindFilterType, $studio_filter: StudioFilterType) {
  findStudios(filter: $filter, studio_filter: $studio_filter) {
    count
    studios {
      id
    }
  }
}
    `;
export const FindStudiosDocument = gql`
    query FindStudios($filter: FindFilterType, $ids: [ID!], $studio_filter: StudioFilterType) {
  findStudios(filter: $filter, ids: $ids, studio_filter: $studio_filter) {
    count
    studios {
      aliases
      child_studios {
        id
        name
      }
      created_at
      details
      favorite
      gallery_count
      group_count
      groups {
        id
        name
      }
      id
      image_count
      image_path
      movie_count
      movies {
        id
        name
      }
      name
      parent_studio {
        id
        name
        image_path
      }
      performer_count
      rating100
      scene_count
      tags {
        description
        id
        name
        image_path
        favorite
      }
      updated_at
      url
      stash_ids {
        endpoint
        stash_id
      }
    }
  }
}
    `;
export const FindTagIDsDocument = gql`
    query FindTagIDs($filter: FindFilterType, $tag_filter: TagFilterType) {
  findTags(filter: $filter, tag_filter: $tag_filter) {
    count
    tags {
      id
    }
  }
}
    `;
export const FindTagsDocument = gql`
    query FindTags($filter: FindFilterType, $ids: [ID!], $tag_filter: TagFilterType) {
  findTags(filter: $filter, ids: $ids, tag_filter: $tag_filter) {
    count
    tags {
      aliases
      child_count
      children {
        id
        name
      }
      created_at
      description
      favorite
      gallery_count
      group_count
      id
      image_count
      image_path
      movie_count
      name
      parent_count
      parents {
        id
        name
      }
      performer_count
      scene_count
      scene_marker_count
      studio_count
      updated_at
      stash_ids {
        endpoint
        stash_id
      }
    }
  }
}
    `;
export const GalleryUpdateDocument = gql`
    mutation galleryUpdate($input: GalleryUpdateInput!) {
  galleryUpdate(input: $input) {
    id
    title
    code
    urls
    date
    details
    photographer
    rating100
    organized
    created_at
    updated_at
    studio {
      id
      name
    }
    performers {
      id
      name
    }
    tags {
      id
      name
    }
    scenes {
      id
      title
    }
  }
}
    `;
export const GroupUpdateDocument = gql`
    mutation groupUpdate($input: GroupUpdateInput!) {
  groupUpdate(input: $input) {
    id
    name
    aliases
    duration
    date
    rating100
    director
    synopsis
    urls
    created_at
    updated_at
    studio {
      id
      name
    }
    tags {
      id
      name
    }
    front_image_path
    back_image_path
  }
}
    `;
export const ImageUpdateDocument = gql`
    mutation imageUpdate($input: ImageUpdateInput!) {
  imageUpdate(input: $input) {
    id
    title
    code
    rating100
    urls
    date
    details
    photographer
    o_counter
    organized
    created_at
    updated_at
    studio {
      id
      name
    }
    performers {
      id
      name
    }
    tags {
      id
      name
    }
    galleries {
      id
      title
    }
  }
}
    `;
export const MetadataScanDocument = gql`
    mutation metadataScan($input: ScanMetadataInput!) {
  metadataScan(input: $input)
}
    `;
export const PerformerDestroyDocument = gql`
    mutation performerDestroy($input: PerformerDestroyInput!) {
  performerDestroy(input: $input)
}
    `;
export const PerformerUpdateDocument = gql`
    mutation performerUpdate($input: PerformerUpdateInput!) {
  performerUpdate(input: $input) {
    alias_list
    birthdate
    career_length
    circumcised
    country
    created_at
    death_date
    details
    disambiguation
    ethnicity
    eye_color
    fake_tits
    favorite
    gallery_count
    gender
    group_count
    hair_color
    height_cm
    id
    image_count
    image_path
    instagram
    measurements
    movie_count
    name
    o_counter
    penis_length
    piercings
    rating100
    scene_count
    tattoos
    twitter
    updated_at
    url
    urls
    weight
    tags {
      id
      name
      description
    }
    stash_ids {
      endpoint
      stash_id
    }
  }
}
    `;
export const PerformersDestroyDocument = gql`
    mutation performersDestroy($ids: [ID!]!) {
  performersDestroy(ids: $ids)
}
    `;
export const SceneAddPlayDocument = gql`
    mutation SceneAddPlay($id: ID!, $times: [Timestamp!]) {
  sceneAddPlay(id: $id, times: $times) {
    count
    history
  }
}
    `;
export const SceneDecrementODocument = gql`
    mutation SceneDecrementO($id: ID!) {
  sceneDecrementO(id: $id)
}
    `;
export const SceneDestroyDocument = gql`
    mutation sceneDestroy($input: SceneDestroyInput!) {
  sceneDestroy(input: $input)
}
    `;
export const SceneIncrementODocument = gql`
    mutation sceneIncrementO($id: ID!) {
  sceneIncrementO(id: $id)
}
    `;
export const SceneSaveActivityDocument = gql`
    mutation SceneSaveActivity($id: ID!, $resume_time: Float, $playDuration: Float) {
  sceneSaveActivity(
    id: $id
    resume_time: $resume_time
    playDuration: $playDuration
  )
}
    `;
export const SceneUpdateDocument = gql`
    mutation sceneUpdate($input: SceneUpdateInput!) {
  sceneUpdate(input: $input) {
    code
    created_at
    date
    details
    director
    files {
      audio_codec
      basename
      bit_rate
      created_at
      duration
      fingerprints {
        type
        value
      }
      format
      frame_rate
      height
      id
      mod_time
      path
      size
      updated_at
      video_codec
      width
    }
    galleries {
      id
      title
    }
    groups {
      group {
        id
        name
      }
    }
    id
    movies {
      movie {
        id
        name
      }
    }
    o_counter
    organized
    paths {
      preview
      screenshot
      sprite
      stream
      webp
    }
    performers {
      alias_list
      birthdate
      career_length
      circumcised
      country
      created_at
      death_date
      details
      disambiguation
      ethnicity
      eye_color
      fake_tits
      favorite
      gender
      hair_color
      height_cm
      id
      measurements
      name
      penis_length
      piercings
      rating100
      tattoos
      updated_at
    }
    play_count
    play_duration
    rating100
    resume_time
    studio {
      aliases
      created_at
      details
      favorite
      id
      ignore_auto_tag
      name
      parent_studio {
        id
        name
      }
      rating100
      updated_at
      url
    }
    tags {
      aliases
      child_count
      created_at
      description
      favorite
      id
      ignore_auto_tag
      name
      parent_count
      updated_at
    }
    title
    updated_at
    urls
  }
}
    `;
export const ScenesUpdateDocument = gql`
    mutation scenesUpdate($input: BulkSceneUpdateInput!) {
  bulkSceneUpdate(input: $input) {
    code
    created_at
    date
    details
    director
    files {
      audio_codec
      basename
      bit_rate
      created_at
      duration
      fingerprints {
        type
        value
      }
      format
      frame_rate
      height
      id
      mod_time
      path
      size
      updated_at
      video_codec
      width
    }
    galleries {
      id
      title
    }
    groups {
      group {
        id
        name
      }
    }
    id
    movies {
      movie {
        id
        name
      }
    }
    o_counter
    organized
    paths {
      preview
      screenshot
      sprite
      stream
      webp
    }
    performers {
      alias_list
      birthdate
      career_length
      circumcised
      country
      created_at
      death_date
      details
      disambiguation
      ethnicity
      eye_color
      fake_tits
      favorite
      gender
      hair_color
      height_cm
      id
      measurements
      name
      penis_length
      piercings
      rating100
      tattoos
      updated_at
    }
    play_count
    play_duration
    rating100
    resume_time
    studio {
      aliases
      created_at
      details
      favorite
      id
      ignore_auto_tag
      name
      parent_studio {
        id
        name
      }
      rating100
      updated_at
      url
    }
    tags {
      aliases
      child_count
      created_at
      description
      favorite
      id
      ignore_auto_tag
      name
      parent_count
      updated_at
    }
    title
    updated_at
    urls
  }
}
    `;
export const StudioDestroyDocument = gql`
    mutation studioDestroy($input: StudioDestroyInput!) {
  studioDestroy(input: $input)
}
    `;
export const StudioUpdateDocument = gql`
    mutation studioUpdate($input: StudioUpdateInput!) {
  studioUpdate(input: $input) {
    aliases
    child_studios {
      id
      name
    }
    created_at
    details
    favorite
    gallery_count
    group_count
    groups {
      id
      name
    }
    id
    ignore_auto_tag
    image_count
    image_path
    movie_count
    movies {
      id
      name
    }
    name
    parent_studio {
      aliases
      created_at
      details
      favorite
      id
      image_count
      image_path
      gallery_count
      movie_count
      name
      performer_count
      rating100
      scene_count
      updated_at
      url
    }
    performer_count
    rating100
    scene_count
    stash_ids {
      endpoint
      stash_id
    }
    tags {
      description
      id
      name
    }
    updated_at
    url
  }
}
    `;
export const StudiosDestroyDocument = gql`
    mutation studiosDestroy($ids: [ID!]!) {
  studiosDestroy(ids: $ids)
}
    `;
export const TagCreateDocument = gql`
    mutation tagCreate($input: TagCreateInput!) {
  tagCreate(input: $input) {
    aliases
    created_at
    description
    favorite
    gallery_count
    group_count
    id
    image_count
    image_path
    movie_count
    name
    parent_count
    parents {
      id
      name
    }
    performer_count
    scene_count
    scene_marker_count
    sort_name
    studio_count
    updated_at
  }
}
    `;
export const TagDestroyDocument = gql`
    mutation tagDestroy($input: TagDestroyInput!) {
  tagDestroy(input: $input)
}
    `;
export const TagUpdateDocument = gql`
    mutation tagUpdate($input: TagUpdateInput!) {
  tagUpdate(input: $input) {
    aliases
    created_at
    description
    favorite
    gallery_count
    group_count
    id
    image_count
    image_path
    movie_count
    name
    parent_count
    parents {
      id
      name
    }
    performer_count
    scene_count
    scene_marker_count
    sort_name
    studio_count
    updated_at
  }
}
    `;
export const TagsDestroyDocument = gql`
    mutation tagsDestroy($ids: [ID!]!) {
  tagsDestroy(ids: $ids)
}
    `;
export const VersionDocument = gql`
    query Version {
  version {
    version
    hash
    build_time
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    Configuration(variables?: ConfigurationQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<ConfigurationQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<ConfigurationQuery>({ document: ConfigurationDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'Configuration', 'query', variables);
    },
    FindGalleries(variables?: FindGalleriesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGalleriesQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGalleriesQuery>({ document: FindGalleriesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGalleries', 'query', variables);
    },
    FindGallery(variables: FindGalleryQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGalleryQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGalleryQuery>({ document: FindGalleryDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGallery', 'query', variables);
    },
    FindGalleryIDs(variables?: FindGalleryIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGalleryIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGalleryIDsQuery>({ document: FindGalleryIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGalleryIDs', 'query', variables);
    },
    FindGroup(variables: FindGroupQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGroupQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGroupQuery>({ document: FindGroupDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGroup', 'query', variables);
    },
    FindGroupIDs(variables?: FindGroupIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGroupIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGroupIDsQuery>({ document: FindGroupIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGroupIDs', 'query', variables);
    },
    FindGroups(variables?: FindGroupsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindGroupsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindGroupsQuery>({ document: FindGroupsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindGroups', 'query', variables);
    },
    FindImageIDs(variables?: FindImageIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindImageIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindImageIDsQuery>({ document: FindImageIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindImageIDs', 'query', variables);
    },
    FindImages(variables?: FindImagesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindImagesQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindImagesQuery>({ document: FindImagesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindImages', 'query', variables);
    },
    FindPerformerIDs(variables?: FindPerformerIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindPerformerIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindPerformerIDsQuery>({ document: FindPerformerIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindPerformerIDs', 'query', variables);
    },
    FindPerformers(variables?: FindPerformersQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindPerformersQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindPerformersQuery>({ document: FindPerformersDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindPerformers', 'query', variables);
    },
    FindSceneIDs(variables?: FindSceneIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindSceneIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindSceneIDsQuery>({ document: FindSceneIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindSceneIDs', 'query', variables);
    },
    FindSceneMarkers(variables?: FindSceneMarkersQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindSceneMarkersQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindSceneMarkersQuery>({ document: FindSceneMarkersDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindSceneMarkers', 'query', variables);
    },
    FindScenes(variables?: FindScenesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindScenesQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindScenesQuery>({ document: FindScenesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindScenes', 'query', variables);
    },
    FindScenesCompact(variables?: FindScenesCompactQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindScenesCompactQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindScenesCompactQuery>({ document: FindScenesCompactDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindScenesCompact', 'query', variables);
    },
    FindStudioIDs(variables?: FindStudioIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindStudioIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindStudioIDsQuery>({ document: FindStudioIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindStudioIDs', 'query', variables);
    },
    FindStudios(variables?: FindStudiosQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindStudiosQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindStudiosQuery>({ document: FindStudiosDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindStudios', 'query', variables);
    },
    FindTagIDs(variables?: FindTagIDsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindTagIDsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindTagIDsQuery>({ document: FindTagIDsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindTagIDs', 'query', variables);
    },
    FindTags(variables?: FindTagsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FindTagsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FindTagsQuery>({ document: FindTagsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FindTags', 'query', variables);
    },
    galleryUpdate(variables: GalleryUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<GalleryUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<GalleryUpdateMutation>({ document: GalleryUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'galleryUpdate', 'mutation', variables);
    },
    groupUpdate(variables: GroupUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<GroupUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<GroupUpdateMutation>({ document: GroupUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'groupUpdate', 'mutation', variables);
    },
    imageUpdate(variables: ImageUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<ImageUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<ImageUpdateMutation>({ document: ImageUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'imageUpdate', 'mutation', variables);
    },
    metadataScan(variables: MetadataScanMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<MetadataScanMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<MetadataScanMutation>({ document: MetadataScanDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'metadataScan', 'mutation', variables);
    },
    performerDestroy(variables: PerformerDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<PerformerDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<PerformerDestroyMutation>({ document: PerformerDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'performerDestroy', 'mutation', variables);
    },
    performerUpdate(variables: PerformerUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<PerformerUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<PerformerUpdateMutation>({ document: PerformerUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'performerUpdate', 'mutation', variables);
    },
    performersDestroy(variables: PerformersDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<PerformersDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<PerformersDestroyMutation>({ document: PerformersDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'performersDestroy', 'mutation', variables);
    },
    SceneAddPlay(variables: SceneAddPlayMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneAddPlayMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneAddPlayMutation>({ document: SceneAddPlayDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'SceneAddPlay', 'mutation', variables);
    },
    SceneDecrementO(variables: SceneDecrementOMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneDecrementOMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneDecrementOMutation>({ document: SceneDecrementODocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'SceneDecrementO', 'mutation', variables);
    },
    sceneDestroy(variables: SceneDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneDestroyMutation>({ document: SceneDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'sceneDestroy', 'mutation', variables);
    },
    sceneIncrementO(variables: SceneIncrementOMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneIncrementOMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneIncrementOMutation>({ document: SceneIncrementODocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'sceneIncrementO', 'mutation', variables);
    },
    SceneSaveActivity(variables: SceneSaveActivityMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneSaveActivityMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneSaveActivityMutation>({ document: SceneSaveActivityDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'SceneSaveActivity', 'mutation', variables);
    },
    sceneUpdate(variables: SceneUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<SceneUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<SceneUpdateMutation>({ document: SceneUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'sceneUpdate', 'mutation', variables);
    },
    scenesUpdate(variables: ScenesUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<ScenesUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<ScenesUpdateMutation>({ document: ScenesUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'scenesUpdate', 'mutation', variables);
    },
    studioDestroy(variables: StudioDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<StudioDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<StudioDestroyMutation>({ document: StudioDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'studioDestroy', 'mutation', variables);
    },
    studioUpdate(variables: StudioUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<StudioUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<StudioUpdateMutation>({ document: StudioUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'studioUpdate', 'mutation', variables);
    },
    studiosDestroy(variables: StudiosDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<StudiosDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<StudiosDestroyMutation>({ document: StudiosDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'studiosDestroy', 'mutation', variables);
    },
    tagCreate(variables: TagCreateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<TagCreateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<TagCreateMutation>({ document: TagCreateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'tagCreate', 'mutation', variables);
    },
    tagDestroy(variables: TagDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<TagDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<TagDestroyMutation>({ document: TagDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'tagDestroy', 'mutation', variables);
    },
    tagUpdate(variables: TagUpdateMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<TagUpdateMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<TagUpdateMutation>({ document: TagUpdateDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'tagUpdate', 'mutation', variables);
    },
    tagsDestroy(variables: TagsDestroyMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<TagsDestroyMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<TagsDestroyMutation>({ document: TagsDestroyDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'tagsDestroy', 'mutation', variables);
    },
    Version(variables?: VersionQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<VersionQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<VersionQuery>({ document: VersionDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'Version', 'query', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;