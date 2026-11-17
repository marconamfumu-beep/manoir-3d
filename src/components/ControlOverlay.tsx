import React, { useRef, useState } from 'react';
import {
  Backpack,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Compass,
  Crosshair,
  Eye,
  Flashlight,
  Gamepad2,
  Grid,
  Hand,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScrollText,
  Sparkles,
  Sun,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ATMOSPHERE_PRESETS,
  AtmosphereId,
  buildMissions,
  CAMERA_PRESETS,
  CameraPresetId,
  ExploreZone,
  GAME_ITEMS,
  GameItemDef,
  GameProgressState,
  InspectedPart,
  NearbyInteractable,
  QualityTier,
  ResolvedQuality,
  SceneStats,
  ViewerMode,
} from '../scene/presets';
import { MobileControls } from './MobileControls';

interface ControlOverlayProps {
  loadingProgress: number | null;
  loadError: string | null;
  stats: SceneStats | null;
  mode: ViewerMode;
  exploreZone: ExploreZone;
  activeCamera: CameraPresetId;
  activeAtmosphere: AtmosphereId;
  qualityTier: QualityTier;
  resolvedQuality: ResolvedQuality;
  gaussianVisible: boolean;
  wireframe: boolean;
  autoRotate: boolean;
  flashlightOn: boolean;
  audioMuted: boolean;
  mobileControlsVisible: boolean;
  mobileSprint: boolean;
  isSoftwareGl: boolean;
  dockCollapsed: boolean;
  inspectedPart: InspectedPart | null;
  progressState: GameProgressState;
  nearbyInteractable: NearbyInteractable | null;
  toast: { message: string; loreText?: string } | null;
  onDismissToast: () => void;
  onSelectMode: (mode: ViewerMode) => void;
  onSelectCamera: (id: CameraPresetId) => void;
  onSelectAtmosphere: (id: AtmosphereId) => void;
  onSelectQuality: (tier: QualityTier) => void;
  onToggleGaussian: () => void;
  onUploadSplatFile: (file: File) => void;
  onToggleWireframe: () => void;
  onToggleAutoRotate: () => void;
  onToggleFlashlight: () => void;
  onToggleAudioMuted: () => void;
  onToggleMobileControls: () => void;
  onMobileMoveVector: (x: number, y: number) => void;
  onMobileJump: () => void;
  onInteract: () => void;
  onToggleMobileSprint: () => void;
  onResetView: () => void;
  onNewGame: () => void;
  onToggleDock: () => void;
  onFocusPart: (part: InspectedPart) => void;
  onClearInspected: () => void;
}

const QUALITY_LABELS: Record<QualityTier, string> = {
  auto: 'Auto',
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Basse',
};

