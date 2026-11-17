import {
  AbstractMesh,
  BaseTexture,
  Color3,
  Color4,
  Material,
  Matrix,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  PBRMaterial,
  PointLight,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { MaterialDetailTextures } from './ProceduralTextures';
import { ResolvedQuality } from './presets';

function seededRand(seedRef: { v: number }): number {
  seedRef.v = (seedRef.v * 1664525 + 1013904223) >>> 0;
  return seedRef.v / 4294967296;
}

export interface EnhancedDoorDescriptor {
  id: string;
  label: string;
  isDouble: boolean;
  openAngle: number;
  leftPivot: TransformNode;
  rightPivot?: TransformNode;
  meshes: AbstractMesh[];
  center: Vector3;
}

export interface EnhancedWindowDescriptor {
  id: string;
  label: string;
  pivot: TransformNode;
  openAngle: number;
  meshes: AbstractMesh[];
  center: Vector3;
}

export interface PartitionBuildResult {
  wallMeshes: AbstractMesh[];
  walkableMeshes: AbstractMesh[];
  doors: EnhancedDoorDescriptor[];
  windows: EnhancedWindowDescriptor[];
}

export class ManorEnhancements {
  private scene: Scene;
  private root: TransformNode;
  private createdMeshes: AbstractMesh[] = [];
  private partitionMeshes: AbstractMesh[] = [];
  private createdMaterials: (PBRMaterial | StandardMaterial)[] = [];
  private createdParticles: ParticleSystem[] = [];
  private exteriorWindowLights: PointLight[] = [];
  private rainParticles: ParticleSystem | null = null;
  private skyDome: Mesh | null = null;
  private mudMat: PBRMaterial | null = null;
  private glassMat: PBRMaterial | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode('manor_aaa_enhancements', scene);
  }

  public build(
    textures: MaterialDetailTextures,
    quality: ResolvedQuality,
    shadowGenerator: ShadowGenerator | null,
  ): AbstractMesh[] {
    this.dispose();
    this.root = new TransformNode('manor_aaa_enhancements', this.scene);
    const colliders: AbstractMesh[] = [];

    this.buildNightSkyDome(textures);
    this.buildMansardRoofAndChimneys(textures, shadowGenerator);
    this.buildWarmGlowingWindows();
    this.buildCeilingBeamsAndCobwebs(textures);
    this.buildOvergrownCourtyardAndFence(
      textures,
      quality,
      shadowGenerator,
      colliders,
    );
    this.buildAtmosphericWeatherAndSmoke(textures, quality);

    return colliders;
  }

  /**
   * Builds the Front Central Facade (with Grand Entrance Double Doors & 4 openable windows)
   * and segmented doorway-cutout interior walls + 6 hinged oak doors so every room and floor
   * is genuinely reachable while keeping 100% solid wall collision.
   */
  public buildArchitecturalPartitionsAndPortals(
    textures: MaterialDetailTextures,
    partitionMaterial: Material | null,
    facadeMaterial: Material | null,
    shadowGenerator: ShadowGenerator | null,
    glassReflection: BaseTexture | null,
  ): PartitionBuildResult {
    this.disposePartitions();

    const wallMeshes: AbstractMesh[] = [];
    const walkableMeshes: AbstractMesh[] = [];
    const doors: EnhancedDoorDescriptor[] = [];
    const windows: EnhancedWindowDescriptor[] = [];

    const wallMat =
      partitionMaterial ??
      this.makeFallbackStoneMat('partition_stone_mat', textures);
    const frontMat =
      facadeMaterial ??
      this.makeFallbackStoneMat('front_facade_stone_mat', textures);

    const oakMat = new PBRMaterial('enhanced_oak_door_mat', this.scene);
    oakMat.albedoColor = new Color3(0.24, 0.16, 0.1);
    oakMat.albedoTexture = textures.woodAlbedo;
    oakMat.bumpTexture = textures.woodBump;
    oakMat.bumpTexture.level = 0.72;
    oakMat.roughness = 0.72;
    oakMat.metallic = 0.04;
    oakMat.enableSpecularAntiAliasing = true;

    const frameMat = new PBRMaterial('enhanced_door_frame_mat', this.scene);
    frameMat.albedoColor = new Color3(0.14, 0.09, 0.06);
    frameMat.albedoTexture = textures.woodAlbedo;
    frameMat.bumpTexture = textures.woodBump;
    frameMat.bumpTexture.level = 0.65;
    frameMat.roughness = 0.78;

    const brassMat = new PBRMaterial('enhanced_brass_handle_mat', this.scene);
    brassMat.albedoColor = new Color3(0.76, 0.58, 0.24);
    brassMat.bumpTexture = textures.metalBump;
    brassMat.metallic = 0.88;
    brassMat.roughness = 0.3;
    brassMat.enableSpecularAntiAliasing = true;

    const glassMat = new PBRMaterial('enhanced_window_glass_mat', this.scene);
    glassMat.albedoColor = new Color3(0.55, 0.68, 0.82);
    glassMat.emissiveColor = new Color3(0.16, 0.11, 0.05);
    glassMat.roughness = 0.08;
    glassMat.metallic = 0.12;
    glassMat.alpha = 0.46;
    glassMat.reflectionTexture = glassReflection;
    glassMat.environmentIntensity = 1.45;
    this.glassMat = glassMat;

    this.createdMaterials.push(oakMat, frameMat, brassMat, glassMat);

    const addBox = (
      name: string,
      minX: number,
      maxX: number,
      minY: number,
      maxY: number,
      minZ: number,
      maxZ: number,
      mat: Material,
      isWallCollider = true,
      isWalkable = false,
    ): Mesh => {
      const w = Math.max(0.02, maxX - minX);
      const h = Math.max(0.02, maxY - minY);
      const d = Math.max(0.02, maxZ - minZ);
      const box = MeshBuilder.CreateBox(
        name,
        { width: w, height: h, depth: d },
        this.scene,
      );
      box.position.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
      box.material = mat;
      box.receiveShadows = true;
      box.freezeWorldMatrix();
      this.partitionMeshes.push(box);
      if (shadowGenerator) shadowGenerator.addShadowCaster(box, false);
      if (isWalkable) walkableMeshes.push(box);
      else if (isWallCollider) wallMeshes.push(box);
      return box;
    };

    const addSingleDoor = (
      id: string,
      label: string,
      axis: 'x' | 'z',
      cx: number,
      floorY: number,
      cz: number,
      width: number,
      height: number,
      openAngle: number,
    ) => {
      const thick = 0.09;
      const pivot = new TransformNode(`door_pivot_${id}`, this.scene);
      const leafMeshes: AbstractMesh[] = [];

      if (axis === 'z') {
        // Wall runs along X (door faces Z)
        pivot.position.set(cx - width * 0.5, floorY + height * 0.5, cz);

        // Trim frame (non-blocking thin border)
        addBox(`porte_frame_${id}_L`, cx - width * 0.5 - 0.08, cx - width * 0.5, floorY, floorY + height, cz - 0.14, cz + 0.14, frameMat, false);
        addBox(`porte_frame_${id}_R`, cx + width * 0.5, cx + width * 0.5 + 0.08, floorY, floorY + height, cz - 0.14, cz + 0.14, frameMat, false);
        addBox(`porte_frame_${id}_T`, cx - width * 0.5 - 0.08, cx + width * 0.5 + 0.08, floorY + height, floorY + height + 0.1, cz - 0.14, cz + 0.14, frameMat, false);

        const leaf = MeshBuilder.CreateBox(
          `Porte ${label}`,
          { width, height, depth: thick },
          this.scene,
        );
        leaf.parent = pivot;
        leaf.position.set(width * 0.5, 0, 0);
        leaf.material = oakMat;
        leaf.receiveShadows = true;

        const handle = MeshBuilder.CreateBox(
          `Poignee ${label}`,
          { width: 0.14, height: 0.06, depth: 0.18 },
          this.scene,
        );
        handle.parent = pivot;
        handle.position.set(width - 0.18, -0.18, 0);
        handle.material = brassMat;

        leafMeshes.push(leaf, handle);
      } else {
        // Wall runs along Z (door faces X)
        pivot.position.set(cx, floorY + height * 0.5, cz - width * 0.5);

        addBox(`porte_frame_${id}_L`, cx - 0.14, cx + 0.14, floorY, floorY + height, cz - width * 0.5 - 0.08, cz - width * 0.5, frameMat, false);
        addBox(`porte_frame_${id}_R`, cx - 0.14, cx + 0.14, floorY, floorY + height, cz + width * 0.5, cz + width * 0.5 + 0.08, frameMat, false);
        addBox(`porte_frame_${id}_T`, cx - 0.14, cx + 0.14, floorY + height, floorY + height + 0.1, cz - width * 0.5 - 0.08, cz + width * 0.5 + 0.08, frameMat, false);

        const leaf = MeshBuilder.CreateBox(
          `Porte ${label}`,
          { width: thick, height, depth: width },
          this.scene,
        );
        leaf.parent = pivot;
        leaf.position.set(0, 0, width * 0.5);
        leaf.material = oakMat;
        leaf.receiveShadows = true;

        const handle = MeshBuilder.CreateBox(
          `Poignee ${label}`,
          { width: 0.18, height: 0.06, depth: 0.14 },
          this.scene,
        );
        handle.parent = pivot;
        handle.position.set(0, -0.18, width - 0.18);
        handle.material = brassMat;

        leafMeshes.push(leaf, handle);
      }

      if (shadowGenerator) {
        for (const m of leafMeshes) shadowGenerator.addShadowCaster(m, false);
      }
      this.partitionMeshes.push(...leafMeshes);
      doors.push({
        id,
        label,
        isDouble: false,
        openAngle,
        leftPivot: pivot,
        meshes: leafMeshes,
        center: new Vector3(cx, floorY + 1.35, cz),
      });
    };

    const addFrontDoubleDoor = (
      id: string,
      label: string,
      cx: number,
      floorY: number,
      cz: number,
      totalWidth: number,
      height: number,
    ) => {
      const leafW = totalWidth * 0.5 - 0.02;
      const thick = 0.12;
      const leftPivot = new TransformNode(`door_pivot_${id}_L`, this.scene);
      leftPivot.position.set(cx - totalWidth * 0.5, floorY + height * 0.5, cz);

      const rightPivot = new TransformNode(`door_pivot_${id}_R`, this.scene);
      rightPivot.position.set(cx + totalWidth * 0.5, floorY + height * 0.5, cz);

      // Decorative Stone & Oak Portal Frame
      addBox(`porte_frame_${id}_L`, cx - totalWidth * 0.5 - 0.14, cx - totalWidth * 0.5, floorY, floorY + height, cz - 0.28, cz + 0.28, frameMat, false);
      addBox(`porte_frame_${id}_R`, cx + totalWidth * 0.5, cx + totalWidth * 0.5 + 0.14, floorY, floorY + height, cz - 0.28, cz + 0.28, frameMat, false);
      addBox(`porte_frame_${id}_T`, cx - totalWidth * 0.5 - 0.18, cx + totalWidth * 0.5 + 0.18, floorY + height, floorY + height + 0.22, cz - 0.3, cz + 0.3, frameMat, false);

      const leafL = MeshBuilder.CreateBox(
        `${label} (battant gauche)`,
        { width: leafW, height, depth: thick },
        this.scene,
      );
      leafL.parent = leftPivot;
      leafL.position.set(leafW * 0.5, 0, 0);
      leafL.material = oakMat;

      const leafR = MeshBuilder.CreateBox(
        `${label} (battant droit)`,
        { width: leafW, height, depth: thick },
        this.scene,
      );
      leafR.parent = rightPivot;
      leafR.position.set(-leafW * 0.5, 0, 0);
      leafR.material = oakMat;

      const handleL = MeshBuilder.CreateBox(
        `Poignee ${id} G`,
        { width: 0.14, height: 0.12, depth: 0.2 },
        this.scene,
      );
      handleL.parent = leftPivot;
      handleL.position.set(leafW - 0.16, -0.25, 0);
      handleL.material = brassMat;

      const handleR = MeshBuilder.CreateBox(
        `Poignee ${id} D`,
        { width: 0.14, height: 0.12, depth: 0.2 },
        this.scene,
      );
      handleR.parent = rightPivot;
      handleR.position.set(-leafW + 0.16, -0.25, 0);
      handleR.material = brassMat;

      const meshes = [leafL, leafR, handleL, handleR];
      if (shadowGenerator) {
        for (const m of meshes) shadowGenerator.addShadowCaster(m, false);
      }
      this.partitionMeshes.push(...meshes);
      doors.push({
        id,
        label,
        isDouble: true,
        openAngle: 1.48,
        leftPivot,
        rightPivot,
        meshes,
        center: new Vector3(cx, floorY + 1.4, cz),
      });
    };

    const addFrontCasementWindow = (
      id: string,
      label: string,
      cx: number,
      cy: number,
      cz: number,
      width: number,
      height: number,
    ) => {
      const pivot = new TransformNode(`win_pivot_${id}`, this.scene);
      pivot.position.set(cx - width * 0.5, cy, cz);

      // Frame mullions (static trim)
      addBox(`fenetre_frame_${id}_L`, cx - width * 0.5 - 0.08, cx - width * 0.5, cy - height * 0.5, cy + height * 0.5, cz - 0.26, cz + 0.26, frameMat, false);
      addBox(`fenetre_frame_${id}_R`, cx + width * 0.5, cx + width * 0.5 + 0.08, cy - height * 0.5, cy + height * 0.5, cz - 0.26, cz + 0.26, frameMat, false);
      addBox(`fenetre_frame_${id}_B`, cx - width * 0.5 - 0.1, cx + width * 0.5 + 0.1, cy - height * 0.5 - 0.08, cy - height * 0.5, cz - 0.3, cz + 0.3, frameMat, false);
      addBox(`fenetre_frame_${id}_T`, cx - width * 0.5 - 0.1, cx + width * 0.5 + 0.1, cy + height * 0.5, cy + height * 0.5 + 0.08, cz - 0.3, cz + 0.3, frameMat, false);

      const sash = MeshBuilder.CreateBox(
        label,
        { width: width - 0.06, height: height - 0.06, depth: 0.06 },
        this.scene,
      );
      sash.parent = pivot;
      sash.position.set(width * 0.5, 0, 0);
      sash.material = glassMat;

      const crossH = MeshBuilder.CreateBox(
        `Croisillon H ${id}`,
        { width: width - 0.08, height: 0.06, depth: 0.09 },
        this.scene,
      );
      crossH.parent = pivot;
      crossH.position.set(width * 0.5, 0, 0);
      crossH.material = frameMat;

      const crossV = MeshBuilder.CreateBox(
        `Croisillon V ${id}`,
        { width: 0.06, height: height - 0.08, depth: 0.09 },
        this.scene,
      );
      crossV.parent = pivot;
      crossV.position.set(width * 0.5, 0, 0);
      crossV.material = frameMat;

      const meshes = [sash, crossH, crossV];
      this.partitionMeshes.push(...meshes);
      windows.push({
        id,
        label,
        pivot,
        openAngle: -1.18,
        meshes,
        center: new Vector3(cx, cy, cz),
      });
    };

    // =========================================================================
    // 1. FRONT CENTRAL FACADE (x in [-7.5, +7.5], z = 9.42..9.87)
    // =========================================================================
    const fMinZ = 9.42;
    const fMaxZ = 9.87;
    // Ground floor stone pillars/walls between wing facades (-7.5..7.5)
    addBox('Facade avant pilier Ouest', -7.5, -5.6, 0.15, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant allège Ouest', -5.6, -3.8, 0.15, 1.45, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant linteau Ouest', -5.6, -3.8, 3.75, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant pilier portail G', -3.8, -1.9, 0.15, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant linteau portail', -1.9, 1.9, 3.65, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant pilier portail D', 1.9, 3.8, 0.15, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant allège Est', 3.8, 5.6, 0.15, 1.45, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant linteau Est', 3.8, 5.6, 3.75, 5.15, fMinZ, fMaxZ, frontMat);
    addBox('Facade avant pilier Est', 5.6, 7.5, 0.15, 5.15, fMinZ, fMaxZ, frontMat);

    // Upper floor front facade (-7.5..7.5, y = 5.3..10.0)
    addBox('Facade etage pilier Ouest', -7.5, -5.6, 5.3, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage allège Ouest', -5.6, -3.8, 5.3, 6.45, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage linteau Ouest', -5.6, -3.8, 8.75, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage pilier centre G', -3.8, -1.5, 5.3, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage allège centre', -1.5, 1.5, 5.3, 6.35, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage linteau centre', -1.5, 1.5, 8.85, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage pilier centre D', 1.5, 3.8, 5.3, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage allège Est', 3.8, 5.6, 5.3, 6.45, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage linteau Est', 3.8, 5.6, 8.75, 10.0, fMinZ, fMaxZ, frontMat);
    addBox('Facade etage pilier Est', 5.6, 7.5, 5.3, 10.0, fMinZ, fMaxZ, frontMat);

    // Stone entrance steps outside front portal
    addBox('Marche_entree_basse', -2.6, 2.6, -0.25, 0.05, 10.45, 11.25, frontMat, false, true);
    addBox('Marche_entree_haute', -2.3, 2.3, 0.0, 0.28, 9.85, 10.5, frontMat, false, true);

    // Grand Front Entrance Double Doors (open outward +Z cleanly)
    addFrontDoubleDoor('front_entrance', "Porte d'entrée principale", 0, 0.45, 9.65, 3.8, 3.18);

    // 5 Openable Front Facade Windows
    addFrontCasementWindow('win_facade_ouest_bas', 'Fenêtre façade Ouest (RDC)', -4.7, 2.6, 9.65, 1.8, 2.3);
    addFrontCasementWindow('win_facade_est_bas', 'Fenêtre façade Est (RDC)', 4.7, 2.6, 9.65, 1.8, 2.3);
    addFrontCasementWindow('win_facade_ouest_haut', 'Fenêtre façade Ouest (Étage)', -4.7, 7.6, 9.65, 1.8, 2.3);
    addFrontCasementWindow('win_facade_est_haut', 'Fenêtre façade Est (Étage)', 4.7, 7.6, 9.65, 1.8, 2.3);
    addFrontCasementWindow('win_facade_centre_haut', 'Grande fenêtre du Portique (Étage)', 0, 7.6, 9.65, 3.0, 2.5);

    // =========================================================================
    // 2. SEGMENTED INTERIOR PARTITIONS WITH DOORWAYS & STAIRWELL ARCHES
    // =========================================================================
    // A) Cloison fond rez-de-chaussee.001 (West Salon <-> Hearth Room, z = -3.0)
    addBox('Cloison fond Ouest G', -11.45, -8.6, 0.3, 4.8, -3.11, -2.89, wallMat);
    addBox('Cloison fond Ouest D', -7.0, -4.15, 0.3, 4.8, -3.11, -2.89, wallMat);
    addBox('Cloison fond Ouest Linteau', -8.6, -7.0, 3.05, 4.8, -3.11, -2.89, wallMat);
    addSingleDoor('door_salon_ouest', 'Porte du Salon Ouest', 'z', -7.8, 0.45, -3.0, 1.6, 2.6, 1.48);

    // B) Cloison fond rez-de-chaussee (East Dining <-> Library, z = -3.0)
    addBox('Cloison fond Est G', 4.15, 6.8, 0.3, 4.8, -3.11, -2.89, wallMat);
    addBox('Cloison fond Est D', 8.4, 11.45, 0.3, 4.8, -3.11, -2.89, wallMat);
    addBox('Cloison fond Est Linteau', 6.8, 8.4, 3.05, 4.8, -3.11, -2.89, wallMat);
    addSingleDoor('door_bibliotheque', 'Porte de la Bibliothèque', 'z', 7.6, 0.45, -3.0, 1.6, 2.6, 1.48);

    // C) Cloison interieure.001 (West Partition x = -4.2, stairwell arch z=1.5..4.8 open!)
    addBox('Cloison hall Ouest Sud', -4.31, -4.09, 0.3, 4.8, -5.0, 1.5, wallMat);
    addBox('Cloison hall Ouest Nord', -4.31, -4.09, 0.3, 4.8, -9.2, -6.6, wallMat);
    addBox('Cloison hall Ouest Linteau', -4.31, -4.09, 3.05, 4.8, -6.6, -5.0, wallMat);
    addSingleDoor('door_hall_ouest', 'Porte Salon — Grand Hall', 'x', -4.2, 0.45, -5.8, 1.6, 2.6, 1.48);

    // D) Cloison interieure (East Partition x = +4.2, stairwell arch z=1.5..4.8 open!)
    addBox('Cloison hall Est Sud', 4.09, 4.31, 0.3, 4.8, -5.0, 1.5, wallMat);
    addBox('Cloison hall Est Nord', 4.09, 4.31, 0.3, 4.8, -9.2, -6.6, wallMat);
    addBox('Cloison hall Est Linteau', 4.09, 4.31, 3.05, 4.8, -6.6, -5.0, wallMat);
    addSingleDoor('door_hall_est', 'Porte Bibliothèque — Grand Hall', 'x', 4.2, 0.45, -5.8, 1.6, 2.6, -1.48);

    // E) Cloison etage.001 (Upper West Bedroom x = -4.2, stair landing arch z=-1.6..1.2 open!)
    addBox('Cloison etage Ouest Avant', -4.31, -4.09, 5.3, 9.8, 1.2, 4.8, wallMat);
    addBox('Cloison etage Ouest Arche Linteau', -4.31, -4.09, 8.65, 9.8, -1.6, 1.2, wallMat);
    addBox('Cloison etage Ouest Centre', -4.31, -4.09, 5.3, 9.8, -4.6, -1.6, wallMat);
    addBox('Cloison etage Ouest Fond', -4.31, -4.09, 5.3, 9.8, -9.2, -6.2, wallMat);
    addBox('Cloison etage Ouest Linteau', -4.31, -4.09, 8.05, 9.8, -6.2, -4.6, wallMat);
    addSingleDoor('door_chambre_ouest', 'Porte Chambre Ouest', 'x', -4.2, 5.47, -5.4, 1.6, 2.58, 1.48);

    // F) Cloison etage (Upper East Bedroom x = +4.2, stair landing arch z=-1.6..1.2 open!)
    addBox('Cloison etage Est Avant', 4.09, 4.31, 5.3, 9.8, 1.2, 4.8, wallMat);
    addBox('Cloison etage Est Arche Linteau', 4.09, 4.31, 8.65, 9.8, -1.6, 1.2, wallMat);
    addBox('Cloison etage Est Centre', 4.09, 4.31, 5.3, 9.8, -4.6, -1.6, wallMat);
    addBox('Cloison etage Est Fond', 4.09, 4.31, 5.3, 9.8, -9.2, -6.2, wallMat);
    addBox('Cloison etage Est Linteau', 4.09, 4.31, 8.05, 9.8, -6.2, -4.6, wallMat);
    addSingleDoor('door_chambre_est', 'Porte Chambre Est', 'x', 4.2, 5.47, -5.4, 1.6, 2.58, -1.48);

    return { wallMeshes, walkableMeshes, doors, windows };
  }

  private makeFallbackStoneMat(
    name: string,
    textures: MaterialDetailTextures,
  ): PBRMaterial {
    const mat = new PBRMaterial(name, this.scene);
    mat.albedoColor = new Color3(0.45, 0.42, 0.38);
    mat.albedoTexture = textures.stoneAlbedo;
    mat.bumpTexture = textures.stoneBump;
    mat.bumpTexture.level = 0.72;
    mat.roughness = 0.86;
    mat.enableSpecularAntiAliasing = true;
    this.createdMaterials.push(mat);
    return mat;
  }

  public getPartitionRenderMeshes(): AbstractMesh[] {
    return this.partitionMeshes;
  }

  public getStaticRenderMeshes(): AbstractMesh[] {
    return this.createdMeshes.filter((m) => m !== this.skyDome && m.name !== 'Sol boueux humide exterieur');
  }

  public setMudReflectionTexture(tex: BaseTexture | null): void {
    if (this.mudMat) {
      this.mudMat.reflectionTexture = tex;
    }
    if (this.glassMat) {
      this.glassMat.reflectionTexture = tex;
    }
  }

  private buildNightSkyDome(textures: MaterialDetailTextures): void {
    const sky = MeshBuilder.CreateSphere(
      'nocturnal_sky_dome',
      { diameter: 260, segments: 24 },
      this.scene,
    );
    sky.parent = this.root;
    sky.isPickable = false;
    sky.applyFog = false;

    const skyMat = new StandardMaterial('nocturnal_sky_mat', this.scene);
    skyMat.diffuseColor = new Color3(0, 0, 0);
    skyMat.specularColor = new Color3(0, 0, 0);
    skyMat.emissiveTexture = textures.skyNightAlbedo;
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    sky.material = skyMat;
    sky.freezeWorldMatrix();

    this.skyDome = sky;
    this.createdMeshes.push(sky);
    this.createdMaterials.push(skyMat);
  }

  private buildMansardRoofAndChimneys(
    textures: MaterialDetailTextures,
    shadowGenerator: ShadowGenerator | null,
  ): void {
    const slateMat = new PBRMaterial('mansard_slate_pbr', this.scene);
    slateMat.albedoTexture = textures.slateAlbedo;
    slateMat.bumpTexture = textures.slateBump;
    slateMat.bumpTexture.level = 0.75;
    slateMat.roughness = 0.78;
    slateMat.metallic = 0.05;
    slateMat.environmentIntensity = 0.85;
    slateMat.enableSpecularAntiAliasing = true;

    const stoneMat = new PBRMaterial('roof_stone_pbr', this.scene);
    stoneMat.albedoColor = new Color3(0.32, 0.3, 0.27);
    stoneMat.albedoTexture = textures.stoneAlbedo;
    stoneMat.bumpTexture = textures.stoneBump;
    stoneMat.bumpTexture.level = 0.7;
    stoneMat.roughness = 0.9;
    stoneMat.metallic = 0;

    const warmGlowMat = new PBRMaterial('dormer_warm_glass', this.scene);
    warmGlowMat.albedoColor = new Color3(1.0, 0.72, 0.35);
    warmGlowMat.emissiveColor = new Color3(1.0, 0.56, 0.2);
    warmGlowMat.roughness = 0.2;

    const lowerRoof = MeshBuilder.CreateCylinder(
      'Toiture mansardee principale',
      {
        diameterTop: 22.5,
        diameterBottom: 34.8,
        height: 3.4,
        tessellation: 4,
      },
      this.scene,
    );
    lowerRoof.parent = this.root;
    lowerRoof.rotation.y = Math.PI / 4;
    lowerRoof.scaling.set(1.04, 1, 0.88);
    lowerRoof.position.set(0, 11.85, 0);
    lowerRoof.material = slateMat;
    lowerRoof.receiveShadows = true;

    const upperRoof = MeshBuilder.CreateCylinder(
      'Faitage toiture ardoise',
      {
        diameterTop: 4.5,
        diameterBottom: 22.5,
        height: 2.2,
        tessellation: 4,
      },
      this.scene,
    );
    upperRoof.parent = this.root;
    upperRoof.rotation.y = Math.PI / 4;
    upperRoof.scaling.set(1.04, 1, 0.88);
    upperRoof.position.set(0, 14.6, 0);
    upperRoof.material = slateMat;
    upperRoof.receiveShadows = true;

    const cupolaBase = MeshBuilder.CreateBox(
      'Clocheton central',
      { width: 3.6, height: 2.4, depth: 3.6 },
      this.scene,
    );
    cupolaBase.parent = this.root;
    cupolaBase.position.set(0, 15.2, 0);
    cupolaBase.material = stoneMat;

    const cupolaSpire = MeshBuilder.CreateCylinder(
      'Fleche clocheton',
      { diameterTop: 0.12, diameterBottom: 4.2, height: 3.8, tessellation: 4 },
      this.scene,
    );
    cupolaSpire.parent = this.root;
    cupolaSpire.rotation.y = Math.PI / 4;
    cupolaSpire.position.set(0, 18.2, 0);
    cupolaSpire.material = slateMat;

    const dormerPositions: Array<[number, number, number]> = [
      [-6.5, 11.7, 9.8],
      [0, 11.9, 9.9],
      [6.5, 11.7, 9.8],
      [-6.5, 11.7, -9.8],
      [6.5, 11.7, -9.8],
    ];
    dormerPositions.forEach(([x, y, z], idx) => {
      const box = MeshBuilder.CreateBox(
        `Lucarne toiture ${idx + 1}`,
        { width: 1.9, height: 2.1, depth: 2.2 },
        this.scene,
      );
      box.parent = this.root;
      box.position.set(x, y, z);
      box.material = stoneMat;

      const cap = MeshBuilder.CreateCylinder(
        `Chapeau lucarne ${idx + 1}`,
        { diameterTop: 0.1, diameterBottom: 2.6, height: 1.1, tessellation: 4 },
        this.scene,
      );
      cap.parent = this.root;
      cap.rotation.y = Math.PI / 4;
      cap.position.set(x, y + 1.45, z);
      cap.material = slateMat;

      if (idx === 0 || idx === 2) {
        const pane = MeshBuilder.CreateBox(
          `Vitre lucarne ${idx + 1}`,
          { width: 1.1, height: 1.25, depth: 0.1 },
          this.scene,
        );
        pane.parent = this.root;
        pane.position.set(x, y, z + (z > 0 ? 1.12 : -1.12));
        pane.material = warmGlowMat;
        this.createdMeshes.push(pane);
      }

      this.createdMeshes.push(box, cap);
    });

    const chimneyPositions: Array<[number, number, number]> = [
      [-7.7, 14.4, -5.8],
      [7.8, 14.2, -5.8],
      [-7.8, 13.8, 5.2],
    ];
    chimneyPositions.forEach(([x, y, z], idx) => {
      const stack = MeshBuilder.CreateBox(
        `Cheminee toiture ${idx + 1}`,
        { width: 1.45, height: 4.8, depth: 1.45 },
        this.scene,
      );
      stack.parent = this.root;
      stack.position.set(x, y, z);
      stack.material = stoneMat;

      const crown = MeshBuilder.CreateBox(
        `Couronne cheminee ${idx + 1}`,
        { width: 1.8, height: 0.35, depth: 1.8 },
        this.scene,
      );
      crown.parent = this.root;
      crown.position.set(x, y + 2.45, z);
      crown.material = stoneMat;

      this.createdMeshes.push(stack, crown);
      if (shadowGenerator) {
        shadowGenerator.addShadowCaster(stack, false);
      }
    });

    for (const m of [lowerRoof, upperRoof, cupolaBase, cupolaSpire]) {
      m.freezeWorldMatrix();
      this.createdMeshes.push(m);
      if (shadowGenerator) shadowGenerator.addShadowCaster(m, false);
    }

    this.createdMaterials.push(slateMat, stoneMat, warmGlowMat);
  }

  private buildWarmGlowingWindows(): void {
    const warmWindowMat = new PBRMaterial('exterior_warm_window_mat', this.scene);
    warmWindowMat.albedoColor = new Color3(1.0, 0.68, 0.3);
    warmWindowMat.emissiveColor = new Color3(0.95, 0.52, 0.16);
    warmWindowMat.roughness = 0.18;
    warmWindowMat.alpha = 0.88;

    const specs: Array<[number, number, number, number, number, boolean]> = [
      // Front outer wing warm windows
      [-9.5, 2.7, 9.88, 2.1, 2.5, true],
      [9.5, 2.7, 9.88, 2.1, 2.5, false],
      [9.5, 7.6, 9.88, 2.1, 2.4, true],
      // Side glowing windows
      [-11.78, 2.9, 6.0, 0.12, 2.3, false],
      [11.78, 7.6, 1.0, 0.12, 2.3, false],
    ];

    specs.forEach(([x, y, z, w, h, addPoint], idx) => {
      const pane = MeshBuilder.CreateBox(
        `Fenetre eclairee ${idx + 1}`,
        { width: w === 0.12 ? 0.12 : w, height: h, depth: w === 0.12 ? 1.8 : 0.12 },
        this.scene,
      );
      pane.parent = this.root;
      pane.position.set(x, y, z);
      pane.material = warmWindowMat;
      pane.isPickable = false;
      pane.freezeWorldMatrix();
      this.createdMeshes.push(pane);

      if (addPoint) {
        const pt = new PointLight(
          `win_warm_spill_${idx}`,
          new Vector3(x, y, z + 1.2),
          this.scene,
        );
        pt.diffuse = new Color3(1.0, 0.64, 0.28);
        pt.intensity = 6.5;
        pt.range = 10;
        this.exteriorWindowLights.push(pt);
      }
    });

    const porticoLantern = new PointLight(
      'portico_warm_lantern',
      new Vector3(0, 3.4, 10.6),
      this.scene,
    );
    porticoLantern.diffuse = new Color3(1.0, 0.66, 0.3);
    porticoLantern.intensity = 13;
    porticoLantern.range = 14;
    this.exteriorWindowLights.push(porticoLantern);

    this.createdMaterials.push(warmWindowMat);
  }

  private buildCeilingBeamsAndCobwebs(textures: MaterialDetailTextures): void {
    const beamMat = new PBRMaterial('ceiling_oak_beam_mat', this.scene);
    beamMat.albedoColor = new Color3(0.11, 0.075, 0.05);
    beamMat.albedoTexture = textures.woodAlbedo;
    beamMat.bumpTexture = textures.woodBump;
    beamMat.bumpTexture.level = 0.7;
    beamMat.roughness = 0.88;

    for (let z = -7.5; z <= 7.5; z += 3.75) {
      const beam = MeshBuilder.CreateBox(
        `Poutre plafond ${z}`,
        { width: 22.8, height: 0.42, depth: 0.45 },
        this.scene,
      );
      beam.parent = this.root;
      beam.position.set(0, 9.88, z);
      beam.material = beamMat;
      beam.isPickable = false;
      beam.freezeWorldMatrix();
      this.createdMeshes.push(beam);
    }

    const medallionMat = new PBRMaterial('ceiling_medallion_mat', this.scene);
    medallionMat.albedoColor = new Color3(0.46, 0.42, 0.36);
    medallionMat.albedoTexture = textures.stoneAlbedo;
    medallionMat.bumpTexture = textures.stoneBump;
    medallionMat.bumpTexture.level = 0.85;
    medallionMat.roughness = 0.88;
    this.createdMaterials.push(medallionMat);

    const outerRing = MeshBuilder.CreateTorus(
      'Medaillon plafond anneau',
      { diameter: 4.4, thickness: 0.26, tessellation: 32 },
      this.scene,
    );
    outerRing.parent = this.root;
    outerRing.position.set(0, 9.94, 0);
    outerRing.scaling.y = 0.45;
    outerRing.material = medallionMat;
    outerRing.isPickable = false;
    outerRing.freezeWorldMatrix();

    const innerRing = MeshBuilder.CreateTorus(
      'Medaillon plafond rosace',
      { diameter: 2.4, thickness: 0.18, tessellation: 28 },
      this.scene,
    );
    innerRing.parent = this.root;
    innerRing.position.set(0, 9.92, 0);
    innerRing.scaling.y = 0.45;
    innerRing.material = medallionMat;
    innerRing.isPickable = false;
    innerRing.freezeWorldMatrix();
    this.createdMeshes.push(outerRing, innerRing);

    const webMat = new StandardMaterial('cobweb_mat', this.scene);
    webMat.diffuseColor = new Color3(0.75, 0.78, 0.82);
    webMat.emissiveColor = new Color3(0.12, 0.14, 0.18);
    webMat.opacityTexture = textures.cobwebAlpha;
    webMat.backFaceCulling = false;
    webMat.alpha = 0.55;

    const webPlacements: Array<[number, number, number, number, number]> = [
      [-10.8, 4.4, 8.8, 0.35, 1.9],
      [10.8, 4.4, 8.8, -0.35, 1.9],
      [-10.8, 9.2, -8.8, 0.78, 2.2],
      [10.8, 9.2, -8.8, -0.78, 2.2],
      [-4.1, 4.5, -2.1, 0.4, 1.7],
      [4.1, 4.5, -2.1, -0.4, 1.7],
      [0, 9.1, 0, 0, 1.5],
    ];

    webPlacements.forEach(([x, y, z, rotY, size], idx) => {
      const web = MeshBuilder.CreatePlane(
        `Toile d'araignee ${idx + 1}`,
        { size },
        this.scene,
      );
      web.parent = this.root;
      web.position.set(x, y, z);
      web.rotation.y = rotY;
      web.material = webMat;
      web.isPickable = false;
      web.freezeWorldMatrix();
      this.createdMeshes.push(web);
    });

    this.createdMaterials.push(beamMat, webMat);
  }

  private buildOvergrownCourtyardAndFence(
    textures: MaterialDetailTextures,
    quality: ResolvedQuality,
    shadowGenerator: ShadowGenerator | null,
    colliders: AbstractMesh[],
  ): void {
    const mudMat = new PBRMaterial('courtyard_wet_mud_mat', this.scene);
    mudMat.albedoColor = new Color3(0.28, 0.32, 0.27);
    mudMat.albedoTexture = textures.mudAlbedo;
    mudMat.bumpTexture = textures.mudBump;
    mudMat.bumpTexture.level = 0.8;
    mudMat.roughness = 0.24;
    mudMat.metallic = 0.08;
    mudMat.environmentIntensity = 1.4;
    mudMat.enableSpecularAntiAliasing = true;
    this.mudMat = mudMat;

    const mudRing = MeshBuilder.CreateDisc(
      'Sol boueux humide exterieur',
      { radius: 95, tessellation: 48 },
      this.scene,
    );
    mudRing.parent = this.root;
    mudRing.rotation.x = Math.PI / 2;
    mudRing.position.y = -0.665;
    mudRing.material = mudMat;
    mudRing.receiveShadows = true;
    mudRing.isPickable = false;
    mudRing.freezeWorldMatrix();
    this.createdMeshes.push(mudRing);
    this.createdMaterials.push(mudMat);

    const pillarMat = new PBRMaterial('gate_pillar_stone', this.scene);
    pillarMat.albedoColor = new Color3(0.36, 0.34, 0.3);
    pillarMat.albedoTexture = textures.stoneAlbedo;
    pillarMat.bumpTexture = textures.stoneBump;
    pillarMat.roughness = 0.9;

    const ironMat = new PBRMaterial('gate_iron_mat', this.scene);
    ironMat.albedoColor = new Color3(0.08, 0.07, 0.06);
    ironMat.bumpTexture = textures.metalBump;
    ironMat.metallic = 0.72;
    ironMat.roughness = 0.48;
    ironMat.enableSpecularAntiAliasing = true;

    const lanternMat = new PBRMaterial('gate_lantern_glow', this.scene);
    lanternMat.albedoColor = new Color3(1.0, 0.72, 0.32);
    lanternMat.emissiveColor = new Color3(1.0, 0.58, 0.2);

    [-3.6, 3.6, -14, 14].forEach((px, idx) => {
      const pillar = MeshBuilder.CreateBox(
        `Pilier portail ${idx + 1}`,
        { width: 1.0, height: 3.1, depth: 1.0 },
        this.scene,
      );
      pillar.parent = this.root;
      pillar.position.set(px, 0.9, 24.5);
      pillar.material = pillarMat;
      pillar.receiveShadows = true;
      pillar.freezeWorldMatrix();
      this.createdMeshes.push(pillar);
      colliders.push(pillar);
      if (shadowGenerator) shadowGenerator.addShadowCaster(pillar, false);

      if (idx < 2) {
        const lantern = MeshBuilder.CreateBox(
          `Lanterne portail ${idx + 1}`,
          { width: 0.36, height: 0.52, depth: 0.36 },
          this.scene,
        );
        lantern.parent = this.root;
        lantern.position.set(px, 2.75, 24.5);
        lantern.material = lanternMat;
        lantern.isPickable = false;
        lantern.freezeWorldMatrix();
        this.createdMeshes.push(lantern);
      }
    });

    const fenceSegments: Array<[number, number]> = [
      [-8.8, 9.4],
      [8.8, 9.4],
    ];
    fenceSegments.forEach(([fx, width], idx) => {
      const railTop = MeshBuilder.CreateBox(
        `Grille fer forge ${idx + 1}`,
        { width, height: 2.1, depth: 0.14 },
        this.scene,
      );
      railTop.parent = this.root;
      railTop.position.set(fx, 0.45, 24.5);
      railTop.material = ironMat;
      railTop.freezeWorldMatrix();
      this.createdMeshes.push(railTop);
      colliders.push(railTop);
    });

    const grassCount = quality === 'high' ? 420 : quality === 'medium' ? 220 : 90;
    const blade = MeshBuilder.CreateBox(
      'Herbe haute envahissante',
      { width: 0.12, height: 0.72, depth: 0.04 },
      this.scene,
    );
    blade.parent = this.root;
    const grassMat = new PBRMaterial('tall_grass_pbr', this.scene);
    grassMat.albedoColor = new Color3(0.11, 0.18, 0.09);
    grassMat.roughness = 0.85;
    grassMat.metallic = 0;
    blade.material = grassMat;
    blade.isPickable = false;

    const matrices = new Float32Array(grassCount * 16);
    const seed = { v: 98173 };
    let placed = 0;
    while (placed < grassCount) {
      const gx = (seededRand(seed) - 0.5) * 48;
      const gz = (seededRand(seed) - 0.5) * 46;
      if (Math.abs(gx) < 12.2 && Math.abs(gz) < 10.2) continue;
      if (Math.abs(gx) < 2.2 && gz > 9.5 && gz < 25) continue;

      const scaleY = 0.65 + seededRand(seed) * 1.15;
      const rotY = seededRand(seed) * Math.PI * 2;
      const tiltX = (seededRand(seed) - 0.5) * 0.28;
      const finalM = Matrix.Compose(
        new Vector3(1, scaleY, 1),
        Quaternion.RotationYawPitchRoll(rotY, tiltX, 0),
        new Vector3(gx, -0.35 + scaleY * 0.25, gz),
      );
      finalM.copyToArray(matrices, placed * 16);
      placed++;
    }
    blade.thinInstanceSetBuffer('matrix', matrices, 16, true);
    this.createdMeshes.push(blade);
    this.createdMaterials.push(pillarMat, ironMat, lanternMat, grassMat);
  }

  private buildAtmosphericWeatherAndSmoke(
    textures: MaterialDetailTextures,
    quality: ResolvedQuality,
  ): void {
    const scale = quality === 'high' ? 1 : quality === 'medium' ? 0.55 : 0.25;

    const smoke = new ParticleSystem(
      'chimney_smoke',
      Math.round(80 * scale),
      this.scene,
    );
    smoke.particleTexture = textures.particleDot;
    smoke.emitter = new Vector3(-7.7, 17.0, -5.8);
    smoke.minEmitBox = new Vector3(-0.35, 0, -0.35);
    smoke.maxEmitBox = new Vector3(0.35, 0.2, 0.35);
    smoke.color1 = new Color4(0.35, 0.42, 0.55, 0.24);
    smoke.color2 = new Color4(0.25, 0.3, 0.4, 0.14);
    smoke.colorDead = new Color4(0.1, 0.15, 0.25, 0);
    smoke.minSize = 0.65;
    smoke.maxSize = 2.1;
    smoke.minLifeTime = 3.5;
    smoke.maxLifeTime = 6.5;
    smoke.emitRate = Math.round(12 * scale);
    smoke.direction1 = new Vector3(-0.4, 0.9, -0.3);
    smoke.direction2 = new Vector3(0.2, 1.5, 0.3);
    smoke.minEmitPower = 0.5;
    smoke.maxEmitPower = 1.1;
    smoke.start();
    this.createdParticles.push(smoke);

    if (quality !== 'low') {
      const rain = new ParticleSystem(
        'exterior_drizzle',
        Math.round(320 * scale),
        this.scene,
      );
      rain.particleTexture = textures.particleDot;
      rain.emitter = new Vector3(0, 18, 14);
      rain.minEmitBox = new Vector3(-24, 0, -14);
      rain.maxEmitBox = new Vector3(24, 2, 14);
      rain.color1 = new Color4(0.65, 0.78, 0.95, 0.22);
      rain.color2 = new Color4(0.55, 0.7, 0.9, 0.14);
      rain.colorDead = new Color4(0.4, 0.55, 0.75, 0);
      rain.minSize = 0.03;
      rain.maxSize = 0.06;
      rain.minLifeTime = 1.2;
      rain.maxLifeTime = 1.8;
      rain.emitRate = Math.round(140 * scale);
      rain.direction1 = new Vector3(-0.6, -12, -0.3);
      rain.direction2 = new Vector3(-0.3, -15, 0.2);
      rain.minEmitPower = 1.0;
      rain.maxEmitPower = 1.4;
      rain.blendMode = ParticleSystem.BLENDMODE_ADD;
      rain.start();
      this.rainParticles = rain;
      this.createdParticles.push(rain);
    }
  }

  public setSkyVisible(visible: boolean): void {
    if (this.skyDome) {
      this.skyDome.setEnabled(visible);
    }
  }

  public setDrizzleActive(active: boolean): void {
    if (!this.rainParticles) return;
    if (active && !this.rainParticles.isStarted()) {
      this.rainParticles.start();
    } else if (!active && this.rainParticles.isStarted()) {
      this.rainParticles.stop();
    }
  }

  private disposePartitions(): void {
    for (const m of this.partitionMeshes) {
      m.dispose();
    }
    this.partitionMeshes = [];
  }

  public dispose(): void {
    this.disposePartitions();

    for (const p of this.createdParticles) {
      p.dispose();
    }
    this.createdParticles = [];
    this.rainParticles = null;

    for (const l of this.exteriorWindowLights) {
      l.dispose();
    }
    this.exteriorWindowLights = [];

    for (const m of this.createdMeshes) {
      m.dispose();
    }
    this.createdMeshes = [];

    for (const mat of this.createdMaterials) {
      mat.dispose();
    }
    this.createdMaterials = [];
    this.mudMat = null;
    this.glassMat = null;

    this.root.dispose();
  }
}
