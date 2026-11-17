import { AbstractMesh, BoundingBox, Ray, Vector3 } from '@babylonjs/core';

interface ColliderEntry {
  mesh: AbstractMesh;
  min: Vector3;
  max: Vector3;
}

interface DynamicPortalGroup {
  id: string;
  meshes: AbstractMesh[];
  open: boolean;
}

export interface MoveResult {
  position: Vector3;
  grounded: boolean;
  onUpperFloor: boolean;
  insideManor: boolean;
}

const WALKABLE_PATTERN =
  /terrain|fondation|sol|chemin|marche|balcon|palier|terrasse|perron|seuil|marche_entree/i;

const IGNORE_COLLIDER_PATTERN =
  /brouillard|poussiere|herbe|eclat|planche|toile|plafond|toit|charpente|tuile|lustre|chandelier|shaft|flaque|tache|moisissure|fissure|lierre|feuille|fil de toile|tapis|livre|mousse|medaillon|poutre|porte_frame|fenetre_frame|lueur|lumiere|moulure|lambris|cadre|encadrement|montant|traverse/i;

// Pre-allocated math helpers (zero per-frame GC)
const _rayOrigin = new Vector3();
const _rayDir = new Vector3();
const _downDir = new Vector3(0, -1, 0);
const _ray = new Ray(_rayOrigin, _downDir, 14);
const _outPos = new Vector3();
const _stepDir = new Vector3();

function boxesOverlap(
  aMinX: number,
  aMinY: number,
  aMinZ: number,
  aMaxX: number,
  aMaxY: number,
  aMaxZ: number,
  bMin: Vector3,
  bMax: Vector3,
): boolean {
  return (
    aMinX <= bMax.x &&
    aMaxX >= bMin.x &&
    aMinY <= bMax.y &&
    aMaxY >= bMin.y &&
    aMinZ <= bMax.z &&
    aMaxZ >= bMin.z
  );
}

export class CollisionWorld {
  private walkableEntries: ColliderEntry[] = [];
  private solidEntries: ColliderEntry[] = [];
  private legacyDoorEntries: ColliderEntry[] = [];
  private portalGroups = new Map<string, DynamicPortalGroup>();
  private portalMeshSet = new Set<AbstractMesh>();
  private doorsOpen = false;
  private overlapMeshes: AbstractMesh[] = [];

  private readonly playerRadius = 0.42;
  private readonly stepUpHeight = 0.95;
  private readonly groundYFallback = -0.68;
  private readonly worldBounds = {
    minX: -27.5,
    maxX: 27.5,
    minZ: -26.0,
    maxZ: 26.5,
  };

  public buildFromMeshes(
    meshes: AbstractMesh[],
    outerGround?: AbstractMesh,
    explicitPortalMeshes?: Set<AbstractMesh>,
  ): void {
    this.walkableEntries = [];
    this.solidEntries = [];
    this.legacyDoorEntries = [];
    this.portalMeshSet = explicitPortalMeshes ?? new Set<AbstractMesh>();

    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      if (!mesh || mesh.getTotalVertices() === 0) continue;
      if (this.portalMeshSet.has(mesh)) continue;

      mesh.computeWorldMatrix(true);
      const bi = mesh.getBoundingInfo();
      const bbox: BoundingBox = bi.boundingBox;
      const min = bbox.minimumWorld.clone();
      const max = bbox.maximumWorld.clone();
      const name = mesh.name || '';

      if (WALKABLE_PATTERN.test(name)) {
        this.walkableEntries.push({ mesh, min, max });
        continue;
      }

      if (IGNORE_COLLIDER_PATTERN.test(name)) {
        continue;
      }

      this.solidEntries.push({ mesh, min, max });
    }

