import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  getRemotionEnvironment,
  staticFile,
  useBufferState,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {createObjectScene, SETTINGS_DEFAULTS, sanitizeSettings} from '../scene/createObjectScene.js';
import {backgroundCSS} from '../scene/settings.js';
import {getObjectStudyPhase} from './contract.js';
export {getObjectStudyDuration, OBJECT_STUDY_FPS, OBJECT_STUDY_WIDTH, OBJECT_STUDY_HEIGHT} from './contract.js';

const fontCSS = `
@font-face{font-family:Archivo;src:url("${staticFile('assets/Archivo-VF.ttf')}") format("truetype");font-weight:100 900;font-style:normal;font-display:block}
@font-face{font-family:Plex;src:url("${staticFile('assets/IBMPlexMono-Regular.ttf')}") format("truetype");font-weight:400;font-style:normal;font-display:block}
`;

/** The Player and renderer use this exact component and the same Three scene. */
export function ObjectStudy({settings = SETTINGS_DEFAULTS}) {
  const frame = useCurrentFrame();
  const {width, height, fps, durationInFrames} = useVideoConfig();
  const bufferState = useBufferState();
  const resolved = useMemo(() => sanitizeSettings(settings), [settings]);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const dimensionsRef = useRef({width: 0, height: 0});
  const currentRef = useRef(null);
  const [error, setError] = useState(null);
  currentRef.current = {frame, width, height, fps, durationInFrames, settings: resolved};

  const draw = () => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    const value = currentRef.current;
    if (dimensionsRef.current.width !== value.width || dimensionsRef.current.height !== value.height) {
      scene.resize(value.width, value.height);
      dimensionsRef.current = {width: value.width, height: value.height};
    }
    scene.render({
      time: value.frame / value.fps,
      progress: getObjectStudyPhase(value.frame, value.durationInFrames, value.settings),
      settings: value.settings,
    });
    // Export capture must wait for the GPU to finish this frame, including
    // PMREM and postprocessing work. Keep live Player updates asynchronous.
    if (getRemotionEnvironment().isRendering) scene.renderer.getContext().finish();
    canvas.dataset.ready = 'true';
    canvas.dataset.frame = String(value.frame);
  };

  useLayoutEffect(() => {
    const targetCanvas = canvasRef.current;
    const handle = delayRender('Preparing ThoughtLeap object materials', {timeoutInMilliseconds: 120000});
    const playbackHandle = bufferState.delayPlayback();
    let cancelled = false;
    let localScene = null;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
      playbackHandle.unblock();
    };
    const initialize = async () => {
      await Promise.all([
        document.fonts.load('760 100px Archivo'),
        document.fonts.load('400 20px Plex'),
      ]);
      if (cancelled || !targetCanvas) return;
      const created = await createObjectScene(targetCanvas, {assetBase: staticFile('assets/'), pixelRatio: 1});
      if (cancelled) {created.dispose(); return;}
      localScene = created;
      sceneRef.current = created;
      draw();
      release();
    };
    initialize().catch(cause => {
      release();
      if (cancelled) return;
      const failure = cause instanceof Error ? cause : new Error(String(cause));
      setError(failure);
      if (getRemotionEnvironment().isRendering) cancelRender(failure);
    });
    return () => {
      cancelled = true;
      if (targetCanvas) targetCanvas.dataset.ready = 'false';
      sceneRef.current = null;
      localScene?.dispose();
      release();
    };
  }, []);

  // A material edit or seek draws immediately, without reloading HDR or resetting time.
  useLayoutEffect(() => {draw();}, [frame, resolved, width, height, fps, durationInFrames]);

  if (error) throw error;
  return <AbsoluteFill style={{background: backgroundCSS(resolved.background,width,height), overflow: 'hidden'}}>
    <style>{fontCSS}</style>
    <canvas
      ref={canvasRef}
      data-object-study=""
      width={width}
      height={height}
      aria-label="ThoughtLeap three-dimensional object study"
      style={{display: 'block', width: '100%', height: '100%'}}
    />
  </AbsoluteFill>;
}
