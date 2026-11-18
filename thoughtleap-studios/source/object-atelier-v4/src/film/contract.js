import {z} from 'zod';
import {SETTINGS_DEFAULTS, SETTINGS_SCHEMA, sanitizeSettings} from '../scene/settings.js';

export const OBJECT_STUDY_FPS = 60;
export const OBJECT_STUDY_WIDTH = 1920;
export const OBJECT_STUDY_HEIGHT = 1080;

export function getObjectStudyDuration(settings = SETTINGS_DEFAULTS) {
  return Math.max(1, Math.round(sanitizeSettings(settings).motionDuration * OBJECT_STUDY_FPS));
}

/** Periodic motion samples [0,1), avoiding a duplicate frame at the loop seam. */
export function getObjectStudyPhase(frame, durationInFrames, settings) {
  if (durationInFrames <= 1) return 1;
  const periodic = settings.motionLoop && ['lightSweep', 'turntable', 'spineRoll', 'reflectionStudy'].includes(settings.motionPreset);
  return Math.max(0, Math.min(1, frame / (periodic ? durationInFrames : durationInFrames - 1)));
}

const fields = Object.fromEntries(SETTINGS_SCHEMA.map(field => {
  let value;
  if (field.type === 'range') value = z.number().finite().min(field.min).max(field.max);
  else if (field.type === 'boolean') value = z.boolean();
  else if (field.type === 'color') value = z.string().regex(/^#[\da-f]{6}$/i, 'Use a six-digit hex color.');
  else value = z.enum(field.options.map(option => option.value));
  return [field.key, value.describe(`${field.group}: ${field.label}${field.unit ? ` (${field.unit})` : ''}`)];
}));

export const objectStudySettingsSchema = z.object(fields);
export const objectStudySchema = z.object({
  schemaVersion: z.literal(1).default(1),
  settings: objectStudySettingsSchema.default(SETTINGS_DEFAULTS),
});

/** Validate authored values before filling defaults; never silently change a supplied render value. */
export function normalizeObjectStudyProps(input = {}) {
  const parsed = z.object({
    schemaVersion: z.literal(1).optional(),
    settings: objectStudySettingsSchema.partial().strict().optional(),
  }).parse(input);
  return {schemaVersion: 1, settings: sanitizeSettings(parsed.settings)};
}
