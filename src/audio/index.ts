// Public surface of the audio layer. The app imports from here and nothing else
// in src/audio, apart from the backends it wants to inject in tests.

export type { AudioBackend, PlayOutcome } from "./backend";
export { createAudioPort } from "./port";
export type { AudioCue, AudioPort, AudioPortOptions } from "./port";
export { createNullBackend } from "./null-backend";
export type { NullBackendOptions } from "./null-backend";
export { createRecordingBackend } from "./recording-backend";
export type {
  RecordedEntry,
  RecordedEngine,
  RecordedFlag,
  RecordedPlay,
  RecordingBackend,
  RecordingBackendOptions,
} from "./recording-backend";
export { createWebAudioBackend } from "./web-audio-backend";
export type { WebAudioBackendOptions } from "./web-audio-backend";
export { frequencyTrack, scheduleEnd, scheduleVoice } from "./schedule";
export type { ScheduledEvent, ScheduledParam, ScheduledPart, VoiceSchedule } from "./schedule";
export * from "./voices";