export const ControlOverlay: React.FC<ControlOverlayProps> = ({
  loadingProgress,
  loadError,
  stats,
  mode,
  exploreZone,
  activeCamera,
  activeAtmosphere,
  qualityTier,
  resolvedQuality,
  gaussianVisible,
  wireframe,
  autoRotate,
  flashlightOn,
  audioMuted,
  mobileControlsVisible,
  mobileSprint,
  isSoftwareGl,
  dockCollapsed,
  inspectedPart,
  progressState,
  nearbyInteractable,
  toast,
  onDismissToast,
  onSelectMode,
  onSelectCamera,
  onSelectAtmosphere,
  onSelectQuality,
  onToggleGaussian,
  onUploadSplatFile,
  onToggleWireframe,
  onToggleAutoRotate,
  onToggleFlashlight,
  onToggleAudioMuted,
  onToggleMobileControls,
  onMobileMoveVector,
  onMobileJump,
  onInteract,
  onToggleMobileSprint,
  onResetView,
  onNewGame,
  onToggleDock,
  onFocusPart,
  onClearInspected,
}) => {
  const [panelTab, setPanelTab] = useState<'none' | 'missions' | 'inventory'>(
    'none',
  );
  const [selectedItem, setSelectedItem] = useState<GameItemDef | null>(null);
  const splatInputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = loadingProgress !== null && loadingProgress < 100 && !stats;
  const missions = buildMissions(progressState);
  const completedCount = missions.filter((m) => m.completed).length;
  const currentMission = missions.find((m) => !m.completed);
  const collectedDefs = GAME_ITEMS.filter((item) =>
    progressState.collectedItems.includes(item.id),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between">
      {/* Top Bar: Minimal Title + Compact Mission/Inventory Triggers */}
      <div className="p-3.5 sm:p-5 flex flex-wrap items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-lg border border-slate-700/75 bg-[#0c121e]/92 px-3.5 py-2.5 shadow-lg max-w-[92vw]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sm font-semibold tracking-wide text-slate-100">
              Manoir des Valmont
            </h1>
            {mode === 'explore' && (
              <span className="rounded bg-sky-500/20 border border-sky-400/40 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                {exploreZone}
              </span>
            )}
            <span className="rounded bg-amber-500/15 border border-amber-400/35 px-2 py-0.5 text-[11px] font-medium text-amber-200">
              {completedCount}/{missions.length} objectifs
            </span>
            {stats && (
              <span className="hidden md:inline text-[11px] font-medium text-slate-400 border-l border-slate-700/80 pl-2">
                {stats.meshCount} maillages ·{' '}
                {(stats.triangleCount / 1000).toFixed(0)}k tris ·{' '}
                {stats.splatCount} splats
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {currentMission
              ? `Objectif : ${currentMission.title} — ${currentMission.hint}`
              : 'Tous les secrets du manoir ont été révélés !'}
          </p>
        </div>

        {/* Compact Top-Right Drawer Toggles (Missions & Inventory) */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setPanelTab((prev) =>
                  prev === 'missions' ? 'none' : 'missions',
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg transition-colors cursor-pointer ${
                panelTab === 'missions'
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                  : 'border-slate-700/75 bg-[#0c121e]/92 text-slate-200 hover:text-white'
              }`}
            >
              <ScrollText className="h-3.5 w-3.5" />
              <span>Missions ({completedCount}/5)</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setPanelTab((prev) =>
                  prev === 'inventory' ? 'none' : 'inventory',
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg transition-colors cursor-pointer ${
                panelTab === 'inventory'
                  ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                  : 'border-slate-700/75 bg-[#0c121e]/92 text-slate-200 hover:text-white'
              }`}
            >
              <Backpack className="h-3.5 w-3.5" />
              <span>
                Inventaire ({collectedDefs.length}/{GAME_ITEMS.length})
              </span>
            </button>
          </div>

          {panelTab === 'missions' && (
            <div className="w-76 max-w-[90vw] rounded-xl border border-slate-700/80 bg-[#0c121e]/95 p-3.5 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Journal d’Enquête
                </span>
                <button
                  type="button"
                  onClick={() => setPanelTab('none')}
                  className="rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <ul className="space-y-2">
                {missions.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-lg border px-2.5 py-2 text-xs ${
                      m.completed
                        ? 'border-emerald-500/35 bg-emerald-950/30 text-emerald-200'
                        : 'border-slate-700/70 bg-slate-900/75 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-medium">
                      {m.completed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      )}
                      <span className={m.completed ? 'line-through opacity-80' : ''}>
                        {m.title}
                      </span>
                    </div>
                    {!m.completed && (
                      <p className="mt-1 pl-5 text-[11px] text-slate-400">
                        {m.hint}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {panelTab === 'inventory' && (
            <div className="w-76 max-w-[90vw] rounded-xl border border-slate-700/80 bg-[#0c121e]/95 p-3.5 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Objets Collectés
                </span>
                <button
                  type="button"
                  onClick={() => setPanelTab('none')}
                  className="rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {collectedDefs.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Explorez la cour, le salon et la bibliothèque pour trouver des
                  indices et objets clés.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {collectedDefs.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          selectedItem?.id === item.id
                            ? 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                            : 'border-slate-700/70 bg-slate-900/75 text-slate-200 hover:border-slate-500'
                        }`}
                      >
                        <div className="font-medium truncate">
                          {item.shortLabel}
                        </div>
                      </button>
                    ))}
                  </div>
                  {selectedItem && (
                    <div className="mt-2 rounded-lg border border-slate-700/80 bg-slate-900/90 p-2.5 text-[11px] text-slate-300">
                      <div className="font-semibold text-amber-200">
                        {selectedItem.name}
                      </div>
                      <p className="mt-1">{selectedItem.description}</p>
                      {selectedItem.loreText && (
                        <p className="mt-1.5 italic text-slate-200 border-t border-slate-700/70 pt-1.5">
                          {selectedItem.loreText}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Centered Loading / Error State */}
      {(isLoading || loadError) && (
        <div className="pointer-events-auto self-center rounded-xl border border-slate-700/80 bg-[#0c121e]/95 px-6 py-4 shadow-2xl max-w-sm w-[90vw]">
          {loadError ? (
            <p className="text-sm text-rose-300 text-center">{loadError}</p>
          ) : (
            <div>
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <span>Chargement Babylon.js (GLB + Gaussian Splats)…</span>
                <span className="tabular-nums font-medium">
                  {loadingProgress ?? 0}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-sky-400 transition-all duration-150"
                  style={{ width: `${loadingProgress ?? 8}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile / Touch Virtual Controls */}
      {mode === 'explore' && mobileControlsVisible && !isLoading && (
        <MobileControls
          flashlightOn={flashlightOn}
          sprinting={mobileSprint}
          nearbyInteractable={nearbyInteractable}
          onMoveVector={onMobileMoveVector}
          onJump={onMobileJump}
          onInteract={onInteract}
          onToggleSprint={onToggleMobileSprint}
          onToggleFlashlight={onToggleFlashlight}
        />
      )}

      {/* Bottom Area: Interaction Prompt + Lore Toast + Collapsible Control Dock */}
      <div className="pb-3.5 px-3 flex flex-col items-center gap-2">
        {/* Toast / Lore Notification */}
        {toast && (
          <div className="pointer-events-auto max-w-md rounded-xl border border-amber-400/45 bg-[#0c121e]/95 px-4 py-2.5 text-xs text-slate-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-200">{toast.message}</p>
                {toast.loreText && (
                  <p className="mt-1 italic text-slate-300">{toast.loreText}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onDismissToast}
                className="rounded p-0.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Proximity Interaction Prompt */}
        {mode === 'explore' && nearbyInteractable && (
          <button
            type="button"
            onClick={onInteract}
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-400/60 bg-[#0c121e]/95 px-3.5 py-1.5 text-xs font-medium text-amber-100 shadow-xl hover:bg-amber-500/20 cursor-pointer"
          >
            <Hand className="h-3.5 w-3.5 text-amber-300" />
            <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
              E
            </span>
            <span>
              {nearbyInteractable.actionLabel} : {nearbyInteractable.label}
            </span>
            {nearbyInteractable.lockedReason && (
              <span className="text-[11px] text-rose-300">
                ({nearbyInteractable.lockedReason})
              </span>
            )}
          </button>
        )}

        {/* Collapsible Bottom Control Dock */}
        <div
          className="pointer-events-auto flex flex-col items-center transition-transform duration-300 ease-out"
          style={{
            maxWidth: 'min(1060px, 96vw)',
            transform: dockCollapsed
              ? 'translateY(calc(100% - 34px))'
              : 'translateY(0)',
          }}
        >
          <button
            type="button"
            onClick={onToggleDock}
            title="Afficher / masquer les contrôles (H)"
            className="mb-1 flex items-center gap-1.5 rounded-t-lg border border-b-0 border-slate-700/75 bg-[#0c121e]/92 px-3.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Contrôles</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Masquer</span>
              </>
            )}
          </button>

          <div className="w-full rounded-xl border border-slate-700/75 bg-[#0c121e]/92 px-3.5 py-2.5 shadow-2xl">
            {/* Inspected Architectural Element Strip */}
            {inspectedPart && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/35 bg-sky-950/45 px-3 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-200">
                  <span className="font-semibold text-sky-300">
                    {inspectedPart.name}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-300">
                    {inspectedPart.material}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400 tabular-nums">
                    {inspectedPart.dimensions}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFocusPart(inspectedPart)}
                    className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/35 cursor-pointer"
                  >
                    <Crosshair className="h-3 w-3" />
                    <span>Centrer</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearInspected}
                    aria-label="Fermer l'inspection"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              {/* Exploration vs Orbit Mode */}
              <div className="flex items-center gap-1 rounded-lg bg-slate-900/90 p-0.5 border border-slate-700/60">
                <button
                  type="button"
                  onClick={() => onSelectMode('explore')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    mode === 'explore'
                      ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Explorer</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMode('orbit')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    mode === 'orbit'
                      ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Orbite</span>
                </button>
              </div>

              {/* Camera Viewpoints */}
              <div className="flex items-center gap-1">
                <Camera className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-0.5" />
                {CAMERA_PRESETS.map((preset) => {
                  const active = mode === 'orbit' && activeCamera === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectCamera(preset.id)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                          : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Atmosphere Lighting Presets */}
              <div className="flex items-center gap-1">
                <Sun className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-0.5" />
                {Object.values(ATMOSPHERE_PRESETS).map((atmo) => {
                  const active = activeAtmosphere === atmo.id;
                  return (
                    <button
                      key={atmo.id}
                      type="button"
                      onClick={() => onSelectAtmosphere(atmo.id)}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                          : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80 hover:text-white'
                      }`}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: atmo.swatch }}
                      />
                      <span>{atmo.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Gameplay & Graphics Controls */}
              <div className="flex flex-wrap items-center gap-1">
                {mode === 'explore' && (
                  <>
                    <button
                      type="button"
                      onClick={onToggleFlashlight}
                      title="Lampe torche (F)"
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        flashlightOn
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                          : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80'
                      }`}
                    >
                      <Flashlight className="h-3.5 w-3.5" />
                      <span>Torche</span>
                    </button>
                    <button
                      type="button"
                      onClick={onToggleMobileControls}
                      title="Joystick tactile"
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        mobileControlsVisible
                          ? 'bg-sky-500/25 text-sky-200 border border-sky-400/50'
                          : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80'
                      }`}
                    >
                      <Gamepad2 className="h-3.5 w-3.5" />
                      <span>Tactile</span>
                    </button>
                  </>
                )}

                {mode === 'orbit' && !isSoftwareGl && (
                  <button
                    type="button"
                    onClick={onToggleAutoRotate}
                    title="Rotation automatique"
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                      autoRotate
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                        : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80'
                    }`}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>Orbite</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleGaussian}
                  title="Afficher / masquer l'environnement Gaussian Splatting"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    gaussianVisible
                      ? 'bg-teal-500/20 text-teal-200 border border-teal-400/50'
                      : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Splats</span>
                </button>

                <button
                  type="button"
                  onClick={() => splatInputRef.current?.click()}
                  title="Importer un fichier .splat / .ply / .spz"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/75 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>.splat</span>
                </button>
                <input
                  ref={splatInputRef}
                  type="file"
                  accept=".splat,.ply,.spz"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadSplatFile(file);
                    e.target.value = '';
                  }}
                />

                <button
                  type="button"
                  onClick={onToggleAudioMuted}
                  title="Activer / couper le son spatialisé"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    !audioMuted
                      ? 'bg-slate-800/75 text-slate-200 border border-slate-700/60 hover:bg-slate-700/80'
                      : 'bg-rose-500/20 text-rose-200 border border-rose-400/50'
                  }`}
                >
                  {audioMuted ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>

                <select
                  aria-label="Qualité graphique"
                  value={qualityTier}
                  onChange={(e) =>
                    onSelectQuality(e.target.value as QualityTier)
                  }
                  title={`Qualité graphique (active : ${QUALITY_LABELS[resolvedQuality]})`}
                  className="rounded-md border border-slate-700/60 bg-slate-800/90 px-2 py-1 text-xs font-medium text-slate-200 cursor-pointer"
                >
                  <option value="auto">
                    Qualité : Auto ({QUALITY_LABELS[resolvedQuality]})
                  </option>
                  <option value="high">Qualité : Élevée</option>
                  <option value="medium">Qualité : Moyenne</option>
                  <option value="low">Qualité : Basse</option>
                </select>

                <button
                  type="button"
                  onClick={onToggleWireframe}
                  title="Mode filaire"
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    wireframe
                      ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/50'
                      : 'bg-slate-800/75 text-slate-300 border border-slate-700/60 hover:bg-slate-700/80'
                  }`}
                >
                  <Grid className="h-3.5 w-3.5" />
                  <span>Filaire</span>
                </button>

                <button
                  type="button"
                  onClick={onResetView}
                  title="Réinitialiser la position / vue (R)"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/75 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700/80 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={onNewGame}
                  title="Réinitialiser la progression"
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/75 px-2 py-1 text-xs font-medium text-slate-300 hover:bg-rose-900/50 hover:text-rose-100 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Nouvelle partie</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
