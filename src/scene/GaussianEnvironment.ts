import { GaussianSplattingMesh, Scene } from '@babylonjs/core';
import '@babylonjs/loaders/SPLAT';
import { ResolvedQuality } from './presets';

/**
 * Generates an authentic Antimatter15 binary `.splat` ArrayBuffer (32 bytes/splat)
 * representing a dense nocturnal pine/cypress forest, overgrown shrubs around
 * the wrought-iron perimeter fence, and layered low-lying mist banks.
 */
function buildAtmosphericForestSplatBuffer(splatCount: number): ArrayBuffer {
  const stride = 32;
  const buffer = new ArrayBuffer(splatCount * stride);
  const view = new DataView(buffer);

  let seed = 42197;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < splatCount; i++) {
    const offset = i * stride;
    const angle = rand() * Math.PI * 2;
    const kind = rand();

    let x = 0;
    let y = 0;
    let z = 0;
    let sx = 1;
    let sy = 1;
    let sz = 1;
    let r = 24;
    let g = 34;
    let b = 32;
    let a = 180;

    if (kind < 0.54) {
      // Dense nocturnal pine & ancient oak canopy ring (26m..74m)
      const radius = 26 + Math.pow(rand(), 0.8) * 48;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      // Leave clear entry corridor directly in front of the iron gate (+Z)
      if (z > 20 && Math.abs(x) < 4.8) {
        x += x >= 0 ? 5.2 : -5.2;
      }
      const canopyHeight = 1.2 + rand() * 14.5;
      y = -0.65 + canopyHeight;
      sx = 1.5 + rand() * 2.5;
      sy = 2.0 + rand() * 3.6;
      sz = 1.5 + rand() * 2.5;

      const moonRim = canopyHeight > 8 ? 1.25 : 0.72;
      r = Math.min(255, Math.round((14 + rand() * 14) * moonRim));
      g = Math.min(255, Math.round((26 + rand() * 18) * moonRim));
      b = Math.min(255, Math.round((36 + rand() * 24) * moonRim));
      a = Math.round(145 + rand() * 90);
    } else if (kind < 0.8) {
      // Overgrown wild shrubs & ivy mounds along fence and lawn edges
      const radius = 20 + rand() * 15;
      const rawX = Math.cos(angle) * radius;
      const rawZ = Math.sin(angle) * radius;
      if (rawZ > 15 && Math.abs(rawX) < 5.0) {
        x = rawX + (rawX >= 0 ? 5.8 : -5.8);
      } else {
        x = rawX;
      }
      z = rawZ;
      y = -0.45 + rand() * 1.9;
      sx = 1.0 + rand() * 1.6;
      sy = 0.65 + rand() * 1.1;
      sz = 1.0 + rand() * 1.6;

      r = Math.round(18 + rand() * 16);
      g = Math.round(36 + rand() * 22);
      b = Math.round(28 + rand() * 16);
      a = Math.round(150 + rand() * 85);
    } else {
      // Low-lying bluish-silver nocturnal ground mist banks
      const radius = 15 + rand() * 44;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      y = -0.15 + rand() * 2.4;
      sx = 3.2 + rand() * 4.2;
      sy = 0.55 + rand() * 0.9;
      sz = 3.2 + rand() * 4.2;

      r = Math.round(95 + rand() * 32);
      g = Math.round(122 + rand() * 34);
      b = Math.round(168 + rand() * 42);
      a = Math.round(28 + rand() * 34);
    }

    view.setFloat32(offset + 0, x, true);
    view.setFloat32(offset + 4, y, true);
    view.setFloat32(offset + 8, z, true);

    view.setFloat32(offset + 12, sx, true);
    view.setFloat32(offset + 16, sy, true);
    view.setFloat32(offset + 20, sz, true);

    view.setUint8(offset + 24, r);
    view.setUint8(offset + 25, g);
    view.setUint8(offset + 26, b);
    view.setUint8(offset + 27, a);

    view.setUint8(offset + 28, 255);
    view.setUint8(offset + 29, 128);
    view.setUint8(offset + 30, 128);
    view.setUint8(offset + 31, 128);
  }

  return buffer;
}

export class GaussianEnvironment {
  private scene: Scene;
  private splatMesh: GaussianSplattingMesh | null = null;
  private splatCount = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  public async initialize(quality: ResolvedQuality): Promise<number> {
    this.dispose();

    const targetCount =
      quality === 'high' ? 6500 : quality === 'medium' ? 3500 : 1400;
    const buffer = buildAtmosphericForestSplatBuffer(targetCount);

    const mesh = new GaussianSplattingMesh(
      'env_gaussian_forest',
      null,
      this.scene,
      false,
    );
    mesh.isPickable = false;
    await mesh.loadDataAsync(buffer);
    this.splatMesh = mesh;
    this.splatCount = targetCount;
    return targetCount;
  }

  public async loadCustomSplatFile(file: File): Promise<number> {
    const url = URL.createObjectURL(file);
    try {
      this.dispose();
      const mesh = new GaussianSplattingMesh(
        `custom_splat_${file.name}`,
        null,
        this.scene,
        false,
      );
      mesh.isPickable = false;
      await mesh.loadFileAsync(url, this.scene);
      this.splatMesh = mesh;
      this.splatCount = Math.max(1, Math.floor(file.size / 32));
      return this.splatCount;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  public setVisible(visible: boolean): void {
    if (this.splatMesh) {
      this.splatMesh.setEnabled(visible);
    }
  }

  public getSplatCount(): number {
    return this.splatCount;
  }

  public dispose(): void {
    if (this.splatMesh) {
      this.splatMesh.dispose();
      this.splatMesh = null;
      this.splatCount = 0;
    }
  }
}
