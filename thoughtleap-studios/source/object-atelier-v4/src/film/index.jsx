import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {SETTINGS_DEFAULTS} from '../scene/settings.js';
import {ObjectStudy} from './ObjectStudy.jsx';
import {
  getObjectStudyDuration,
  normalizeObjectStudyProps,
  objectStudySchema,
  OBJECT_STUDY_FPS,
  OBJECT_STUDY_HEIGHT,
  OBJECT_STUDY_WIDTH,
} from './contract.js';

const FilmRoot = () => <Composition
  id="ObjectStudy"
  component={ObjectStudy}
  durationInFrames={getObjectStudyDuration()}
  fps={OBJECT_STUDY_FPS}
  width={OBJECT_STUDY_WIDTH}
  height={OBJECT_STUDY_HEIGHT}
  defaultProps={{schemaVersion: 1, settings: SETTINGS_DEFAULTS}}
  schema={objectStudySchema}
  calculateMetadata={({props}) => {
    const normalized = normalizeObjectStudyProps(props);
    return {durationInFrames: getObjectStudyDuration(normalized.settings), props: normalized};
  }}
/>;

registerRoot(FilmRoot);
