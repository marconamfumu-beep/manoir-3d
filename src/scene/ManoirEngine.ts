import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Material,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PBRMaterial,
  PointLight,
  RawCubeTexture,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  SceneLoader,
  ShadowGenerator,
  SpotLight,
  StandardMaterial,
  TransformNode,
  UniversalCamera,
  Vector3,
  DefaultRenderingPipeline,
  SSAO2RenderingPipeline,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { AudioEngine } from './AudioEngine';
import { CollisionWorld } from './CollisionWorld';
import { GaussianEnvironment } from './GaussianEnvironment';
import { ManorEnhancements } from './ManorEnhancements';
import {
  createProceduralDetailTextures,
  createProceduralEnvironmentCube,
  MaterialDetailTextures,
} from './ProceduralTextures';
import {
  ATMOSPHERE_PRESETS,
  AtmosphereId,
  CAMERA_PRESETS,
  CameraPresetId,
  ExploreZone,
  GAME_ITEMS,
  GameItemDef,
  GameItemId,
  GameProgressState,
  InspectedPart,
  NearbyInteractable,
  QualityTier,
  ResolvedQuality,
  SceneStats,
  ViewerMode,
} from './presets';

const LOCAL_GLB_URL = '/manoir_abandonne.glb';
const GITHUB_RAW_GLB_URL =
  'https://raw.githubusercontent.com/marconamfumu-beep/manoir-3d/main/manoir_abandonne.glb';
const SAVE_STORAGE_KEY = 'manoir_3d_save_v1';

// Pre-allocated math vectors (zero GC in per-frame render loop)
const _forward = new Vector3();
const _right = new Vector3();
const _lookTarget = new Vector3();
const _orbitTargetGoal = new Vector3();
const _orbitPosGoal = new Vector3();
const _playerProbePos = new Vector3();

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function resolveQualityTier(
  tier: QualityTier,
  isSoftwareGl: boolean,
): ResolvedQuality {
  if (isSoftwareGl) return 'low';
  if (tier !== 'auto') return tier;
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
      navigator.maxTouchPoints > 1);
  return isMobile ? 'medium' : 'high';
}

function formatNodeName(rawName: string): string {
  if (!rawName) return 'Élément architectural';
  return rawName.replace(/\.\d{3}$/, '').replace(/_/g, ' ').trim();
}

interface DoorRig {
  id: string;
  label: string;
  requiresKey?: boolean;
  isDouble: boolean;
  leftPivot: TransformNode;
  rightPivot?: TransformNode;
  openAngle: number;
  open: boolean;
  currentAngle: number;
  targetAngle: number;
  meshes: AbstractMesh[];
  center: Vector3;
}

interface WindowRig {
  id: string;
  label: string;
  pivot: TransformNode;
  openAngle: number;
  open: boolean;
  currentAngle: number;
  targetAngle: number;
  meshes: AbstractMesh[];
  center: Vector3;
}

interface CollectibleRig {
  def: GameItemDef;
  root: TransformNode;
  baseY: number;
  collected: boolean;
}

export interface ManoirEngineCallbacks {
  onProgress?: (percent: number) => void;
  onLoaded?: (stats: SceneStats) => void;
  onError?: (message: string) => void;
  onInspect?: (part: InspectedPart | null) => void;
  onZoneChange?: (zone: ExploreZone) => void;
  onProgressStateChange?: (state: GameProgressState) => void;
  onNearbyChange?: (nearby: NearbyInteractable | null) => void;
  onToast?: (message: string, loreText?: string) => void;
  onQualityResolved?: (quality: ResolvedQuality) => void;
}

export class ManoirEngine {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private callbacks: ManoirEngineCallbacks;
  public readonly isSoftwareGl: boolean;

  private engine: Engine;
  private scene: Scene;
  private exploreCamera: UniversalCamera;
  private orbitCamera: ArcRotateCamera;
  private audio = new AudioEngine();
  private collisionWorld = new CollisionWorld();
  private gaussianEnv: GaussianEnvironment;
  private manorEnhancements: ManorEnhancements;

  private detailTextures: MaterialDetailTextures;
  private envCubeTexture: RawCubeTexture;
  private hallProbe: ReflectionProbe | null = null;
  private courtyardProbe: ReflectionProbe | null = null;
  private defaultPipeline: DefaultRenderingPipeline | null = null;
  private ssaoPipeline: SSAO2RenderingPipeline | null = null;

  private keyLight: DirectionalLight;
  private hemiLight: HemisphericLight;
  private rimLight: DirectionalLight;
  private interiorWarmLight: PointLight;
  private hearthLight: PointLight;
  private chandelierLight: PointLight;
  private flashlight: SpotLight;
  private shadowGenerator: ShadowGenerator | null = null;

  private outerGround: Mesh;
  private lightShaftMeshes: Mesh[] = [];
  private dustParticles: ParticleSystem | null = null;
  private courtyardMistParticles: ParticleSystem | null = null;
  private hearthParticles: ParticleSystem | null = null;

  private manorMeshes: AbstractMesh[] = [];
  private partitionColliders: AbstractMesh[] = [];
  private partitionWalkables: AbstractMesh[] = [];
  private enhancementColliders: AbstractMesh[] = [];
  private interiorWetMats: PBRMaterial[] = [];
  private exteriorWaterMats: PBRMaterial[] = [];
  private chandelierCrystalMats: PBRMaterial[] = [];
  private chandelierRoot: TransformNode | null = null;
  private doorRigs: DoorRig[] = [];
  private windowRigs: WindowRig[] = [];
  private collectibleRigs: CollectibleRig[] = [];
  private switchLever: TransformNode | null = null;
  private switchPosition = new Vector3(-4.06, 1.45, 0.5);
  private hearthPosition = new Vector3(-7.7, 1.65, -5.3);

  private selectedMesh: AbstractMesh | null = null;
  private selectedOriginalEmissive: Color3 | null = null;

  private mode: ViewerMode = 'explore';
  private atmosphereId: AtmosphereId = 'moonlight';
  private resolvedQuality: ResolvedQuality;
  private wireframeEnabled = false;
  private autoRotateEnabled = false;
  private flashlightEnabled = true;
  private gaussianEnabled = true;

  // Player state (1st-person exploration)
  private playerFeet = new Vector3(3.4, -0.65, 17.5);
  private readonly eyeHeight = 1.72;
  private yaw = 0.19;
  private pitch = 0.04;
  private verticalVel = { value: 0 };
  private jumpQueued = false;
  private headBobPhase = 0;
  private lastFootstepSign = 1;
  private lastZone: ExploreZone = 'Extérieur';

  // Orbit smooth transition state
  private orbitTransitionActive = false;

  // Input state
  private keysPressed = new Set<string>();
  private mobileMove = { x: 0, y: 0 };
  private mobileSprint = false;
  private lookDragging = false;
  private activeLookPointerId: number | null = null;
  private lastLookPointer = { x: 0, y: 0 };
  private pointerDownPos = { x: 0, y: 0 };

  // Gameplay progression state (persisted in localStorage)
  private progressState: GameProgressState;
  private lastNearbyId: string | null = null;

  private disposed = false;
  private softwareTimerId = 0;
  private lastFrameMs = performance.now();

