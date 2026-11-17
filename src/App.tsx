import { useCallback, useEffect, useRef, useState } from 'react';
import { ManoirEngine } from './scene/ManoirEngine';
import {
  AtmosphereId,
  CAMERA_PRESETS,
  CameraPresetId,
  ExploreZone,
  GameProgressState,
  InspectedPart,
  NearbyInteractable,
  QualityTier,
  ResolvedQuality,
  SceneStats,
  ViewerMode,
} from './scene/presets';
import { ControlOverlay } from './components/ControlOverlay';

function detectTouchCapability(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

const INITIAL_PROGRESS: GameProgressState = {
  enteredManor: false,
  hearthLit: false,
  chandelierLit: false,
  doubleDoorOpen: false,
  openWindowNames: [],
  collectedItems: [],
};

export function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ManoirEngine | null>(null);
  const toastTimerRef = useRef<number>(0);

  const [loadingProgress, setLoadingProgress] = useState<number | null>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [mode, setMode] = useState<ViewerMode>('explore');
  const [exploreZone, setExploreZone] = useState<ExploreZone>('Extérieur');
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>('facade');
  const [activeAtmosphere, setActiveAtmosphere] =
    useState<AtmosphereId>('moonlight');
  const [qualityTier, setQualityTier] = useState<QualityTier>('auto');
  const [resolvedQuality, setResolvedQuality] =
    useState<ResolvedQuality>('high');
  const [gaussianVisible, setGaussianVisible] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [flashlightOn, setFlashlightOn] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);
  const [mobileControlsVisible, setMobileControlsVisible] = useState<boolean>(
    () => detectTouchCapability(),
  );
  const [mobileSprint, setMobileSprint] = useState(false);
  const [isSoftwareGl, setIsSoftwareGl] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [inspectedPart, setInspectedPart] = useState<InspectedPart | null>(
    null,
  );
  const [progressState, setProgressState] =
    useState<GameProgressState>(INITIAL_PROGRESS);
  const [nearbyInteractable, setNearbyInteractable] =
    useState<NearbyInteractable | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    loreText?: string;
  } | null>(null);

  const showToast = useCallback((message: string, loreText?: string) => {
    clearTimeout(toastTimerRef.current);
    setToast({ message, loreText });
    toastTimerRef.current = window.setTimeout(
      () => setToast(null),
      loreText ? 8500 : 4200,
    );
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new ManoirEngine(mountEl, {
      onProgress: (percent) => setLoadingProgress(percent),
      onLoaded: (loadedStats) => {
        setStats(loadedStats);
        setLoadingProgress(100);
      },
      onError: (msg) => setLoadError(msg),
      onInspect: (part) => setInspectedPart(part),
      onZoneChange: (zone) => setExploreZone(zone),
      onProgressStateChange: (state) => setProgressState(state),
      onNearbyChange: (nearby) => setNearbyInteractable(nearby),
      onToast: (message, loreText) => showToast(message, loreText),
      onQualityResolved: (q) => setResolvedQuality(q),
    });

    engineRef.current = engine;
    setIsSoftwareGl(engine.isSoftwareGl);

    return () => {
      clearTimeout(toastTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
  }, [showToast]);

  const handleSelectMode = useCallback((nextMode: ViewerMode) => {
    setMode(nextMode);
    engineRef.current?.setMode(nextMode);
  }, []);

  const handleSelectCamera = useCallback((id: CameraPresetId) => {
    setMode('orbit');
    setActiveCamera(id);
    engineRef.current?.goToCameraPreset(id);
  }, []);

  const handleSelectAtmosphere = useCallback((id: AtmosphereId) => {
    setActiveAtmosphere(id);
    engineRef.current?.setAtmosphere(id);
  }, []);

  const handleSelectQuality = useCallback((tier: QualityTier) => {
    setQualityTier(tier);
    engineRef.current?.setQualityTier(tier);
  }, []);

  const handleToggleGaussian = useCallback(() => {
    setGaussianVisible((prev) => {
      const next = !prev;
      engineRef.current?.setGaussianVisible(next);
      return next;
    });
  }, []);

  const handleUploadSplatFile = useCallback(
    (file: File) => {
      setGaussianVisible(true);
      engineRef.current
        ?.loadCustomSplatFile(file)
        .then((count) => {
          setStats((prev) => (prev ? { ...prev, splatCount: count } : prev));
          showToast(`Environnement Gaussian Splatting chargé : ${file.name}`);
        })
        .catch(() => {
          showToast('Format Gaussian Splat invalide (.splat, .ply, .spz).');
        });
    },
    [showToast],
  );

  const handleToggleWireframe = useCallback(() => {
    setWireframe((prev) => {
      const next = !prev;
      engineRef.current?.setWireframe(next);
      return next;
    });
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      return next;
    });
  }, []);

  const handleToggleFlashlight = useCallback(() => {
    setFlashlightOn((prev) => {
      const next = !prev;
      engineRef.current?.setFlashlight(next);
      return next;
    });
  }, []);

  const handleToggleAudioMuted = useCallback(() => {
    setAudioMuted((prev) => {
      const next = !prev;
      engineRef.current?.setAudioMuted(next);
      return next;
    });
  }, []);

  const handleMobileMoveVector = useCallback((x: number, y: number) => {
    engineRef.current?.setMobileMoveVector(x, y);
  }, []);

  const handleMobileJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  const handleInteract = useCallback(() => {
    engineRef.current?.interact();
  }, []);

  const handleToggleMobileSprint = useCallback(() => {
    setMobileSprint((prev) => {
      const next = !prev;
      engineRef.current?.setMobileSprint(next);
      return next;
    });
  }, []);

  const handleResetView = useCallback(() => {
    engineRef.current?.clearSelection();
    if (mode === 'explore') {
      engineRef.current?.resetPlayerSpawn();
    } else {
      setActiveCamera('facade');
      engineRef.current?.goToCameraPreset('facade');
    }
  }, [mode]);

  const handleNewGame = useCallback(() => {
    engineRef.current?.resetNewGame();
  }, []);

  const handleFocusPart = useCallback((part: InspectedPart) => {
    setMode('orbit');
    engineRef.current?.focusOnPoint(part.center, part.radius);
  }, []);

  const handleClearInspected = useCallback(() => {
    engineRef.current?.clearSelection();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const key = e.key.toLowerCase();
      if (key === 'h') {
        setDockCollapsed((prev) => !prev);
      } else if (key === 'r') {
        handleResetView();
      } else if (key === 'f') {
        handleToggleFlashlight();
      } else if (key === 'e') {
        if (mode === 'explore' && nearbyInteractable) {
          handleInteract();
        } else {
          handleSelectMode(mode === 'explore' ? 'orbit' : 'explore');
        }
      } else if (['1', '2', '3', '4', '5'].includes(key)) {
        const idx = Number(key) - 1;
        const preset = CAMERA_PRESETS[idx];
        if (preset) handleSelectCamera(preset.id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    nearbyInteractable,
    handleResetView,
    handleToggleFlashlight,
    handleInteract,
    handleSelectMode,
    handleSelectCamera,
  ]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#090d16]">
      <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />
      <ControlOverlay
        loadingProgress={loadingProgress}
        loadError={loadError}
        stats={stats}
        mode={mode}
        exploreZone={exploreZone}
        activeCamera={activeCamera}
        activeAtmosphere={activeAtmosphere}
        qualityTier={qualityTier}
        resolvedQuality={resolvedQuality}
        gaussianVisible={gaussianVisible}
        wireframe={wireframe}
        autoRotate={autoRotate}
        flashlightOn={flashlightOn}
        audioMuted={audioMuted}
        mobileControlsVisible={mobileControlsVisible}
        mobileSprint={mobileSprint}
        isSoftwareGl={isSoftwareGl}
        dockCollapsed={dockCollapsed}
        inspectedPart={inspectedPart}
        progressState={progressState}
        nearbyInteractable={nearbyInteractable}
        toast={toast}
        onDismissToast={() => setToast(null)}
        onSelectMode={handleSelectMode}
        onSelectCamera={handleSelectCamera}
        onSelectAtmosphere={handleSelectAtmosphere}
        onSelectQuality={handleSelectQuality}
        onToggleGaussian={handleToggleGaussian}
        onUploadSplatFile={handleUploadSplatFile}
        onToggleWireframe={handleToggleWireframe}
        onToggleAutoRotate={handleToggleAutoRotate}
        onToggleFlashlight={handleToggleFlashlight}
        onToggleAudioMuted={handleToggleAudioMuted}
        onToggleMobileControls={() =>
          setMobileControlsVisible((prev) => !prev)
        }
        onMobileMoveVector={handleMobileMoveVector}
        onMobileJump={handleMobileJump}
        onInteract={handleInteract}
        onToggleMobileSprint={handleToggleMobileSprint}
        onResetView={handleResetView}
        onNewGame={handleNewGame}
        onToggleDock={() => setDockCollapsed((prev) => !prev)}
        onFocusPart={handleFocusPart}
        onClearInspected={handleClearInspected}
      />
    </main>
  );
}

export default App;