    if (outerGround) {
      outerGround.computeWorldMatrix(true);
      const bi = outerGround.getBoundingInfo();
      this.walkableEntries.push({
        mesh: outerGround,
        min: bi.boundingBox.minimumWorld.clone(),
        max: bi.boundingBox.maximumWorld.clone(),
      });
    }
  }

  public clearPortalGroups(): void {
    this.portalGroups.clear();
  }

  public registerPortalGroup(
    id: string,
    meshes: AbstractMesh[],
    open: boolean,
  ): void {
    const valid = meshes.filter((m) => m && m.getTotalVertices() > 0);
    if (valid.length === 0) return;
    this.portalGroups.set(id, { id, meshes: valid, open });
  }

  public setPortalOpen(id: string, open: boolean): void {
    const grp = this.portalGroups.get(id);
    if (grp) {
      grp.open = open;
    }
  }

  public setDoorsOpen(open: boolean): void {
    this.doorsOpen = open;
    this.setPortalOpen('double_door', open);
  }

  public sampleGroundHeight(x: number, yFeet: number, z: number): number | null {
    this.overlapMeshes.length = 0;
    const probeTop = yFeet + this.stepUpHeight;

    for (let i = 0; i < this.walkableEntries.length; i++) {
      const entry = this.walkableEntries[i];
      if (
        x >= entry.min.x - 0.12 &&
        x <= entry.max.x + 0.12 &&
        z >= entry.min.z - 0.12 &&
        z <= entry.max.z + 0.12 &&
        entry.min.y <= probeTop + 0.12
      ) {
        this.overlapMeshes.push(entry.mesh);
      }
    }

    if (this.overlapMeshes.length === 0) return null;

    _rayOrigin.set(x, probeTop, z);
    _ray.origin.copyFrom(_rayOrigin);
    _ray.direction.copyFrom(_downDir);
    _ray.length = 14;

    let bestY: number | null = null;
    for (let i = 0; i < this.overlapMeshes.length; i++) {
      const hit = _ray.intersectsMesh(this.overlapMeshes[i], false);
      if (hit.hit && hit.pickedPoint) {
        const hy = hit.pickedPoint.y;
        if (hy <= probeTop + 0.05 && (bestY === null || hy > bestY)) {
          bestY = hy;
        }
      }
    }
    return bestY;
  }

  private collectOverlappingSolidMeshes(
    x: number,
    yFeet: number,
    z: number,
  ): void {
    const r = this.playerRadius;
    const minX = x - r;
    const minY = yFeet + 0.18;
    const minZ = z - r;
    const maxX = x + r;
    const maxY = yFeet + 1.72;
    const maxZ = z + r;

    this.overlapMeshes.length = 0;

    for (let i = 0; i < this.solidEntries.length; i++) {
      const entry = this.solidEntries[i];
      if (
        boxesOverlap(minX, minY, minZ, maxX, maxY, maxZ, entry.min, entry.max)
      ) {
        this.overlapMeshes.push(entry.mesh);
      }
    }

    if (!this.doorsOpen) {
      for (let i = 0; i < this.legacyDoorEntries.length; i++) {
        const entry = this.legacyDoorEntries[i];
        if (
          boxesOverlap(minX, minY, minZ, maxX, maxY, maxZ, entry.min, entry.max)
        ) {
          this.overlapMeshes.push(entry.mesh);
        }
      }
    }

    // Check dynamic doors & windows using their live world-space bounding boxes
    for (const grp of this.portalGroups.values()) {
      for (let i = 0; i < grp.meshes.length; i++) {
        const mesh = grp.meshes[i];
        mesh.computeWorldMatrix(true);
        const bb = mesh.getBoundingInfo().boundingBox;
        if (
          boxesOverlap(
            minX,
            minY,
            minZ,
            maxX,
            maxY,
            maxZ,
            bb.minimumWorld,
            bb.maximumWorld,
          )
        ) {
          this.overlapMeshes.push(mesh);
        }
      }
    }
  }

  private hasSolidCollisionAt(
    x: number,
    yFeet: number,
    z: number,
    prevX?: number,
    prevZ?: number,
  ): boolean {
    this.collectOverlappingSolidMeshes(x, yFeet, z);
    if (this.overlapMeshes.length === 0) return false;

    const r = this.playerRadius;
    // 5 vertical probe slices catch low fountain rims, table tops, sofas, chairs, beds, walls & railings
    const heights = [
      yFeet + 0.24,
      yFeet + 0.54,
      yFeet + 0.86,
      yFeet + 1.22,
      yFeet + 1.56,
    ];
    const angles = 12;
    _ray.length = r;

    for (let h = 0; h < heights.length; h++) {
      _rayOrigin.set(x, heights[h], z);
      _ray.origin.copyFrom(_rayOrigin);

      for (let a = 0; a < angles; a++) {
        const theta = (a / angles) * Math.PI * 2;
        _rayDir.set(Math.cos(theta), 0, Math.sin(theta));
        _ray.direction.copyFrom(_rayDir);

        for (let m = 0; m < this.overlapMeshes.length; m++) {
          const hit = _ray.intersectsMesh(this.overlapMeshes[m], false);
          if (hit.hit && hit.distance < r) {
            return true;
          }
        }
      }
    }

    // Swept segment check from previous center to new center prevents thin-wall tunneling
    if (prevX !== undefined && prevZ !== undefined) {
      const dx = x - prevX;
      const dz = z - prevZ;
      const segLen = Math.hypot(dx, dz);
      if (segLen > 1e-4) {
        _stepDir.set(dx / segLen, 0, dz / segLen);
        _ray.direction.copyFrom(_stepDir);
        _ray.length = segLen + r;
        for (let h = 1; h <= 3; h++) {
          _ray.origin.set(prevX, heights[h], prevZ);
          for (let m = 0; m < this.overlapMeshes.length; m++) {
            const hit = _ray.intersectsMesh(this.overlapMeshes[m], false);
            if (hit.hit && hit.distance <= segLen + r) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  public resolveMovement(
    currentFeet: Vector3,
    deltaX: number,
    deltaZ: number,
    verticalVel: { value: number },
    jumpRequested: boolean,
    dt: number,
  ): MoveResult {
    let curX = currentFeet.x;
    let curZ = currentFeet.z;

    const totalDist = Math.hypot(deltaX, deltaZ);
    if (totalDist > 1e-5) {
      // Sub-step horizontal movement in increments <= 0.10m so walls/balusters/doors are never tunneled
      const steps = Math.max(1, Math.ceil(totalDist / 0.1));
      const stepX = deltaX / steps;
      const stepZ = deltaZ / steps;

      for (let s = 0; s < steps; s++) {
        const targetX = Math.max(
          this.worldBounds.minX,
          Math.min(this.worldBounds.maxX, curX + stepX),
        );
        const targetZ = Math.max(
          this.worldBounds.minZ,
          Math.min(this.worldBounds.maxZ, curZ + stepZ),
        );

        if (!this.hasSolidCollisionAt(targetX, currentFeet.y, targetZ, curX, curZ)) {
          curX = targetX;
          curZ = targetZ;
        } else {
          // Wall-sliding along X then Z
          if (!this.hasSolidCollisionAt(targetX, currentFeet.y, curZ, curX, curZ)) {
            curX = targetX;
          }
          if (!this.hasSolidCollisionAt(curX, currentFeet.y, targetZ, curX, curZ)) {
            curZ = targetZ;
          }
        }
      }
    }

    const sampledGround = this.sampleGroundHeight(curX, currentFeet.y, curZ);
    const groundY =
      sampledGround !== null ? sampledGround : this.groundYFallback;

    let nextY = currentFeet.y;
    let grounded = false;

    if (jumpRequested && currentFeet.y <= groundY + 0.08) {
      verticalVel.value = 6.2;
    }

    if (verticalVel.value > 0 || nextY > groundY + 0.06) {
      verticalVel.value -= 18.5 * dt;
      nextY += verticalVel.value * dt;
      if (nextY <= groundY) {
        nextY = groundY;
        verticalVel.value = 0;
        grounded = true;
      }
    } else {
      if (groundY > nextY) {
        const t = 1 - Math.exp(-22 * dt);
        nextY = nextY + (groundY - nextY) * t;
        if (Math.abs(nextY - groundY) < 0.01) nextY = groundY;
      } else {
        nextY = groundY;
      }
      verticalVel.value = 0;
      grounded = true;
    }

    _outPos.set(curX, nextY, curZ);

    const insideManor =
      Math.abs(curX) < 11.45 && Math.abs(curZ) < 9.55 && nextY > 0.05;
    const onUpperFloor = insideManor && nextY >= 4.2;

    return {
      position: _outPos.clone(),
      grounded,
      onUpperFloor,
      insideManor,
    };
  }
}