  private onResizeBound: () => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(container: HTMLElement, callbacks: ManoirEngineCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.resolvedQuality = resolveQualityTier('auto', this.isSoftwareGl);
    this.callbacks.onQualityResolved?.(this.resolvedQuality);

    this.progressState = this.loadSavedProgress();
    if (this.progressState.playerPosition) {
      this.playerFeet.set(...this.progressState.playerPosition);
    }
    if (typeof this.progressState.playerYaw === 'number') {
      this.yaw = this.progressState.playerYaw;
    }
    if (typeof this.progressState.playerPitch === 'number') {
      this.pitch = this.progressState.playerPitch;
    }

    // Create dedicated WebGL canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.outline = 'none';
    this.canvas.style.touchAction = 'none';
    container.appendChild(this.canvas);

    this.engine = new Engine(this.canvas, !this.isSoftwareGl, {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: 'high-performance',
      antialias: !this.isSoftwareGl,
    });
    this.applyHardwareScaling();

    this.scene = new Scene(this.engine);
    // Match glTF/Blender right-handed coordinates directly
    this.scene.useRightHandedSystem = true;

    const initialAtmo = ATMOSPHERE_PRESETS[this.atmosphereId];
    this.scene.clearColor = new Color4(...initialAtmo.backgroundColor, 1);
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(...initialAtmo.fogColor);
    this.scene.fogDensity = initialAtmo.fogDensity;

    // Procedural PBR Environment Reflections & Normal Maps
    this.envCubeTexture = createProceduralEnvironmentCube(this.scene);
    this.scene.environmentTexture = this.envCubeTexture;
    this.scene.environmentIntensity = initialAtmo.envIntensity;

    this.detailTextures = createProceduralDetailTextures(
      this.scene,
      this.resolvedQuality,
    );

    // Cameras (1st-person Explore + ArcRotate Orbit)
    this.exploreCamera = new UniversalCamera(
      'explore_cam',
      new Vector3(this.playerFeet.x, this.playerFeet.y + this.eyeHeight, this.playerFeet.z),
      this.scene,
    );
    this.exploreCamera.fov = 1.02;
    this.exploreCamera.minZ = 0.15;
    this.exploreCamera.maxZ = 220;

    const defaultCam = CAMERA_PRESETS[0];
    this.orbitCamera = new ArcRotateCamera(
      'orbit_cam',
      0.7,
      1.2,
      32,
      new Vector3(...defaultCam.target),
      this.scene,
    );
    this.orbitCamera.setPosition(new Vector3(...defaultCam.position));
    this.orbitCamera.minZ = 0.2;
    this.orbitCamera.maxZ = 220;
    this.orbitCamera.lowerRadiusLimit = 2.2;
    this.orbitCamera.upperRadiusLimit = 70;
    this.orbitCamera.upperBetaLimit = Math.PI * 0.495;
    this.orbitCamera.inertia = this.isSoftwareGl ? 0 : 0.82;
    this.orbitCamera.wheelPrecision = 14;
    this.orbitCamera.onViewMatrixChangedObservable.add(() => {
      if (this.orbitTransitionActive && this.orbitCamera.inertialAlphaOffset !== 0) {
        this.orbitTransitionActive = false;
      }
    });

    this.scene.activeCamera = this.exploreCamera;

    // Extended natural perimeter ground
    this.outerGround = MeshBuilder.CreateDisc(
      'Sol exterieur',
      { radius: 140, tessellation: 48 },
      this.scene,
    );
    this.outerGround.rotation.x = Math.PI / 2;
    this.outerGround.position.y = -0.68;
    const outerMat = new PBRMaterial('outer_ground_pbr', this.scene);
    outerMat.albedoColor = new Color3(0.08, 0.11, 0.09);
    outerMat.roughness = 0.96;
    outerMat.metallic = 0;
    outerMat.bumpTexture = this.detailTextures.stoneBump;
    outerMat.bumpTexture.level = 0.45;
    this.outerGround.material = outerMat;
    this.outerGround.receiveShadows = true;
    this.outerGround.isPickable = false;
    this.outerGround.freezeWorldMatrix();

    // Lighting Rig: Hemisphere + Key Directional (with Shadows) + Rim + Interior + Hearth + Chandelier + Flashlight
    this.hemiLight = new HemisphericLight(
      'hemi_fill',
      new Vector3(0, 1, 0),
      this.scene,
    );
    this.hemiLight.diffuse = new Color3(...initialAtmo.hemiSkyColor);
    this.hemiLight.groundColor = new Color3(...initialAtmo.hemiGroundColor);
    this.hemiLight.intensity = initialAtmo.hemiIntensity;

    this.keyLight = new DirectionalLight(
      'key_light',
      new Vector3(...initialAtmo.keyLightDirection),
      this.scene,
    );
    this.keyLight.position = new Vector3(26, 36, 28);
    this.keyLight.diffuse = new Color3(...initialAtmo.keyLightColor);
    this.keyLight.intensity = initialAtmo.keyLightIntensity;
    this.keyLight.shadowMinZ = 2;
    this.keyLight.shadowMaxZ = 95;
    this.keyLight.autoCalcShadowZBounds = true;

    this.rimLight = new DirectionalLight(
      'rim_light',
      new Vector3(0.55, -0.45, 0.65),
      this.scene,
    );
    this.rimLight.diffuse = new Color3(...initialAtmo.rimLightColor);
    this.rimLight.intensity = initialAtmo.rimLightIntensity;

    this.interiorWarmLight = new PointLight(
      'interior_warm',
      new Vector3(0, 4.2, 0.5),
      this.scene,
    );
    this.interiorWarmLight.diffuse = new Color3(...initialAtmo.interiorWarmColor);
    this.interiorWarmLight.intensity = initialAtmo.interiorWarmIntensity;
    this.interiorWarmLight.range = 26;

    // Dynamic Monumental Hearth Light (starts off until lit)
    this.hearthLight = new PointLight(
      'hearth_fire_light',
      new Vector3(-7.4, 1.85, -5.1),
      this.scene,
    );
    this.hearthLight.diffuse = new Color3(1.0, 0.48, 0.16);
    this.hearthLight.intensity = this.progressState.hearthLit ? 28 : 0;
    this.hearthLight.range = 18;

    // Dynamic Grand Chandelier Light (starts off until fuse + switch activated)
    this.chandelierLight = new PointLight(
      'chandelier_light',
      new Vector3(0, 7.6, 0),
      this.scene,
    );
    this.chandelierLight.diffuse = new Color3(1.0, 0.86, 0.62);
    this.chandelierLight.intensity = this.progressState.chandelierLit ? 65 : 0;
    this.chandelierLight.range = 32;

    // Player Flashlight
    this.flashlight = new SpotLight(
      'player_flashlight',
      this.exploreCamera.position.clone(),
      new Vector3(0, 0, -1),
      Math.PI / 4.2,
      10,
      this.scene,
    );
    this.flashlight.diffuse = new Color3(1.0, 0.91, 0.76);
    this.flashlight.intensity = 42;
    this.flashlight.range = 38;

    // Atmospheric systems & Architectural Enhancements
    this.gaussianEnv = new GaussianEnvironment(this.scene);
    this.manorEnhancements = new ManorEnhancements(this.scene);
    this.createLightShafts();
    this.createAtmosphericParticles();
    this.createInteractiveProps();

    this.configureShadowsAndPostProcess();
    this.enhancementColliders = this.manorEnhancements.build(
      this.detailTextures,
      this.resolvedQuality,
      this.shadowGenerator,
    );
    this.manorEnhancements.setSkyVisible(this.atmosphereId === 'moonlight');
    this.manorEnhancements.setDrizzleActive(
      this.atmosphereId === 'moonlight' || this.atmosphereId === 'dawn',
    );
    this.syncExploreCamera(0);

    // Event bindings
    this.onResizeBound = () => this.engine.resize();
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onPointerDownBound = this.handlePointerDown.bind(this);
    this.onPointerMoveBound = this.handlePointerMove.bind(this);
    this.onPointerUpBound = this.handlePointerUp.bind(this);

    window.addEventListener('resize', this.onResizeBound);
    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    this.canvas.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);

    this.callbacks.onProgressStateChange?.({ ...this.progressState });

