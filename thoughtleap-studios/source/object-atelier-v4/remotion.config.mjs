import {Config} from '@remotion/cli/config';
// Dependencies are shared read-only; new bundling belongs to this v4 project.
Config.setCachingEnabled(false);
Config.overrideWebpackConfig(config=>({...config,cache:false}));
