import {
  Constants,
  DynamicTexture,
  RawCubeTexture,
  Scene,
  Texture,
} from '@babylonjs/core';
import { ResolvedQuality } from './presets';

export interface MaterialDetailTextures {
  stoneAlbedo: DynamicTexture;
  stoneBump: DynamicTexture;
  woodAlbedo: DynamicTexture;
  woodBump: DynamicTexture;
  marbleAlbedo: DynamicTexture;
  marbleBump: DynamicTexture;
  marbleRoughness: DynamicTexture;
  metalBump: DynamicTexture;
  slateAlbedo: DynamicTexture;
  slateBump: DynamicTexture;
  mudAlbedo: DynamicTexture;
  mudBump: DynamicTexture;
  cobwebAlpha: DynamicTexture;
  skyNightAlbedo: DynamicTexture;
  particleDot: DynamicTexture;
  lightShaftTexture: DynamicTexture;
}

function hash2D(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy);
  const b = hash2D(ix + 1, iy);
  const c = hash2D(ix, iy + 1);
  const d = hash2D(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * smoothNoise(x * freq, y * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return value;
}

function buildNormalMapFromHeights(
  ctx: CanvasRenderingContext2D,
  size: number,
  heights: Float32Array,
  strength: number,
): void {
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const hL = heights[y * size + xm];
      const hR = heights[y * size + xp];
      const hU = heights[ym * size + x];
      const hD = heights[yp * size + x];

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function makeTiledTexture(
  scene: Scene,
  name: string,
  size: number,
  scaleU: number,
  scaleV: number,
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.uScale = scaleU;
  tex.vScale = scaleV;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

export function createProceduralDetailTextures(
  scene: Scene,
  quality: ResolvedQuality,
): MaterialDetailTextures {
  const res = quality === 'high' ? 512 : quality === 'medium' ? 256 : 128;

  // 1. Weathered Stone / Peeling Plaster + Damp Mold Albedo & Normal
  const stoneAlbedo = makeTiledTexture(scene, 'proc_stone_albedo', res, 4, 4);
  const stoneBump = makeTiledTexture(scene, 'proc_stone_bump', res, 4, 4);
  {
    const aCtx = stoneAlbedo.getContext() as CanvasRenderingContext2D;
    const bCtx = stoneBump.getContext() as CanvasRenderingContext2D;
    const aImg = aCtx.createImageData(res, res);
    const heights = new Float32Array(res * res);

    for (let y = 0; y < res; y++) {
      const v = y / res;
      for (let x = 0; x < res; x++) {
        const u = x / res;
        const base = fbm(u * 8, v * 8, 4);
        const fine = fbm(u * 26, v * 26, 3);
        const dampStreak = fbm(u * 3.5, v * 1.4, 3);
        const crackNoise = Math.abs(fbm(u * 11, v * 11, 3) - 0.5);
        const crack = crackNoise < 0.022 ? 1 : 0;
        const peel = base < 0.34 ? 1 : 0;
        const mold = dampStreak > 0.62 && fine > 0.45 ? (dampStreak - 0.62) * 2.2 : 0;

        let h = base * 0.65 + fine * 0.35;
        if (peel) h -= 0.28;
        if (crack) h -= 0.42;
        heights[y * res + x] = h;

        let lum = 200 + (base - 0.5) * 70 + (fine - 0.5) * 35;
        if (peel) lum -= 42;
        if (crack) lum -= 75;

        const r = Math.max(30, Math.min(255, lum - mold * 78));
        const g = Math.max(38, Math.min(255, lum - mold * 42));
        const b = Math.max(30, Math.min(255, lum - mold * 85));

        const idx = (y * res + x) * 4;
        aImg.data[idx] = Math.round(r);
        aImg.data[idx + 1] = Math.round(g);
        aImg.data[idx + 2] = Math.round(b);
        aImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    stoneAlbedo.update();
    buildNormalMapFromHeights(bCtx, res, heights, 2.8);
    stoneBump.update();
  }

  // 2. Aged Oak / Worn Parquet Albedo & Normal
  const woodAlbedo = makeTiledTexture(scene, 'proc_wood_albedo', res, 3, 3);
  const woodBump = makeTiledTexture(scene, 'proc_wood_bump', res, 3, 3);
  {
    const aCtx = woodAlbedo.getContext() as CanvasRenderingContext2D;
    const bCtx = woodBump.getContext() as CanvasRenderingContext2D;
    const aImg = aCtx.createImageData(res, res);
    const heights = new Float32Array(res * res);

    for (let y = 0; y < res; y++) {
      const v = y / res;
      for (let x = 0; x < res; x++) {
        const u = x / res;
        const plankIdx = Math.floor(u * 5);
        const plankShift = hash2D(plankIdx, 7.1) * 10;
        const seamX = Math.abs((u * 5) % 1 - 0.5) > 0.482;
        const seamY = Math.abs(((v + plankShift * 0.13) * 2.5) % 1 - 0.5) > 0.488;
        const grain = Math.sin(
          (u * 28 + fbm(u * 4, (v + plankShift) * 14, 3) * 3.2) * Math.PI,
        );
        const grime = fbm(u * 6, v * 6, 3);

        let h = grain * 0.25 + fbm(u * 20, v * 8, 2) * 0.2;
        if (seamX || seamY) h -= 0.55;
        heights[y * res + x] = h;

        let tone = 195 + grain * 30 - (grime > 0.55 ? (grime - 0.55) * 130 : 0);
        if (seamX || seamY) tone -= 95;
        const idx = (y * res + x) * 4;
        aImg.data[idx] = Math.max(25, Math.min(255, Math.round(tone * 1.05)));
        aImg.data[idx + 1] = Math.max(20, Math.min(255, Math.round(tone * 0.92)));
        aImg.data[idx + 2] = Math.max(15, Math.min(255, Math.round(tone * 0.8)));
        aImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    woodAlbedo.update();
    buildNormalMapFromHeights(bCtx, res, heights, 2.3);
    woodBump.update();
  }

  // 3. Cracked Damp Marble Albedo, Normal & Roughness-in-Green (metallicTexture)
  const marbleAlbedo = makeTiledTexture(scene, 'proc_marble_albedo', res, 5, 5);
  const marbleBump = makeTiledTexture(scene, 'proc_marble_bump', res, 5, 5);
  const marbleRoughness = makeTiledTexture(scene, 'proc_marble_rough', res, 5, 5);
  {
    const aCtx = marbleAlbedo.getContext() as CanvasRenderingContext2D;
    const bCtx = marbleBump.getContext() as CanvasRenderingContext2D;
    const rCtx = marbleRoughness.getContext() as CanvasRenderingContext2D;
    const aImg = aCtx.createImageData(res, res);
    const rImg = rCtx.createImageData(res, res);
    const heights = new Float32Array(res * res);

    for (let y = 0; y < res; y++) {
      const v = y / res;
      for (let x = 0; x < res; x++) {
        const u = x / res;
        const tileU = Math.floor(u * 3);
        const tileV = Math.floor(v * 3);
        const checker = (tileU + tileV) % 2 === 0;
        const seam =
          Math.abs((u * 3) % 1 - 0.5) > 0.486 ||
          Math.abs((v * 3) % 1 - 0.5) > 0.486;

        const veinField = fbm(u * 5.5 + tileU * 1.7, v * 5.5 + tileV * 2.3, 4);
        const vein = Math.abs(veinField - 0.5);
        const crack = vein < 0.022;
        const wetPatch = fbm(u * 2.2, v * 2.2, 3);
        const isWet = wetPatch > 0.54;

        let h = fbm(u * 14, v * 14, 2) * 0.08;
        if (seam) h -= 0.48;
        if (crack) h -= 0.36;
        heights[y * res + x] = h;

        let baseLum = checker ? 220 : 145;
        baseLum += (veinField - 0.5) * 45;
        if (vein < 0.06) baseLum -= 35;
        if (seam || crack) baseLum -= 88;
        if (isWet) baseLum *= 0.78;

        const idx = (y * res + x) * 4;
        aImg.data[idx] = Math.max(22, Math.min(255, Math.round(baseLum)));
        aImg.data[idx + 1] = Math.max(24, Math.min(255, Math.round(baseLum * 0.99)));
        aImg.data[idx + 2] = Math.max(26, Math.min(255, Math.round(baseLum * 0.96)));
        aImg.data[idx + 3] = 255;

        // Babylon metallicTexture: G channel = roughness (low = wet glossy mirror, high = dusty)
        const rough = isWet ? 38 : seam || crack ? 225 : 155;
        rImg.data[idx] = 0; // metallic 0
        rImg.data[idx + 1] = rough;
        rImg.data[idx + 2] = 0;
        rImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    marbleAlbedo.update();
    marbleRoughness.update();
    buildNormalMapFromHeights(bCtx, res, heights, 2.5);
    marbleBump.update();
  }

  // 4. Rusted Wrought Iron / Tarnished Brass Bump
  const metalBump = makeTiledTexture(scene, 'proc_metal_bump', res, 4, 4);
  {
    const bCtx = metalBump.getContext() as CanvasRenderingContext2D;
    const heights = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        heights[y * res + x] = fbm((x / res) * 18, (y / res) * 18, 3) * 0.7;
      }
    }
    buildNormalMapFromHeights(bCtx, res, heights, 1.7);
    metalBump.update();
  }

  // 5. Slate Roof Shingles Albedo & Normal
  const slateAlbedo = makeTiledTexture(scene, 'proc_slate_albedo', res, 6, 4);
  const slateBump = makeTiledTexture(scene, 'proc_slate_bump', res, 6, 4);
  {
    const aCtx = slateAlbedo.getContext() as CanvasRenderingContext2D;
    const bCtx = slateBump.getContext() as CanvasRenderingContext2D;
    const aImg = aCtx.createImageData(res, res);
    const heights = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      const v = y / res;
      const row = Math.floor(v * 8);
      const rowPhase = (v * 8) % 1;
      for (let x = 0; x < res; x++) {
        const u = x / res;
        const shift = (row % 2) * 0.5;
        const col = Math.floor(u * 6 + shift);
        const colPhase = (u * 6 + shift) % 1;
        const seam = rowPhase > 0.92 || colPhase > 0.94;
        const tileJitter = hash2D(col, row) * 26;
        const moss = fbm(u * 7, v * 7, 3) > 0.65 ? 1 : 0;

        heights[y * res + x] =
          (1 - rowPhase * 0.4) + fbm(u * 20, v * 20, 2) * 0.15 - (seam ? 0.5 : 0);

        const lum = 44 + tileJitter - (seam ? 22 : 0);
        const idx = (y * res + x) * 4;
        aImg.data[idx] = Math.round(lum * 0.85);
        aImg.data[idx + 1] = Math.round(lum * 0.95 + moss * 22);
        aImg.data[idx + 2] = Math.round(lum * 1.15);
        aImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    slateAlbedo.update();
    buildNormalMapFromHeights(bCtx, res, heights, 2.6);
    slateBump.update();
  }

  // 6. Wet Muddy Soil & Moss Albedo & Normal
  const mudAlbedo = makeTiledTexture(scene, 'proc_mud_albedo', res, 14, 14);
  const mudBump = makeTiledTexture(scene, 'proc_mud_bump', res, 14, 14);
  {
    const aCtx = mudAlbedo.getContext() as CanvasRenderingContext2D;
    const bCtx = mudBump.getContext() as CanvasRenderingContext2D;
    const aImg = aCtx.createImageData(res, res);
    const heights = new Float32Array(res * res);
    for (let y = 0; y < res; y++) {
      const v = y / res;
      for (let x = 0; x < res; x++) {
        const u = x / res;
        const n = fbm(u * 6, v * 6, 4);
        const moss = fbm(u * 10 + 4.1, v * 10 + 1.3, 3);
        const puddle = n < 0.38;
        heights[y * res + x] = puddle ? 0.2 : n * 0.85;

        const idx = (y * res + x) * 4;
        if (puddle) {
          aImg.data[idx] = 20;
          aImg.data[idx + 1] = 25;
          aImg.data[idx + 2] = 30;
        } else {
          const grassMix = Math.max(0, (moss - 0.45) * 1.8);
          aImg.data[idx] = Math.round(34 + n * 24 - grassMix * 10);
          aImg.data[idx + 1] = Math.round(36 + n * 22 + grassMix * 28);
          aImg.data[idx + 2] = Math.round(28 + n * 16);
        }
        aImg.data[idx + 3] = 255;
      }
    }
    aCtx.putImageData(aImg, 0, 0);
    mudAlbedo.update();
    buildNormalMapFromHeights(bCtx, res, heights, 2.4);
    mudBump.update();
  }

  // 7. Delicate Cobweb Texture (Alpha)
  const cobwebAlpha = new DynamicTexture(
    'proc_cobweb',
    { width: 256, height: 256 },
    scene,
    true,
  );
  {
    const ctx = cobwebAlpha.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(220, 228, 238, 0.72)';
    ctx.lineWidth = 1.2;

    // Anchor at top-left corner (0,0) for realistic corner cobwebs
    const spokes = 11;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * (Math.PI * 0.52);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 250, Math.sin(a) * 250);
      ctx.stroke();
    }
    for (let r = 24; r < 245; r += 22) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * (Math.PI * 0.52);
        const sag = Math.sin(i * 1.1) * 3 + 4;
        const px = Math.cos(a) * (r + sag);
        const py = Math.sin(a) * (r + sag);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    cobwebAlpha.hasAlpha = true;
    cobwebAlpha.update();
  }

  // 8. Deep Blue Nocturnal Sky Dome with Stars & Moon
  const skyNightAlbedo = new DynamicTexture(
    'proc_sky_night',
    { width: 1024, height: 512 },
    scene,
    true,
  );
  {
    const ctx = skyNightAlbedo.getContext() as CanvasRenderingContext2D;
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#040814');
    grad.addColorStop(0.38, '#0b1630');
    grad.addColorStop(0.65, '#132445');
    grad.addColorStop(1, '#0c1322');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Subtle nocturnal clouds
    for (let i = 0; i < 65; i++) {
      const cx = hash2D(i, 3.1) * 1024;
      const cy = 60 + hash2D(i, 9.7) * 210;
      const rx = 50 + hash2D(i, 5.2) * 130;
      const ry = 14 + hash2D(i, 2.4) * 26;
      const cGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rx);
      cGrad.addColorStop(0, 'rgba(38, 62, 104, 0.22)');
      cGrad.addColorStop(1, 'rgba(12, 22, 44, 0)');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Crisp stars in upper hemisphere
    for (let i = 0; i < 240; i++) {
      const sx = hash2D(i, 12.3) * 1024;
      const sy = hash2D(i, 19.8) * 240;
      const bright = 0.35 + hash2D(i, 4.4) * 0.65;
      const r = hash2D(i, 8.8) > 0.88 ? 1.5 : 0.9;
      ctx.fillStyle = `rgba(215, 230, 255, ${bright.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Glowing Full Moon
    const mx = 740;
    const my = 128;
    const halo = ctx.createRadialGradient(mx, my, 12, mx, my, 92);
    halo.addColorStop(0, 'rgba(225, 238, 255, 0.95)');
    halo.addColorStop(0.22, 'rgba(170, 202, 255, 0.45)');
    halo.addColorStop(1, 'rgba(20, 38, 74, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, 92, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e8f1ff';
    ctx.beginPath();
    ctx.arc(mx, my, 18, 0, Math.PI * 2);
    ctx.fill();

    skyNightAlbedo.update();
  }

  // 9. Soft Radial Particle Texture
  const particleDot = new DynamicTexture(
    'proc_particle_dot',
    { width: 64, height: 64 },
    scene,
    true,
  );
  {
    const pCtx = particleDot.getContext() as CanvasRenderingContext2D;
    const grad = pCtx.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 64, 64);
    particleDot.hasAlpha = true;
    particleDot.update();
  }

  // 10. Volumetric Light Shaft Gradient
  const lightShaftTexture = new DynamicTexture(
    'proc_light_shaft',
    { width: 128, height: 256 },
    scene,
    true,
  );
  {
    const sCtx = lightShaftTexture.getContext() as CanvasRenderingContext2D;
    const sGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    sGrad.addColorStop(0, 'rgba(225,238,255,0.95)');
    sGrad.addColorStop(0.45, 'rgba(198,220,255,0.4)');
    sGrad.addColorStop(1, 'rgba(180,205,255,0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 256);
    lightShaftTexture.hasAlpha = true;
    lightShaftTexture.update();
  }

  return {
    stoneAlbedo,
    stoneBump,
    woodAlbedo,
    woodBump,
    marbleAlbedo,
    marbleBump,
    marbleRoughness,
    metalBump,
    slateAlbedo,
    slateBump,
    mudAlbedo,
    mudBump,
    cobwebAlpha,
    skyNightAlbedo,
    particleDot,
    lightShaftTexture,
  };
}

export function createProceduralEnvironmentCube(scene: Scene): RawCubeTexture {
  const size = 64;
  const faces: Uint8Array[] = [];

  const dirForFace = (
    faceIdx: number,
    u: number,
    v: number,
  ): [number, number, number] => {
    switch (faceIdx) {
      case 0:
        return [1, -v, -u];
      case 1:
        return [-1, -v, u];
      case 2:
        return [u, 1, v];
      case 3:
        return [u, -1, -v];
      case 4:
        return [u, -v, 1];
      default:
        return [-u, -v, -1];
    }
  };

  for (let f = 0; f < 6; f++) {
    const buf = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      const v = (y / (size - 1)) * 2 - 1;
      for (let x = 0; x < size; x++) {
        const u = (x / (size - 1)) * 2 - 1;
        const [dx, dy, dz] = dirForFace(f, u, v);
        const len = Math.hypot(dx, dy, dz);
        const nx = dx / len;
        const ny = dy / len;
        const nz = dz / len;

        const skyT = Math.max(0, Math.min(1, ny * 0.5 + 0.5));
        let r = 20 + skyT * 48;
        let g = 28 + skyT * 66;
        let b = 48 + skyT * 108;

        const moonDot = Math.max(0, nx * 0.55 + ny * 0.72 + nz * 0.42);
        const moonSpec =
          Math.pow(moonDot, 16) * 200 + Math.pow(moonDot, 4) * 48;
        r += moonSpec * 0.85;
        g += moonSpec * 0.94;
        b += moonSpec * 1.1;

        const warmDot = Math.max(0, -nx * 0.5 + ny * 0.1 - nz * 0.6);
        const warmGlow = Math.pow(warmDot, 6) * 62;
        r += warmGlow * 1.15;
        g += warmGlow * 0.7;
        b += warmGlow * 0.32;

        const idx = (y * size + x) * 4;
        buf[idx] = Math.min(255, Math.round(r));
        buf[idx + 1] = Math.min(255, Math.round(g));
        buf[idx + 2] = Math.min(255, Math.round(b));
        buf[idx + 3] = 255;
      }
    }
    faces.push(buf);
  }

  const cube = new RawCubeTexture(
    scene,
    faces,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  cube.gammaSpace = false;
  return cube;
}