    void this.loadAssets();
    this.startRenderLoop();
  }

  private loadSavedProgress(): GameProgressState {
    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<GameProgressState>;
        return {
          enteredManor: Boolean(parsed.enteredManor),
          hearthLit: Boolean(parsed.hearthLit),
          chandelierLit: Boolean(parsed.chandelierLit),
          doubleDoorOpen: Boolean(parsed.doubleDoorOpen),
          openDoorIds: Array.isArray(parsed.openDoorIds)
            ? parsed.openDoorIds
            : [],
          openWindowNames: Array.isArray(parsed.openWindowNames)
            ? parsed.openWindowNames
            : [],
          collectedItems: Array.isArray(parsed.collectedItems)
            ? parsed.collectedItems
            : [],
          playerPosition: parsed.playerPosition,
          playerYaw: parsed.playerYaw,
          playerPitch: parsed.playerPitch,
        };
      }
    } catch {
      // Ignore corrupt localStorage
    }
    return {
      enteredManor: false,
      hearthLit: false,
      chandelierLit: false,
      doubleDoorOpen: false,
      openDoorIds: [],
      openWindowNames: [],
      collectedItems: [],
    };
  }

  private saveProgress(): void {
    try {
      const payload: GameProgressState = {
        ...this.progressState,
        playerPosition: [
          +this.playerFeet.x.toFixed(2),
          +this.playerFeet.y.toFixed(2),
          +this.playerFeet.z.toFixed(2),
        ],
        playerYaw: +this.yaw.toFixed(3),
        playerPitch: +this.pitch.toFixed(3),
      };
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
    this.callbacks.onProgressStateChange?.({ ...this.progressState });
  }

  private applyHardwareScaling(): void {
    const dpr = window.devicePixelRatio || 1;
    if (this.isSoftwareGl) {
      this.engine.setHardwareScalingLevel(1.25);
    } else if (this.resolvedQuality === 'low') {
      this.engine.setHardwareScalingLevel(Math.max(1, dpr * 0.85));
    } else if (this.resolvedQuality === 'medium') {
      this.engine.setHardwareScalingLevel(1 / Math.min(dpr, 1.5));
    } else {
      this.engine.setHardwareScalingLevel(1 / Math.min(dpr, 2));
    }
  }

  private configureShadowsAndPostProcess(): void {
    // Clean up existing generators/pipelines
    this.shadowGenerator?.dispose();
    this.shadowGenerator = null;
    this.ssaoPipeline?.dispose();
    this.ssaoPipeline = null;
    this.defaultPipeline?.dispose();
    this.defaultPipeline = null;

    if (!this.isSoftwareGl && this.resolvedQuality !== 'low') {
      const shadowSize = this.resolvedQuality === 'high' ? 2048 : 1024;
      this.shadowGenerator = new ShadowGenerator(shadowSize, this.keyLight);
      this.shadowGenerator.usePercentageCloserFiltering = true;
      this.shadowGenerator.filteringQuality =
        this.resolvedQuality === 'high'
          ? ShadowGenerator.QUALITY_MEDIUM
          : ShadowGenerator.QUALITY_LOW;
      this.shadowGenerator.bias = 0.0006;
      this.shadowGenerator.normalBias = 0.02;

      for (const mesh of this.manorMeshes) {
        if (mesh.getTotalVertices() > 0 && !/brouillard|poussiere|verre|vitre/i.test(mesh.name)) {
          this.shadowGenerator.addShadowCaster(mesh, false);
        }
      }
    }

    // Cinematic DefaultRenderingPipeline (ACES Tone Mapping, Bloom, FXAA, Vignette)
    const atmo = ATMOSPHERE_PRESETS[this.atmosphereId];
    if (!this.isSoftwareGl && this.resolvedQuality !== 'low') {
      const pipeline = new DefaultRenderingPipeline(
        'cinematic_pipeline',
        true,
        this.scene,
        [this.exploreCamera, this.orbitCamera],
      );
      pipeline.fxaaEnabled = true;
      pipeline.bloomEnabled = true;
      pipeline.bloomThreshold = 0.72;
      pipeline.bloomWeight = 0.38;
      pipeline.bloomKernel = 48;
      pipeline.imageProcessingEnabled = true;
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType =
        ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.exposure = atmo.exposure;
      pipeline.imageProcessing.contrast = 1.12;
      pipeline.imageProcessing.vignetteEnabled = true;
      pipeline.imageProcessing.vignetteWeight = 1.45;
      pipeline.imageProcessing.vignetteColor = new Color4(0.02, 0.03, 0.05, 1);
      this.defaultPipeline = pipeline;
    } else {
      this.scene.imageProcessingConfiguration.toneMappingEnabled = true;
      this.scene.imageProcessingConfiguration.toneMappingType =
        ImageProcessingConfiguration.TONEMAPPING_ACES;
      this.scene.imageProcessingConfiguration.exposure = atmo.exposure;
    }

    // Ambient Occlusion (SSAO2) on High GPU tier
    if (!this.isSoftwareGl && this.resolvedQuality === 'high') {
      try {
        const ssao = new SSAO2RenderingPipeline(
          'ssao2_pipeline',
          this.scene,
          { ssaoRatio: 0.5, blurRatio: 0.5 },
          [this.exploreCamera, this.orbitCamera],
        );
        ssao.radius = 1.6;
        ssao.totalStrength = 1.05;
        ssao.samples = 16;
        ssao.maxZ = 80;
        ssao.expensiveBlur = true;
        this.ssaoPipeline = ssao;
      } catch {
        // Gracefully skip if geometry buffer unsupported on device
      }
    }
  }

  private async loadAssets(): Promise<void> {
    try {
      const splatPromise = this.gaussianEnv
        .initialize(this.resolvedQuality)
        .catch(() => 0);

      let result;
      try {
        result = await SceneLoader.ImportMeshAsync(
          '',
          '/',
          LOCAL_GLB_URL.slice(1),
          this.scene,
          (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              this.callbacks.onProgress?.(
                Math.min(98, Math.round((evt.loaded / evt.total) * 100)),
              );
            }
          },
          '.glb',
        );
      } catch (localErr) {
        console.warn('Local GLB failed, trying GitHub raw URL:', localErr);
        const lastSlash = GITHUB_RAW_GLB_URL.lastIndexOf('/') + 1;
        result = await SceneLoader.ImportMeshAsync(
          '',
          GITHUB_RAW_GLB_URL.slice(0, lastSlash),
          GITHUB_RAW_GLB_URL.slice(lastSlash),
          this.scene,
          (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              this.callbacks.onProgress?.(
                Math.min(98, Math.round((evt.loaded / evt.total) * 100)),
              );
            }
          },
          '.glb',
        );
      }

      if (this.disposed) return;

      const splatCount = await splatPromise;
      this.gaussianEnv.setVisible(this.gaussianEnabled);

      this.processLoadedManor(result.meshes, splatCount);
    } catch (err) {
      if (this.disposed) return;
      console.error('Error loading manoir_abandonne.glb:', err);
      this.callbacks.onError?.(
        'Impossible de charger le modèle 3D (manoir_abandonne.glb).',
      );
    }
  }

  private processLoadedManor(meshes: AbstractMesh[], splatCount: number): void {
    const activeMeshes: AbstractMesh[] = [];
    const matSet = new Set<Material>();
    let triangleCount = 0;

    const leftDoorParts: AbstractMesh[] = [];
    const rightDoorParts: AbstractMesh[] = [];
    const lateralWindowMeshes: AbstractMesh[] = [];
    const upperGalleryParts: AbstractMesh[] = [];
    const chandelierParts: AbstractMesh[] = [];

    let partitionMaterial: Material | null = null;
    let facadeMaterial: Material | null = null;

    for (const mesh of meshes) {
      const name = mesh.name || '';
      const lower = name.toLowerCase();

      // Upgrade PBR material micro-detail & reflections first
      if (mesh.material) {
        matSet.add(mesh.material);
        this.upgradePbrMaterial(mesh.material, lower);
        if (!partitionMaterial && lower.startsWith('cloison interieure')) {
          partitionMaterial = mesh.material;
        }
        if (!facadeMaterial && lower.startsWith('facade avant aile')) {
          facadeMaterial = mesh.material;
        }
      }

      // Replace the 6 uncut GLB Cloison slabs with doorway-cutout walls & real doors
      if (
        lower.startsWith('cloison interieure') ||
        lower.startsWith('cloison etage') ||
        lower.startsWith('cloison fond rez-de-chaussee')
      ) {
        mesh.setEnabled(false);
        mesh.isPickable = false;
        continue;
      }

      activeMeshes.push(mesh);

      const verts = mesh.getTotalVertices();
      if (verts > 0) {
        triangleCount += Math.floor(mesh.getTotalIndices() / 3);
      }

      const isAtmospheric =
        lower.includes('brouillard') ||
        lower.includes('poussiere') ||
        lower.includes('verre') ||
        lower.includes('vitre');

      mesh.receiveShadows = !isAtmospheric;
      mesh.isPickable = !isAtmospheric || lower.startsWith('vitre haute');

      if (lower.includes('eclat') || lower.includes('feuille de lierre')) {
        mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
      }

      if (
        lower.includes('porte double') ||
        lower.includes('panneau porte') ||
        lower.includes('poignee porte')
      ) {
        mesh.computeWorldMatrix(true);
        const cx = mesh.getBoundingInfo().boundingBox.centerWorld.x;
        if (cx < 0) leftDoorParts.push(mesh);
        else rightDoorParts.push(mesh);
      } else if (lower.startsWith('fenetre laterale')) {
        lateralWindowMeshes.push(mesh);
      } else if (
        lower.startsWith('vitre haute') ||
        lower.startsWith('montant fenetre') ||
        lower.startsWith('traverse fenetre')
      ) {
        upperGalleryParts.push(mesh);
      } else if (
        lower.includes('couronne lustre') ||
        lower.includes('bras de lustre') ||
        lower.includes('cristal lustre') ||
        lower.includes('pendeloque cristal')
      ) {
        chandelierParts.push(mesh);
      }

      if (this.shadowGenerator && verts > 0 && !isAtmospheric) {
        this.shadowGenerator.addShadowCaster(mesh, false);
      }
    }

    this.manorMeshes = activeMeshes;
    this.doorRigs = [];
    this.windowRigs = [];

    // 1. Existing GLB Sanctuary Double Doors (locked until forged key found)
    if (leftDoorParts.length > 0 || rightDoorParts.length > 0) {
      const leftPivot = new TransformNode('door_left_pivot', this.scene);
      leftPivot.position.set(-1.44, 1.85, -9.28);
      for (const part of leftDoorParts) {
        part.setParent(leftPivot);
      }

      const rightPivot = new TransformNode('door_right_pivot', this.scene);
      rightPivot.position.set(1.44, 1.85, -9.28);
      for (const part of rightDoorParts) {
        part.setParent(rightPivot);
      }

      const openAngle = this.progressState.doubleDoorOpen ? 1.55 : 0;
      leftPivot.rotation.y = -openAngle;
      rightPivot.rotation.y = openAngle;

      this.doorRigs.push({
        id: 'double_door',
        label: 'Double porte du Sanctuaire',
        requiresKey: true,
        isDouble: true,
        leftPivot,
        rightPivot,
        openAngle: 1.55,
        open: this.progressState.doubleDoorOpen,
        currentAngle: openAngle,
        targetAngle: openAngle,
        meshes: [...leftDoorParts, ...rightDoorParts],
        center: new Vector3(0, 1.85, -9.2),
      });
    }

    // 2. Existing GLB Lateral Windows
    for (const winMesh of lateralWindowMeshes) {
      winMesh.computeWorldMatrix(true);
      const bbox = winMesh.getBoundingInfo().boundingBox;
      const center = bbox.centerWorld.clone();
      const pivot = new TransformNode(`win_pivot_${winMesh.name}`, this.scene);
      pivot.position.set(center.x, center.y, bbox.minimumWorld.z);
      winMesh.setParent(pivot);

      const isOpen = this.progressState.openWindowNames.includes(winMesh.name);
      const openAngle = center.x < 0 ? 1.12 : -1.12;
      const angle = isOpen ? openAngle : 0;
      pivot.rotation.y = angle;

      this.windowRigs.push({
        id: winMesh.name,
        label: 'Fenêtre intérieure latérale',
        pivot,
        openAngle,
        open: isOpen,
        currentAngle: angle,
        targetAngle: angle,
        meshes: [winMesh],
        center,
      });
    }

    // 3. Existing GLB Upper Gallery Tall Windows (grouped by X coordinate)
    const galleryWindowXs = [-8, -4.8, 4.8, 8];
    galleryWindowXs.forEach((wx, idx) => {
      const parts = upperGalleryParts.filter((p) => {
        p.computeWorldMatrix(true);
        return Math.abs(p.getBoundingInfo().boundingBox.centerWorld.x - wx) < 1.1;
      });
      if (parts.length === 0) return;

      const pivot = new TransformNode(`win_pivot_gallery_${idx}`, this.scene);
      pivot.position.set(wx - 0.8, 7.55, -9.32);
      for (const p of parts) {
        p.setParent(pivot);
      }

      const id = `gallery_win_${idx}`;
      const isOpen = this.progressState.openWindowNames.includes(id);
      const openAngle = 1.05;
      const angle = isOpen ? openAngle : 0;
      pivot.rotation.y = angle;

      this.windowRigs.push({
        id,
        label: `Haute fenêtre de la Galerie ${idx + 1}`,
        pivot,
        openAngle,
        open: isOpen,
        currentAngle: angle,
        targetAngle: angle,
        meshes: parts,
        center: new Vector3(wx, 6.9, -9.2),
      });
    });

    // 4. New Architectural Partitions, Front Facade, 7 Openable Doors & 5 Openable Facade Windows
    const partitionBuild =
      this.manorEnhancements.buildArchitecturalPartitionsAndPortals(
        this.detailTextures,
        partitionMaterial,
        facadeMaterial,
        this.shadowGenerator,
        null,
      );
    this.partitionColliders = partitionBuild.wallMeshes;
    this.partitionWalkables = partitionBuild.walkableMeshes;

    const savedDoors = this.progressState.openDoorIds ?? [];
    for (const d of partitionBuild.doors) {
      const isOpen = savedDoors.includes(d.id);
      const curAngle = isOpen ? d.openAngle : 0;
      if (d.isDouble && d.rightPivot) {
        d.leftPivot.rotation.y = -curAngle;
        d.rightPivot.rotation.y = curAngle;
      } else {
        d.leftPivot.rotation.y = curAngle;
      }
      this.doorRigs.push({
        id: d.id,
        label: d.label,
        isDouble: d.isDouble,
        leftPivot: d.leftPivot,
        rightPivot: d.rightPivot,
        openAngle: d.openAngle,
        open: isOpen,
        currentAngle: curAngle,
        targetAngle: curAngle,
        meshes: d.meshes,
        center: d.center,
      });
    }

    for (const w of partitionBuild.windows) {
      const isOpen = this.progressState.openWindowNames.includes(w.id);
      const curAngle = isOpen ? w.openAngle : 0;
      w.pivot.rotation.y = curAngle;
      this.windowRigs.push({
        id: w.id,
        label: w.label,
        pivot: w.pivot,
        openAngle: w.openAngle,
        open: isOpen,
        currentAngle: curAngle,
        targetAngle: curAngle,
        meshes: w.meshes,
        center: w.center,
      });
    }

    // Group chandelier for subtle sway animation
    if (chandelierParts.length > 0) {
      const cRoot = new TransformNode('chandelier_sway_root', this.scene);
      cRoot.position.set(0, 9.6, 0);
      for (const cp of chandelierParts) {
        cp.setParent(cRoot);
      }
      this.chandelierRoot = cRoot;
    }

    // Freeze world matrices on static non-animated architecture for GPU speed
    for (const mesh of activeMeshes) {
      const lower = (mesh.name || '').toLowerCase();
      const animated =
        lower.includes('porte') ||
        lower.startsWith('fenetre laterale') ||
        lower.startsWith('vitre haute') ||
        lower.startsWith('montant fenetre') ||
        lower.startsWith('traverse fenetre') ||
        lower.includes('lustre') ||
        lower.includes('pendeloque');
      if (!animated) {
        mesh.freezeWorldMatrix();
      }
    }

    // Build full 3D collision world + register every dynamic door & window portal
    const explicitPortalMeshes = new Set<AbstractMesh>();
    for (const d of this.doorRigs) {
      for (const m of d.meshes) explicitPortalMeshes.add(m);
    }
    for (const w of this.windowRigs) {
      for (const m of w.meshes) explicitPortalMeshes.add(m);
    }

    this.collisionWorld.buildFromMeshes(
      [
        ...activeMeshes,
        ...this.enhancementColliders,
        ...this.partitionColliders,
        ...this.partitionWalkables,
      ],
      this.outerGround,
      explicitPortalMeshes,
    );
    this.collisionWorld.clearPortalGroups();
    for (const d of this.doorRigs) {
      this.collisionWorld.registerPortalGroup(d.id, d.meshes, d.open);
    }
    for (const w of this.windowRigs) {
      this.collisionWorld.registerPortalGroup(w.id, w.meshes, w.open);
    }
    this.collisionWorld.setDoorsOpen(this.progressState.doubleDoorOpen);

    // Configure Real-Time Reflection Probes for marble floors, puddles & wet surfaces
    this.configureRealtimeReflectionProbes();

    // Snap player feet to ground if needed
    const groundY = this.collisionWorld.sampleGroundHeight(
      this.playerFeet.x,
      this.playerFeet.y,
      this.playerFeet.z,
    );
    if (groundY !== null) {
      this.playerFeet.y = groundY;
    }
    this.syncExploreCamera(0);

    // Restore fireplace & chandelier visual state from save
    this.applyWorldVisualStates();

    this.callbacks.onProgress?.(100);
    this.callbacks.onLoaded?.({
      meshCount:
        activeMeshes.filter((m) => m.getTotalVertices() > 0).length +
        this.partitionColliders.length,
      materialCount: matSet.size,
      triangleCount,
      splatCount,
    });
  }

  private configureRealtimeReflectionProbes(): void {
    for (const m of this.interiorWetMats) {
      m.reflectionTexture = null;
    }
    for (const m of this.exteriorWaterMats) {
      m.reflectionTexture = null;
    }
    this.manorEnhancements.setMudReflectionTexture(null);

    this.hallProbe?.dispose();
    this.hallProbe = null;
    this.courtyardProbe?.dispose();
    this.courtyardProbe = null;

    if (this.manorMeshes.length === 0) return;

    const hallSize =
      this.resolvedQuality === 'high'
        ? 256
        : this.resolvedQuality === 'medium'
          ? 128
          : 64;
    const courtyardSize = Math.max(64, hallSize >> 1);

    const hallRefresh =
      this.isSoftwareGl || this.resolvedQuality === 'low'
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        : RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYTWOFRAMES;
    const courtyardRefresh =
      this.isSoftwareGl || this.resolvedQuality !== 'high'
        ? RenderTargetTexture.REFRESHRATE_RENDER_ONCE
        : RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYTWOFRAMES;

    // 1. Interior Hall Real-Time Reflection Probe (reflects staircase, columns, hearth, chandelier & sky)
    const hallProbe = new ReflectionProbe(
      'hall_realtime_probe',
      hallSize,
      this.scene,
      true,
      false,
      false,
    );
    hallProbe.position = new Vector3(0, 2.35, 0);
    hallProbe.refreshRate = hallRefresh;

    // 2. Exterior Courtyard Real-Time Reflection Probe (reflects glowing facade windows, lantern & starry sky)
    const courtyardProbe = new ReflectionProbe(
      'courtyard_realtime_probe',
      courtyardSize,
      this.scene,
      true,
      false,
      false,
    );
    courtyardProbe.position = new Vector3(0, 1.85, 16.0);
    courtyardProbe.refreshRate = courtyardRefresh;

    const hallList: AbstractMesh[] = [];
    const courtyardList: AbstractMesh[] = [this.outerGround];

    for (const mesh of this.manorMeshes) {
      if (mesh.getTotalVertices() === 0 || !mesh.isEnabled()) continue;
      const lower = (mesh.name || '').toLowerCase();
      if (lower.includes('brouillard') || lower.includes('poussiere')) {
        continue;
      }
      if (!lower.includes('sol marbre') && !lower.includes('flaque')) {
        hallList.push(mesh);
      }
      if (!lower.includes('eau fontaine') && !lower.includes('flaque')) {
        courtyardList.push(mesh);
      }
    }

    const partMeshes = this.manorEnhancements.getPartitionRenderMeshes();
    const staticMeshes = this.manorEnhancements.getStaticRenderMeshes();
    for (const pm of partMeshes) {
      if (pm.getTotalVertices() > 0) {
        hallList.push(pm);
        courtyardList.push(pm);
      }
    }
    for (const sm of staticMeshes) {
      if (sm.getTotalVertices() > 0) {
        hallList.push(sm);
        courtyardList.push(sm);
      }
    }

    const skyDome = this.scene.getMeshByName('nocturnal_sky_dome');
    if (skyDome) {
      hallList.push(skyDome);
      courtyardList.push(skyDome);
    }

    hallProbe.renderList = hallList;
    courtyardProbe.renderList = courtyardList;
    this.hallProbe = hallProbe;
    this.courtyardProbe = courtyardProbe;

    for (const m of this.interiorWetMats) {
      m.reflectionTexture = hallProbe.cubeTexture;
    }
    for (const m of this.exteriorWaterMats) {
      m.reflectionTexture = courtyardProbe.cubeTexture;
    }
    this.manorEnhancements.setMudReflectionTexture(courtyardProbe.cubeTexture);
  }

  private refreshProbesNow(): void {
    this.hallProbe?.cubeTexture.resetRefreshCounter();
    this.courtyardProbe?.cubeTexture.resetRefreshCounter();
  }

  private upgradePbrMaterial(mat: Material, meshLowerName: string): void {
    if (!(mat instanceof PBRMaterial)) return;
    const matLower = (mat.name || '').toLowerCase();

    // Global PBR optimizations across every material in the engine
    mat.enableSpecularAntiAliasing = true;
    mat.useRadianceOcclusion = true;
    mat.useHorizonOcclusion = true;

    if (this.wireframeEnabled) {
      mat.wireframe = true;
    }

    if (matLower.includes('cristal') || meshLowerName.includes('cristal')) {
      mat.roughness = 0.08;
      mat.metallic = 0.22;
      mat.environmentIntensity = 1.65;
      if (!this.chandelierCrystalMats.includes(mat)) {
        this.chandelierCrystalMats.push(mat);
      }
      if (!this.interiorWetMats.includes(mat)) {
        this.interiorWetMats.push(mat);
      }
      return;
    }

    if (matLower.includes('eau')) {
      mat.roughness = 0.04;
      mat.metallic = 0.08;
      mat.bumpTexture = this.detailTextures.marbleBump;
      mat.bumpTexture.level = 0.16;
      mat.environmentIntensity = 1.65;
      if (meshLowerName.includes('fontaine')) {
        if (!this.exteriorWaterMats.includes(mat)) {
          this.exteriorWaterMats.push(mat);
        }
      } else if (!this.interiorWetMats.includes(mat)) {
        this.interiorWetMats.push(mat);
      }
      return;
    }

    if (matLower.includes('verre')) {
      mat.roughness = 0.1;
      mat.environmentIntensity = 1.55;
      if (!this.interiorWetMats.includes(mat)) {
        this.interiorWetMats.push(mat);
      }
      return;
    }

    if (matLower.includes('laiton') || matLower.includes('fer')) {
      if (!mat.bumpTexture) {
        mat.bumpTexture = this.detailTextures.metalBump;
        mat.bumpTexture.level = 0.5;
      }
      mat.environmentIntensity = 1.35;
      if (!this.interiorWetMats.includes(mat)) {
        this.interiorWetMats.push(mat);
      }
      return;
    }

    if (matLower.includes('marbre') || meshLowerName.includes('marbre')) {
      if (!mat.albedoTexture) {
        mat.albedoTexture = this.detailTextures.marbleAlbedo;
      }
      if (!mat.bumpTexture) {
        mat.bumpTexture = this.detailTextures.marbleBump;
        mat.bumpTexture.level = 0.6;
      }
      mat.metallicTexture = this.detailTextures.marbleRoughness;
      mat.useRoughnessFromMetallicTextureAlpha = false;
      mat.useRoughnessFromMetallicTextureGreen = true;
      mat.useMetallnessFromMetallicTextureBlue = false;
      mat.metallic = 0.05;
      mat.roughness = 0.82;
      mat.environmentIntensity = 1.35;
      if (!this.interiorWetMats.includes(mat)) {
        this.interiorWetMats.push(mat);
      }
      return;
    }

    if (matLower.includes('bois') || matLower.includes('parquet')) {
      if (!mat.albedoTexture) {
        mat.albedoTexture = this.detailTextures.woodAlbedo;
      }
      if (!mat.bumpTexture) {
        mat.bumpTexture = this.detailTextures.woodBump;
        mat.bumpTexture.level = 0.7;
      }
      mat.roughness = Math.max(mat.roughness ?? 0.65, 0.58);
      return;
    }

    if (
      matLower.includes('pierre') ||
      matLower.includes('crepi') ||
      matLower.includes('platre') ||
      matLower.includes('enduit') ||
      matLower.includes('mousse')
    ) {
      if (!mat.albedoTexture && !matLower.includes('mousse')) {
        mat.albedoTexture = this.detailTextures.stoneAlbedo;
      }
      if (!mat.bumpTexture) {
        mat.bumpTexture = this.detailTextures.stoneBump;
        mat.bumpTexture.level = 0.72;
      }
      mat.roughness = Math.max(mat.roughness ?? 0.85, 0.78);
    }
  }

  private createLightShafts(): void {
    const shaftMat = new StandardMaterial('light_shaft_mat', this.scene);
    shaftMat.diffuseColor = new Color3(0, 0, 0);
    shaftMat.specularColor = new Color3(0, 0, 0);
    shaftMat.emissiveColor = new Color3(0.68, 0.82, 1.0);
    shaftMat.opacityTexture = this.detailTextures.lightShaftTexture;
    shaftMat.alpha = ATMOSPHERE_PRESETS[this.atmosphereId].shaftAlpha;
    shaftMat.alphaMode = Engine.ALPHA_ADD;
    shaftMat.backFaceCulling = false;
    shaftMat.disableLighting = true;

    const windowPositions: Array<[number, number, number, number, number]> = [
      // Upper rear arched windows streaming down into gallery
      [-8, 6.2, -7.2, 0.45, 0],
      [-4.8, 6.2, -7.2, 0.45, 0],
      [4.8, 6.2, -7.2, 0.45, 0],
      [8, 6.2, -7.2, 0.45, 0],
      // Lateral ground windows streaming into salon/dining
      [-7.6, 2.2, 1.0, 0.35, -0.5],
      [7.6, 2.2, 1.0, 0.35, 0.5],
    ];

    windowPositions.forEach(([x, y, z, tiltX, tiltZ], idx) => {
      const cone = MeshBuilder.CreateCylinder(
        `volumetric_shaft_${idx}`,
        { diameterTop: 1.5, diameterBottom: 4.2, height: 8.5, tessellation: 14 },
        this.scene,
      );
      cone.position.set(x, y, z);
      cone.rotation.x = tiltX;
      cone.rotation.z = tiltZ;
      cone.material = shaftMat;
      cone.isPickable = false;
      this.lightShaftMeshes.push(cone);
    });
  }

  private createAtmosphericParticles(): void {
    const countFactor =
      this.resolvedQuality === 'high'
        ? 1
        : this.resolvedQuality === 'medium'
          ? 0.6
          : 0.3;

    // 1. Floating Dust Motes inside the Manor
    const dust = new ParticleSystem(
      'dust_motes',
      Math.round(240 * countFactor),
      this.scene,
    );
    dust.particleTexture = this.detailTextures.particleDot;
    dust.emitter = new Vector3(0, 4.2, 0);
    dust.minEmitBox = new Vector3(-9.5, -3.5, -8.5);
    dust.maxEmitBox = new Vector3(9.5, 4.2, 8.5);
    dust.color1 = new Color4(0.85, 0.9, 1.0, 0.32);
    dust.color2 = new Color4(1.0, 0.92, 0.78, 0.18);
    dust.colorDead = new Color4(0.6, 0.7, 0.8, 0);
    dust.minSize = 0.03;
    dust.maxSize = 0.09;
    dust.minLifeTime = 4;
    dust.maxLifeTime = 8;
    dust.emitRate = Math.round(32 * countFactor);
    dust.direction1 = new Vector3(-0.18, 0.08, -0.18);
    dust.direction2 = new Vector3(0.18, 0.25, 0.18);
    dust.minEmitPower = 0.1;
    dust.maxEmitPower = 0.35;
    dust.start();
    this.dustParticles = dust;

    // 2. Exterior Mist & Fireflies around Courtyard Fountain
    const mist = new ParticleSystem(
      'courtyard_mist',
      Math.round(120 * countFactor),
      this.scene,
    );
    mist.particleTexture = this.detailTextures.particleDot;
    mist.emitter = new Vector3(0, 0.6, 16);
    mist.minEmitBox = new Vector3(-14, -0.4, -7);
    mist.maxEmitBox = new Vector3(14, 2.2, 7);
    mist.color1 = new Color4(0.55, 0.78, 0.95, 0.22);
    mist.color2 = new Color4(0.75, 0.95, 0.7, 0.25);
    mist.colorDead = new Color4(0.3, 0.4, 0.5, 0);
    mist.minSize = 0.08;
    mist.maxSize = 0.28;
    mist.minLifeTime = 3.5;
    mist.maxLifeTime = 6.5;
    mist.emitRate = Math.round(16 * countFactor);
    mist.direction1 = new Vector3(-0.25, 0.05, -0.25);
    mist.direction2 = new Vector3(0.25, 0.3, 0.25);
    mist.minEmitPower = 0.15;
    mist.maxEmitPower = 0.45;
    mist.start();
    this.courtyardMistParticles = mist;

    // 3. Monumental Fireplace Flames & Rising Embers
    const hearth = new ParticleSystem(
      'hearth_fire',
      Math.round(140 * countFactor),
      this.scene,
    );
    hearth.particleTexture = this.detailTextures.particleDot;
    hearth.emitter = new Vector3(-7.7, 1.15, -5.35);
    hearth.minEmitBox = new Vector3(-0.45, 0, -0.2);
    hearth.maxEmitBox = new Vector3(0.45, 0.18, 0.2);
    hearth.color1 = new Color4(1.0, 0.58, 0.15, 0.9);
    hearth.color2 = new Color4(1.0, 0.28, 0.05, 0.75);
    hearth.colorDead = new Color4(0.2, 0.05, 0.0, 0);
    hearth.minSize = 0.12;
    hearth.maxSize = 0.36;
    hearth.minLifeTime = 0.6;
    hearth.maxLifeTime = 1.4;
    hearth.emitRate = Math.round(45 * countFactor);
    hearth.direction1 = new Vector3(-0.15, 1.2, -0.15);
    hearth.direction2 = new Vector3(0.15, 2.4, 0.15);
    hearth.minEmitPower = 0.6;
    hearth.maxEmitPower = 1.3;
    hearth.blendMode = ParticleSystem.BLENDMODE_ADD;
    if (this.progressState.hearthLit) {
      hearth.start();
    }
    this.hearthParticles = hearth;
  }

  private createInteractiveProps(): void {
    // 1. Collectibles (custom detailed procedural PBR props with glowing beacon)
    for (const def of GAME_ITEMS) {
      const collected = this.progressState.collectedItems.includes(def.id);
      const root = new TransformNode(`item_${def.id}`, this.scene);
      root.position.set(...def.position);
      root.setEnabled(!collected);

      const mat = new PBRMaterial(`item_mat_${def.id}`, this.scene);
      mat.albedoColor = new Color3(...def.color);
      mat.emissiveColor = new Color3(
        def.color[0] * 0.45,
        def.color[1] * 0.45,
        def.color[2] * 0.45,
      );
      mat.metallic = def.id.startsWith('journal') ? 0.1 : 0.85;
      mat.roughness = def.id.startsWith('journal') ? 0.75 : 0.22;

      if (def.id === 'key') {
        const bow = MeshBuilder.CreateTorus(
          `prop_key_bow`,
          { diameter: 0.16, thickness: 0.03, tessellation: 14 },
          this.scene,
        );
        bow.material = mat;
        bow.parent = root;
        const shaft = MeshBuilder.CreateCylinder(
          `prop_key_shaft`,
          { diameter: 0.03, height: 0.26, tessellation: 8 },
          this.scene,
        );
        shaft.rotation.z = Math.PI / 2;
        shaft.position.x = 0.18;
        shaft.material = mat;
        shaft.parent = root;
      } else if (def.id === 'medallion') {
        const disc = MeshBuilder.CreateCylinder(
          `prop_medallion`,
          { diameter: 0.28, height: 0.04, tessellation: 20 },
          this.scene,
        );
        disc.rotation.x = Math.PI / 2;
        disc.material = mat;
        disc.parent = root;
      } else if (def.id.startsWith('journal')) {
        const page = MeshBuilder.CreateBox(
          `prop_${def.id}`,
          { width: 0.28, height: 0.02, depth: 0.36 },
          this.scene,
        );
        page.rotation.y = 0.35;
        page.material = mat;
        page.parent = root;
      } else {
        const box = MeshBuilder.CreateBox(
          `prop_${def.id}`,
          { width: 0.22, height: 0.1, depth: 0.14 },
          this.scene,
        );
        box.material = mat;
        box.parent = root;
      }

      // Subtle floating indicator ring
      const halo = MeshBuilder.CreateTorus(
        `halo_${def.id}`,
        { diameter: 0.42, thickness: 0.015, tessellation: 20 },
        this.scene,
      );
      const haloMat = new StandardMaterial(`halo_mat_${def.id}`, this.scene);
      haloMat.emissiveColor = new Color3(...def.color);
      haloMat.alpha = 0.55;
      haloMat.disableLighting = true;
      halo.material = haloMat;
      halo.position.y = 0.08;
      halo.parent = root;
      halo.isPickable = false;

      this.collectibleRigs.push({
        def,
        root,
        baseY: def.position[1],
        collected,
      });
    }

    // 2. Wall-mounted Chandelier Switch Plate on Grand Hall wall [-4.06, 1.45, 0.5]
    const switchPlate = MeshBuilder.CreateBox(
      'chandelier_switch_plate',
      { width: 0.06, height: 0.26, depth: 0.18 },
      this.scene,
    );
    switchPlate.position.copyFrom(this.switchPosition);
    const plateMat = new PBRMaterial('switch_plate_mat', this.scene);
    plateMat.albedoColor = new Color3(0.72, 0.56, 0.25);
    plateMat.metallic = 0.9;
    plateMat.roughness = 0.25;
    plateMat.emissiveColor = new Color3(0.22, 0.18, 0.06);
    switchPlate.material = plateMat;

    const leverRoot = new TransformNode('chandelier_switch_lever', this.scene);
    leverRoot.position.copyFrom(this.switchPosition);
    leverRoot.position.x += 0.04;
    const leverMesh = MeshBuilder.CreateCylinder(
      'switch_lever_bar',
      { diameter: 0.035, height: 0.18, tessellation: 8 },
      this.scene,
    );
    leverMesh.position.y = 0.07;
    leverMesh.material = plateMat;
    leverMesh.parent = leverRoot;
    leverRoot.rotation.z = this.progressState.chandelierLit ? 0.6 : -0.6;
    this.switchLever = leverRoot;
  }

  private applyWorldVisualStates(): void {
    // Update chandelier crystal emissive & light
    const cLit = this.progressState.chandelierLit;
    this.chandelierLight.intensity = cLit ? 65 : 0;
    for (const cMat of this.chandelierCrystalMats) {
      cMat.emissiveColor = cLit
        ? new Color3(1.0, 0.85, 0.55)
        : new Color3(0, 0, 0);
    }
    if (this.switchLever) {
      this.switchLever.rotation.z = cLit ? 0.6 : -0.6;
    }

    // Update fireplace light & particles
    const hLit = this.progressState.hearthLit;
    this.hearthLight.intensity = hLit ? 28 : 0;
    if (this.hearthParticles) {
      if (hLit && !this.hearthParticles.isStarted()) {
        this.hearthParticles.start();
      } else if (!hLit && this.hearthParticles.isStarted()) {
        this.hearthParticles.stop();
      }
    }

    // Update Sanctuary Double Doors & all interactive doors
    const sanctuary = this.doorRigs.find((d) => d.id === 'double_door');
    if (sanctuary) {
      sanctuary.open = this.progressState.doubleDoorOpen;
      sanctuary.targetAngle = sanctuary.open ? sanctuary.openAngle : 0;
      this.collisionWorld.setDoorsOpen(this.progressState.doubleDoorOpen);
    }

    this.refreshProbesNow();
  }

  public interact(): void {
    this.audio.unlockAndStart();
    const nearby = this.computeNearbyInteractable();
    if (!nearby) return;

    if (nearby.id.startsWith('item:')) {
      const itemId = nearby.id.slice(5) as GameItemId;
      const rig = this.collectibleRigs.find((r) => r.def.id === itemId);
      if (rig && !rig.collected) {
        rig.collected = true;
        rig.root.setEnabled(false);
        this.progressState.collectedItems = [
          ...this.progressState.collectedItems,
          itemId,
        ];
        this.audio.playPickup();
        this.callbacks.onToast?.(
          `Objet récupéré : ${rig.def.name}`,
          rig.def.loreText,
        );
        this.saveProgress();
      }
      return;
    }

    if (nearby.id === 'hearth') {
      if (!this.progressState.collectedItems.includes('matches')) {
        this.audio.playDoorCreak(true);
        this.callbacks.onToast?.(
          'La cheminée est froide — trouvez les allumettes dans le salon Ouest.',
        );
        return;
      }
      this.progressState.hearthLit = !this.progressState.hearthLit;
      this.audio.playSwitchOrIgnite();
      this.applyWorldVisualStates();
      this.callbacks.onToast?.(
        this.progressState.hearthLit
          ? 'Le feu crépite dans la cheminée monumentale !'
          : 'Vous avez étouffé les braises.',
      );
      this.saveProgress();
      return;
    }

    if (nearby.id === 'chandelier_switch') {
      if (!this.progressState.collectedItems.includes('fuse')) {
        this.audio.playDoorCreak(true);
        this.callbacks.onToast?.(
          'Le boîtier est vide — cherchez le fusible dans la bibliothèque.',
        );
        return;
      }
      this.progressState.chandelierLit = !this.progressState.chandelierLit;
      this.audio.playSwitchOrIgnite();
      this.applyWorldVisualStates();
      this.callbacks.onToast?.(
        this.progressState.chandelierLit
          ? 'Le grand lustre de cristal illumine le manoir !'
          : 'Grand lustre éteint.',
      );
      this.saveProgress();
      return;
    }

    if (nearby.id.startsWith('door:')) {
      const doorId = nearby.id.slice(5);
      const rig = this.doorRigs.find((d) => d.id === doorId);
      if (!rig) return;

      if (
        rig.requiresKey &&
        !rig.open &&
        !this.progressState.collectedItems.includes('key')
      ) {
        this.audio.playDoorCreak(true);
        this.callbacks.onToast?.(
          'Porte verrouillée — cherchez la clé en fer forgé près de la fontaine.',
        );
        return;
      }

      rig.open = !rig.open;
      rig.targetAngle = rig.open ? rig.openAngle : 0;
      this.audio.playDoorCreak(false);
      this.collisionWorld.setPortalOpen(rig.id, rig.open);

      if (rig.id === 'double_door') {
        this.progressState.doubleDoorOpen = rig.open;
        this.applyWorldVisualStates();
        this.callbacks.onToast?.(
          rig.open
            ? 'La double porte du Sanctuaire s’ouvre lentement…'
            : 'Double porte refermée.',
        );
      } else {
        const list = this.progressState.openDoorIds ?? [];
        this.progressState.openDoorIds = rig.open
          ? Array.from(new Set([...list, rig.id]))
          : list.filter((id) => id !== rig.id);
        this.refreshProbesNow();
      }
      this.saveProgress();
      return;
    }

    if (nearby.id.startsWith('window:')) {
      const winId = nearby.id.slice(7);
      const rig = this.windowRigs.find((w) => w.id === winId);
      if (rig) {
        rig.open = !rig.open;
        rig.targetAngle = rig.open ? rig.openAngle : 0;
        this.audio.playDoorCreak(false);
        this.collisionWorld.setPortalOpen(rig.id, rig.open);
        if (rig.open) {
          if (!this.progressState.openWindowNames.includes(winId)) {
            this.progressState.openWindowNames = [
              ...this.progressState.openWindowNames,
              winId,
            ];
          }
        } else {
          this.progressState.openWindowNames =
            this.progressState.openWindowNames.filter((n) => n !== winId);
        }
        this.refreshProbesNow();
        this.saveProgress();
      }
    }
  }

  private computeNearbyInteractable(): NearbyInteractable | null {
    if (this.mode !== 'explore') return null;
    _playerProbePos.set(
      this.playerFeet.x,
      this.playerFeet.y + 1.2,
      this.playerFeet.z,
    );

    let bestDist = 3.2;
    let best: NearbyInteractable | null = null;

    // Collectibles
    for (const rig of this.collectibleRigs) {
      if (rig.collected) continue;
      const d = Vector3.Distance(_playerProbePos, rig.root.position);
      if (d < bestDist) {
        bestDist = d;
        best = {
          id: `item:${rig.def.id}`,
          label: rig.def.name,
          actionLabel: rig.def.id.startsWith('journal')
            ? 'Lire et prendre'
            : 'Ramasser',
        };
      }
    }

    // Hearth
    const hearthDist = Vector3.Distance(_playerProbePos, this.hearthPosition);
    if (hearthDist < bestDist && hearthDist < 3.4) {
      bestDist = hearthDist;
      const hasMatches = this.progressState.collectedItems.includes('matches');
      best = {
        id: 'hearth',
        label: 'Cheminée monumentale',
        actionLabel: this.progressState.hearthLit
          ? 'Éteindre le foyer'
          : 'Allumer le foyer',
        lockedReason:
          !this.progressState.hearthLit && !hasMatches
            ? 'Allumettes requises'
            : undefined,
      };
    }

    // Chandelier switch
    const swDist = Vector3.Distance(_playerProbePos, this.switchPosition);
    if (swDist < bestDist && swDist < 2.8) {
      bestDist = swDist;
      const hasFuse = this.progressState.collectedItems.includes('fuse');
      best = {
        id: 'chandelier_switch',
        label: 'Interrupteur du Grand Lustre',
        actionLabel: this.progressState.chandelierLit
          ? 'Éteindre le lustre'
          : 'Allumer le lustre',
        lockedReason:
          !this.progressState.chandelierLit && !hasFuse
            ? 'Fusible requis'
            : undefined,
      };
    }

    // All Interactive Doors (Entrance, Interior Rooms & Sanctuary Double Door)
    for (const door of this.doorRigs) {
      const doorDist = Vector3.Distance(_playerProbePos, door.center);
      if (doorDist < bestDist && doorDist < 3.4) {
        bestDist = doorDist;
        const hasKey = this.progressState.collectedItems.includes('key');
        best = {
          id: `door:${door.id}`,
          label: door.label,
          actionLabel: door.open ? 'Fermer' : 'Ouvrir',
          lockedReason:
            door.requiresKey && !door.open && !hasKey
              ? 'Clé en fer forgé requise'
              : undefined,
        };
      }
    }

    // All Interactive Windows (Facade, Lateral & Upper Gallery)
    for (const win of this.windowRigs) {
      const wd = Vector3.Distance(_playerProbePos, win.center);
      if (wd < bestDist && wd < 3.2) {
        bestDist = wd;
        best = {
          id: `window:${win.id}`,
          label: win.label,
          actionLabel: win.open ? 'Fermer' : 'Ouvrir',
        };
      }
    }

    return best;
  }

  public setMode(nextMode: ViewerMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;

    if (nextMode === 'explore') {
      this.orbitTransitionActive = false;
      this.orbitCamera.detachControl();
      this.scene.activeCamera = this.exploreCamera;
      this.flashlight.setEnabled(this.flashlightEnabled);
      this.syncExploreCamera(0);
    } else {
      this.scene.activeCamera = this.orbitCamera;
      this.orbitCamera.attachControl(this.canvas, true);
      this.flashlight.setEnabled(false);
      this.goToCameraPreset('facade');
    }
  }

  public setAtmosphere(id: AtmosphereId): void {
    this.atmosphereId = id;
    const preset = ATMOSPHERE_PRESETS[id];
    this.scene.clearColor = new Color4(...preset.backgroundColor, 1);
    this.scene.fogColor = new Color3(...preset.fogColor);
    this.scene.fogDensity = preset.fogDensity;
    this.scene.environmentIntensity = preset.envIntensity;

    this.keyLight.diffuse = new Color3(...preset.keyLightColor);
    this.keyLight.intensity = preset.keyLightIntensity;
    this.keyLight.direction = new Vector3(...preset.keyLightDirection);

    this.hemiLight.diffuse = new Color3(...preset.hemiSkyColor);
    this.hemiLight.groundColor = new Color3(...preset.hemiGroundColor);
    this.hemiLight.intensity = preset.hemiIntensity;

    this.rimLight.diffuse = new Color3(...preset.rimLightColor);
    this.rimLight.intensity = preset.rimLightIntensity;

    this.interiorWarmLight.diffuse = new Color3(...preset.interiorWarmColor);
    this.interiorWarmLight.intensity = preset.interiorWarmIntensity;

    if (this.defaultPipeline) {
      this.defaultPipeline.imageProcessing.exposure = preset.exposure;
    } else {
      this.scene.imageProcessingConfiguration.exposure = preset.exposure;
    }

    for (const shaft of this.lightShaftMeshes) {
      if (shaft.material instanceof StandardMaterial) {
        shaft.material.alpha = preset.shaftAlpha;
      }
    }

    this.manorEnhancements.setSkyVisible(id === 'moonlight');
    this.manorEnhancements.setDrizzleActive(id === 'moonlight' || id === 'dawn');
    this.refreshProbesNow();
  }

  public setQualityTier(tier: QualityTier): void {
    this.resolvedQuality = resolveQualityTier(tier, this.isSoftwareGl);
    this.callbacks.onQualityResolved?.(this.resolvedQuality);
    this.applyHardwareScaling();
    this.configureShadowsAndPostProcess();
    this.enhancementColliders = this.manorEnhancements.build(
      this.detailTextures,
      this.resolvedQuality,
      this.shadowGenerator,
    );
    this.manorEnhancements.setSkyVisible(this.atmosphereId === 'moonlight');
    this.manorEnhancements.setDrizzleActive(
      this.atmosphereId === 'moonlight' || this.atmosphereId === 'dawn',
    );
    if (this.manorMeshes.length > 0) {
      const explicitPortalMeshes = new Set<AbstractMesh>();
      for (const d of this.doorRigs) {
        for (const m of d.meshes) explicitPortalMeshes.add(m);
      }
      for (const w of this.windowRigs) {
        for (const m of w.meshes) explicitPortalMeshes.add(m);
      }
      this.collisionWorld.buildFromMeshes(
        [
          ...this.manorMeshes,
          ...this.enhancementColliders,
          ...this.partitionColliders,
          ...this.partitionWalkables,
        ],
        this.outerGround,
        explicitPortalMeshes,
      );
      this.collisionWorld.setDoorsOpen(this.progressState.doubleDoorOpen);
      this.configureRealtimeReflectionProbes();
    }
    if (this.gaussianEnabled) {
      void this.gaussianEnv.initialize(this.resolvedQuality);
    }
  }

  public setGaussianVisible(visible: boolean): void {
    this.gaussianEnabled = visible;
    this.gaussianEnv.setVisible(visible);
  }

  public async loadCustomSplatFile(file: File): Promise<number> {
    this.gaussianEnabled = true;
    return this.gaussianEnv.loadCustomSplatFile(file);
  }

  public goToCameraPreset(id: CameraPresetId): void {
    if (this.mode === 'explore') {
      this.setMode('orbit');
    }
    const preset =
      CAMERA_PRESETS.find((p) => p.id === id) ?? CAMERA_PRESETS[0];
    _orbitPosGoal.set(...preset.position);
    _orbitTargetGoal.set(...preset.target);
    this.orbitTransitionActive = true;
  }

  public focusOnPoint(center: [number, number, number], radius: number): void {
    if (this.mode === 'explore') {
      this.setMode('orbit');
    }
    const dist = Math.max(3.5, Math.min(24, radius * 2.2));
    const dir = this.orbitCamera.position.subtract(this.orbitCamera.target);
    if (dir.lengthSquared() < 0.01) dir.set(1, 0.5, 1);
    dir.normalize();
    _orbitTargetGoal.set(...center);
    _orbitPosGoal.set(
      center[0] + dir.x * dist,
      Math.max(1.2, center[1] + dir.y * dist),
      center[2] + dir.z * dist,
    );
    this.orbitTransitionActive = true;
  }

  public setWireframe(enabled: boolean): void {
    this.wireframeEnabled = enabled;
    for (const mesh of [
      ...this.manorMeshes,
      ...this.partitionColliders,
      ...this.manorEnhancements.getPartitionRenderMeshes(),
    ]) {
      if (mesh.material) {
        mesh.material.wireframe = enabled;
      }
    }
  }

  public setAutoRotate(enabled: boolean): void {
    this.autoRotateEnabled = enabled && !this.isSoftwareGl;
    this.orbitCamera.useAutoRotationBehavior = this.autoRotateEnabled;
  }

  public setFlashlight(enabled: boolean): void {
    this.flashlightEnabled = enabled;
    this.flashlight.setEnabled(enabled && this.mode === 'explore');
  }

  public setAudioMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setMobileMoveVector(x: number, y: number): void {
    this.mobileMove.x = x;
    this.mobileMove.y = y;
  }

  public setMobileSprint(enabled: boolean): void {
    this.mobileSprint = enabled;
  }

  public triggerJump(): void {
    this.jumpQueued = true;
  }

  public resetPlayerSpawn(): void {
    this.playerFeet.set(3.4, -0.65, 17.5);
    const groundY = this.collisionWorld.sampleGroundHeight(
      this.playerFeet.x,
      this.playerFeet.y,
      this.playerFeet.z,
    );
    if (groundY !== null) {
      this.playerFeet.y = groundY;
    }
    this.verticalVel.value = 0;
    this.yaw = 0.19;
    this.pitch = 0.04;
    this.headBobPhase = 0;
    this.syncExploreCamera(0);
    this.saveProgress();
  }

  public resetNewGame(): void {
    localStorage.removeItem(SAVE_STORAGE_KEY);
    this.progressState = {
      enteredManor: false,
      hearthLit: false,
      chandelierLit: false,
      doubleDoorOpen: false,
      openDoorIds: [],
      openWindowNames: [],
      collectedItems: [],
    };
    for (const rig of this.collectibleRigs) {
      rig.collected = false;
      rig.root.setEnabled(true);
    }
    for (const door of this.doorRigs) {
      door.open = false;
      door.targetAngle = 0;
      this.collisionWorld.setPortalOpen(door.id, false);
    }
    for (const win of this.windowRigs) {
      win.open = false;
      win.targetAngle = 0;
      this.collisionWorld.setPortalOpen(win.id, false);
    }
    this.applyWorldVisualStates();
    this.resetPlayerSpawn();
    this.callbacks.onToast?.('Nouvelle partie démarrée.');
  }

  public clearSelection(): void {
    if (
      this.selectedMesh &&
      this.selectedMesh.material instanceof PBRMaterial &&
      this.selectedOriginalEmissive
    ) {
      this.selectedMesh.material.emissiveColor.copyFrom(
        this.selectedOriginalEmissive,
      );
    }
    this.selectedMesh = null;
    this.selectedOriginalEmissive = null;
    this.callbacks.onInspect?.(null);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    this.audio.unlockAndStart();
    this.keysPressed.add(e.code);
    if (e.code === 'Space' && this.mode === 'explore') {
      this.jumpQueued = true;
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysPressed.delete(e.code);
  }

  private handlePointerDown(event: PointerEvent): void {
    this.audio.unlockAndStart();
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    if (this.mode === 'explore') {
      this.lookDragging = true;
      this.activeLookPointerId = event.pointerId;
      this.lastLookPointer = { x: event.clientX, y: event.clientY };
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (
      this.mode !== 'explore' ||
      !this.lookDragging ||
      event.pointerId !== this.activeLookPointerId
    ) {
      return;
    }
    const dx = event.clientX - this.lastLookPointer.x;
    const dy = event.clientY - this.lastLookPointer.y;
    this.lastLookPointer = { x: event.clientX, y: event.clientY };

    const sensitivity = 0.0042;
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.25, Math.min(1.25, this.pitch - dy * sensitivity));
  }

  private handlePointerUp(event: PointerEvent): void {
    if (event.pointerId === this.activeLookPointerId) {
      this.lookDragging = false;
      this.activeLookPointerId = null;
    }

    if (event.target !== this.canvas) return;
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 25) return;

    const rect = this.canvas.getBoundingClientRect();
    const pick = this.scene.pick(
      event.clientX - rect.left,
      event.clientY - rect.top,
      (mesh) => mesh.isPickable && mesh.getTotalVertices() > 0,
    );

    if (!pick || !pick.hit || !pick.pickedMesh) {
      this.clearSelection();
      return;
    }

    const hitMesh = pick.pickedMesh;
    if (hitMesh === this.selectedMesh) return;

    this.clearSelection();
    this.selectedMesh = hitMesh;

    let materialName = 'Matériau PBR';
    if (hitMesh.material) {
      materialName = hitMesh.material.name
        ? formatNodeName(hitMesh.material.name)
        : 'Matériau PBR';
      if (hitMesh.material instanceof PBRMaterial) {
        this.selectedOriginalEmissive =
          hitMesh.material.emissiveColor.clone();
        hitMesh.material.emissiveColor.set(0.16, 0.3, 0.48);
      }
    }

    hitMesh.computeWorldMatrix(true);
    const bbox = hitMesh.getBoundingInfo().boundingBox;
    const center = bbox.centerWorld;
    const extend = bbox.extendSizeWorld;
    const sx = extend.x * 2;
    const sy = extend.y * 2;
    const sz = extend.z * 2;
    const radius = Math.hypot(extend.x, extend.y, extend.z);

    this.callbacks.onInspect?.({
      name: formatNodeName(hitMesh.name),
      material: materialName,
      dimensions: `${sx.toFixed(1)} × ${sy.toFixed(1)} × ${sz.toFixed(1)} m`,
      center: [center.x, center.y, center.z],
      radius,
    });
  }

  private syncExploreCamera(bobOffset: number): void {
    const eyeY = this.playerFeet.y + this.eyeHeight + bobOffset;
    this.exploreCamera.position.set(this.playerFeet.x, eyeY, this.playerFeet.z);

    const cosPitch = Math.cos(this.pitch);
    const fwdX = -Math.sin(this.yaw) * cosPitch;
    const fwdY = Math.sin(this.pitch);
    const fwdZ = -Math.cos(this.yaw) * cosPitch;

    _lookTarget.set(
      this.playerFeet.x + fwdX,
      eyeY + fwdY,
      this.playerFeet.z + fwdZ,
    );
    this.exploreCamera.setTarget(_lookTarget);

    this.flashlight.position.set(
      this.playerFeet.x + Math.cos(this.yaw) * 0.2,
      eyeY - 0.14,
      this.playerFeet.z - Math.sin(this.yaw) * 0.2,
    );
    this.flashlight.direction.set(fwdX, fwdY - 0.02, fwdZ).normalize();

    this.audio.updateListener(
      this.playerFeet.x,
      eyeY,
      this.playerFeet.z,
      fwdX,
      fwdY,
      fwdZ,
    );
  }

  private stepFrame(dt: number, elapsedSec: number): void {
    // 1. Animate atmospheric flicker, fog pulse, doors, windows, collectibles
    const atmo = ATMOSPHERE_PRESETS[this.atmosphereId];
    this.scene.fogDensity =
      atmo.fogDensity + Math.sin(elapsedSec * 0.35) * 0.0012;

    if (this.progressState.hearthLit) {
      this.hearthLight.intensity =
        26 +
        Math.sin(elapsedSec * 11) * 3.5 +
        Math.sin(elapsedSec * 23) * 1.8;
    }

    if (this.chandelierRoot) {
      this.chandelierRoot.rotation.z = Math.sin(elapsedSec * 0.7) * 0.012;
      this.chandelierRoot.rotation.x = Math.cos(elapsedSec * 0.55) * 0.008;
    }

    for (const door of this.doorRigs) {
      const diff = door.targetAngle - door.currentAngle;
      if (Math.abs(diff) > 0.002) {
        door.currentAngle += diff * (1 - Math.exp(-5.5 * dt));
        if (door.isDouble && door.rightPivot) {
          door.leftPivot.rotation.y = -door.currentAngle;
          door.rightPivot.rotation.y = door.currentAngle;
        } else {
          door.leftPivot.rotation.y = door.currentAngle;
        }
      }
    }

    for (const win of this.windowRigs) {
      const diff = win.targetAngle - win.currentAngle;
      if (Math.abs(diff) > 0.002) {
        win.currentAngle += diff * (1 - Math.exp(-6.5 * dt));
        win.pivot.rotation.y = win.currentAngle;
      }
    }

    for (const rig of this.collectibleRigs) {
      if (!rig.collected) {
        rig.root.rotation.y += dt * 1.1;
        rig.root.position.y =
          rig.baseY + Math.sin(elapsedSec * 2.2 + rig.baseY) * 0.05;
      }
    }

    // 2. Mode-specific camera & player physics
    if (this.mode === 'explore') {
      let moveForward = 0;
      let moveRight = 0;
      if (
        this.keysPressed.has('KeyW') ||
        this.keysPressed.has('KeyZ') ||
        this.keysPressed.has('ArrowUp')
      ) {
        moveForward += 1;
      }
      if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) {
        moveForward -= 1;
      }
      if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) {
        moveRight += 1;
      }
      if (
        this.keysPressed.has('KeyA') ||
        this.keysPressed.has('KeyQ') ||
        this.keysPressed.has('ArrowLeft')
      ) {
        moveRight -= 1;
      }

      moveForward += this.mobileMove.y;
      moveRight += this.mobileMove.x;

      const inputLen = Math.hypot(moveForward, moveRight);
      if (inputLen > 1) {
        moveForward /= inputLen;
        moveRight /= inputLen;
      }

      const sprinting =
        this.mobileSprint ||
        this.keysPressed.has('ShiftLeft') ||
        this.keysPressed.has('ShiftRight');
      const speed = sprinting ? 7.2 : 4.3;

      _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

      const deltaX =
        (_forward.x * moveForward + _right.x * moveRight) * speed * dt;
      const deltaZ =
        (_forward.z * moveForward + _right.z * moveRight) * speed * dt;

      const jump = this.jumpQueued;
      this.jumpQueued = false;

      const res = this.collisionWorld.resolveMovement(
        this.playerFeet,
        deltaX,
        deltaZ,
        this.verticalVel,
        jump,
        dt,
      );
      this.playerFeet.copyFrom(res.position);

      let bobOffset = 0;
      if (res.grounded && inputLen > 0.08) {
        this.headBobPhase += dt * (sprinting ? 12 : 8.5);
        bobOffset = Math.sin(this.headBobPhase) * 0.038;
        const sign = Math.sin(this.headBobPhase) >= 0 ? 1 : -1;
        if (sign !== this.lastFootstepSign && sign < 0) {
          this.audio.playFootstep(res.insideManor);
        }
        this.lastFootstepSign = sign;
      }

      this.syncExploreCamera(bobOffset);

      // Update zone & quest entry trigger
      const zone: ExploreZone = !res.insideManor
        ? 'Extérieur'
        : res.onUpperFloor
          ? 'Étage'
          : 'Rez-de-chaussée';
      if (zone !== this.lastZone) {
        this.lastZone = zone;
        this.callbacks.onZoneChange?.(zone);
      }

      if (res.insideManor && !this.progressState.enteredManor) {
        this.progressState.enteredManor = true;
        this.audio.playPickup();
        this.callbacks.onToast?.(
          'Vous entrez dans le Grand Hall du Manoir des Valmont.',
        );
        this.saveProgress();
      }

      const completedCount = [
        this.progressState.enteredManor,
        this.progressState.hearthLit,
        this.progressState.chandelierLit,
        this.progressState.collectedItems.includes('medallion'),
        this.progressState.doubleDoorOpen,
      ].filter(Boolean).length;
      this.audio.setWorldState(
        zone,
        this.progressState.hearthLit,
        this.progressState.chandelierLit,
        completedCount / 5,
      );

      // Check nearby interactable
      const nearby = this.computeNearbyInteractable();
      const nextId = nearby ? nearby.id : null;
      if (nextId !== this.lastNearbyId) {
        this.lastNearbyId = nextId;
        this.callbacks.onNearbyChange?.(nearby);
      }
    } else {
      if (this.lastNearbyId !== null) {
        this.lastNearbyId = null;
        this.callbacks.onNearbyChange?.(null);
      }

      if (this.orbitTransitionActive) {
        const damp = 1 - Math.exp(-6.5 * dt);
        const curPos = this.orbitCamera.position.clone();
        const curTarget = this.orbitCamera.target.clone();
        curPos.x += (_orbitPosGoal.x - curPos.x) * damp;
        curPos.y += (_orbitPosGoal.y - curPos.y) * damp;
        curPos.z += (_orbitPosGoal.z - curPos.z) * damp;
        curTarget.x += (_orbitTargetGoal.x - curTarget.x) * damp;
        curTarget.y += (_orbitTargetGoal.y - curTarget.y) * damp;
        curTarget.z += (_orbitTargetGoal.z - curTarget.z) * damp;

        this.orbitCamera.setTarget(curTarget);
        this.orbitCamera.setPosition(curPos);

        if (
          Vector3.DistanceSquared(curPos, _orbitPosGoal) < 0.005 &&
          Vector3.DistanceSquared(curTarget, _orbitTargetGoal) < 0.005
        ) {
          this.orbitCamera.setTarget(_orbitTargetGoal);
          this.orbitCamera.setPosition(_orbitPosGoal);
          this.orbitTransitionActive = false;
        }
      }
    }
  }

  private startRenderLoop(): void {
    const startMs = performance.now();

    if (this.isSoftwareGl) {
      const softwareTick = () => {
        if (this.disposed) return;
        const now = performance.now();
        const dt = Math.min(0.08, (now - this.lastFrameMs) / 1000);
        this.lastFrameMs = now;
        this.stepFrame(dt, (now - startMs) / 1000);
        this.scene.render();
        this.softwareTimerId = window.setTimeout(softwareTick, 80);
      };
      this.softwareTimerId = window.setTimeout(softwareTick, 30);
    } else {
      this.engine.runRenderLoop(() => {
        if (this.disposed) return;
        const now = performance.now();
        const dt = Math.min(0.08, (now - this.lastFrameMs) / 1000);
        this.lastFrameMs = now;
        this.stepFrame(dt, (now - startMs) / 1000);
        this.scene.render();
      });
    }
  }

  public dispose(): void {
    this.disposed = true;
    clearTimeout(this.softwareTimerId);
    this.engine.stopRenderLoop();

    window.removeEventListener('resize', this.onResizeBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);

    this.audio.dispose();
    this.gaussianEnv.dispose();
    this.manorEnhancements.dispose();
    this.hallProbe?.dispose();
    this.courtyardProbe?.dispose();
    this.ssaoPipeline?.dispose();
    this.defaultPipeline?.dispose();
    this.shadowGenerator?.dispose();

    this.dustParticles?.dispose();
    this.courtyardMistParticles?.dispose();
    this.hearthParticles?.dispose();

    this.detailTextures.stoneAlbedo.dispose();
    this.detailTextures.stoneBump.dispose();
    this.detailTextures.woodAlbedo.dispose();
    this.detailTextures.woodBump.dispose();
    this.detailTextures.marbleAlbedo.dispose();
    this.detailTextures.marbleBump.dispose();
    this.detailTextures.marbleRoughness.dispose();
    this.detailTextures.metalBump.dispose();
    this.detailTextures.slateAlbedo.dispose();
    this.detailTextures.slateBump.dispose();
    this.detailTextures.mudAlbedo.dispose();
    this.detailTextures.mudBump.dispose();
    this.detailTextures.cobwebAlpha.dispose();
    this.detailTextures.skyNightAlbedo.dispose();
    this.detailTextures.particleDot.dispose();
    this.detailTextures.lightShaftTexture.dispose();
    this.envCubeTexture.dispose();

    this.scene.dispose();
    this.engine.dispose();
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
  }
}
