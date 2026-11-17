export type AtmosphereId = 'moonlight' | 'dusk' | 'dawn';

export type ViewerMode = 'explore' | 'orbit';

export type ExploreZone = 'Extérieur' | 'Rez-de-chaussée' | 'Étage';

export type QualityTier = 'auto' | 'high' | 'medium' | 'low';
export type ResolvedQuality = 'high' | 'medium' | 'low';

export interface AtmospherePreset {
  id: AtmosphereId;
  label: string;
  swatch: string;
  backgroundColor: [number, number, number];
  fogColor: [number, number, number];
  fogDensity: number;
  keyLightColor: [number, number, number];
  keyLightIntensity: number;
  keyLightDirection: [number, number, number];
  hemiSkyColor: [number, number, number];
  hemiGroundColor: [number, number, number];
  hemiIntensity: number;
  rimLightColor: [number, number, number];
  rimLightIntensity: number;
  interiorWarmColor: [number, number, number];
  interiorWarmIntensity: number;
  exposure: number;
  envIntensity: number;
  shaftAlpha: number;
}

export const ATMOSPHERE_PRESETS: Record<AtmosphereId, AtmospherePreset> = {
  moonlight: {
    id: 'moonlight',
    label: 'Clair de Lune',
    swatch: '#7ea6ff',
    backgroundColor: [0.04, 0.06, 0.11],
    fogColor: [0.045, 0.065, 0.115],
    fogDensity: 0.015,
    keyLightColor: [0.72, 0.82, 1.0],
    keyLightIntensity: 2.3,
    keyLightDirection: [-0.55, -0.72, -0.48],
    hemiSkyColor: [0.36, 0.48, 0.68],
    hemiGroundColor: [0.09, 0.11, 0.14],
    hemiIntensity: 0.68,
    rimLightColor: [0.42, 0.56, 0.84],
    rimLightIntensity: 0.75,
    interiorWarmColor: [1.0, 0.67, 0.34],
    interiorWarmIntensity: 18,
    exposure: 1.18,
    envIntensity: 0.85,
    shaftAlpha: 0.11,
  },
  dusk: {
    id: 'dusk',
    label: 'Crépuscule',
    swatch: '#e89464',
    backgroundColor: [0.1, 0.075, 0.12],
    fogColor: [0.105, 0.08, 0.125],
    fogDensity: 0.013,
    keyLightColor: [1.0, 0.68, 0.45],
    keyLightIntensity: 2.7,
    keyLightDirection: [-0.68, -0.45, -0.52],
    hemiSkyColor: [0.54, 0.42, 0.62],
    hemiGroundColor: [0.15, 0.11, 0.09],
    hemiIntensity: 0.75,
    rimLightColor: [0.55, 0.48, 0.78],
    rimLightIntensity: 0.7,
    interiorWarmColor: [1.0, 0.72, 0.42],
    interiorWarmIntensity: 14,
    exposure: 1.14,
    envIntensity: 0.9,
    shaftAlpha: 0.13,
  },
  dawn: {
    id: 'dawn',
    label: "Brume d'Aube",
    swatch: '#a6bac7',
    backgroundColor: [0.11, 0.14, 0.17],
    fogColor: [0.115, 0.145, 0.175],
    fogDensity: 0.018,
    keyLightColor: [0.89, 0.92, 0.96],
    keyLightIntensity: 2.0,
    keyLightDirection: [0.5, -0.68, -0.54],
    hemiSkyColor: [0.64, 0.72, 0.79],
    hemiGroundColor: [0.17, 0.19, 0.17],
    hemiIntensity: 0.85,
    rimLightColor: [0.61, 0.7, 0.79],
    rimLightIntensity: 0.65,
    interiorWarmColor: [1.0, 0.75, 0.47],
    interiorWarmIntensity: 10,
    exposure: 1.1,
    envIntensity: 0.95,
    shaftAlpha: 0.14,
  },
};

export type CameraPresetId = 'facade' | 'overview' | 'hall' | 'gallery' | 'rear';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'facade',
    label: 'Façade',
    position: [19, 10.5, 27],
    target: [0, 4.2, 0],
  },
  {
    id: 'overview',
    label: 'Domaine',
    position: [-26, 22, 26],
    target: [0, 2.5, 0],
  },
  {
    id: 'hall',
    label: 'Grand Hall',
    position: [0, 2.5, 7.6],
    target: [0, 2.8, -5.5],
  },
  {
    id: 'gallery',
    label: 'Galerie',
    position: [-6.8, 7.3, 5.8],
    target: [1.5, 6.2, -5.0],
  },
  {
    id: 'rear',
    label: 'Arrière',
    position: [-16, 8.5, -24],
    target: [0, 4.5, 0],
  },
];

export interface InspectedPart {
  name: string;
  material: string;
  dimensions: string;
  center: [number, number, number];
  radius: number;
}

export interface SceneStats {
  meshCount: number;
  materialCount: number;
  triangleCount: number;
  splatCount: number;
}

export type GameItemId =
  | 'matches'
  | 'fuse'
  | 'key'
  | 'medallion'
  | 'journal1'
  | 'journal2'
  | 'journal3';

export interface GameItemDef {
  id: GameItemId;
  name: string;
  shortLabel: string;
  description: string;
  loreText?: string;
  color: [number, number, number];
  position: [number, number, number];
}

export const GAME_ITEMS: GameItemDef[] = [
  {
    id: 'matches',
    name: "Boîte d'Allumettes en Laiton",
    shortLabel: 'Allumettes',
    description: 'Des allumettes sèches protégées dans un étui gravé.',
    color: [0.95, 0.65, 0.25],
    position: [-7.8, 1.4, 0.3],
  },
  {
    id: 'fuse',
    name: 'Fusible du Grand Lustre',
    shortLabel: 'Fusible',
    description:
      'Ancien fusible en porcelaine et cuivre destiné au tableau du hall.',
    color: [0.35, 0.85, 1.0],
    position: [5.4, 1.15, -6.2],
  },
  {
    id: 'key',
    name: 'Clé en Fer Forgé',
    shortLabel: 'Clé',
    description: 'Lourde clé ornée ouvrant la double porte du sanctuaire.',
    color: [1.0, 0.84, 0.38],
    position: [1.05, 0.42, 18.0],
  },
  {
    id: 'medallion',
    name: 'Médaillon des Valmont',
    shortLabel: 'Médaillon',
    description: 'Relique familiale dissimulée sur la galerie supérieure.',
    color: [0.88, 0.45, 0.98],
    position: [0, 5.95, -7.2],
  },
  {
    id: 'journal1',
    name: 'Page du Journal I — L’Abandon',
    shortLabel: 'Note I',
    description: 'Un feuillet jauni posé sur la table de la salle à manger.',
    loreText:
      '« 14 novembre — L’humidité ronge le marbre. Nous avons condamné la double porte du fond et retiré le fusible du lustre avant de quitter les lieux. »',
    color: [0.92, 0.86, 0.7],
    position: [7.6, 1.38, 2.8],
  },
  {
    id: 'journal2',
    name: 'Page du Journal II — L’Âtre',
    shortLabel: 'Note II',
    description: 'Un carnet oublié devant les rayonnages de la bibliothèque.',
    loreText:
      '« Le froid de la vallée fige jusqu’aux pendeloques de cristal. Tant que la cheminée ne brûle pas, les ombres du salon semblent se mouvoir seules. »',
    color: [0.92, 0.86, 0.7],
    position: [8.4, 1.12, -6.5],
  },
  {
    id: 'journal3',
    name: 'Page du Journal III — La Galerie',
    shortLabel: 'Note III',
    description: 'Une lettre scellée posée près du lit de l’aile Ouest.',
    loreText:
      '« La clé de fer a glissé près de la fontaine brisée dans la cour. Quiconque réunira le feu, la lumière et le médaillon connaîtra le secret des Valmont. »',
    color: [0.92, 0.86, 0.7],
    position: [-8.0, 6.62, -6.6],
  },
];

export interface MissionObjective {
  id: string;
  title: string;
  hint: string;
  completed: boolean;
}

export interface NearbyInteractable {
  id: string;
  label: string;
  actionLabel: string;
  lockedReason?: string;
}

export interface GameProgressState {
  enteredManor: boolean;
  hearthLit: boolean;
  chandelierLit: boolean;
  doubleDoorOpen: boolean;
  openDoorIds?: string[];
  openWindowNames: string[];
  collectedItems: GameItemId[];
  playerPosition?: [number, number, number];
  playerYaw?: number;
  playerPitch?: number;
}

export function buildMissions(state: GameProgressState): MissionObjective[] {
  return [
    {
      id: 'enter_manor',
      title: 'Franchir le Portique',
      hint: 'Traversez la cour et entrez dans le Grand Hall.',
      completed: state.enteredManor,
    },
    {
      id: 'light_hearth',
      title: "Rallumer l'Âtre",
      hint: state.collectedItems.includes('matches')
        ? 'Allumez la cheminée monumentale dans le salon Ouest.'
        : 'Trouvez la boîte d’allumettes sur la table du salon Ouest.',
      completed: state.hearthLit,
    },
    {
      id: 'restore_chandelier',
      title: 'Éveiller le Grand Lustre',
      hint: state.collectedItems.includes('fuse')
        ? "Actionnez l'interrupteur près du pilier de l'escalier."
        : 'Trouvez le fusible ancien près de la bibliothèque (aile Est).',
      completed: state.chandelierLit,
    },
    {
      id: 'claim_medallion',
      title: 'Le Secret de la Galerie',
      hint: "Montez l'escalier monumental et récupérez le médaillon.",
      completed: state.collectedItems.includes('medallion'),
    },
    {
      id: 'unlock_sanctuary',
      title: 'Ouvrir la Double Porte',
      hint: state.collectedItems.includes('key')
        ? 'Déverrouillez la double porte au fond du rez-de-chaussée.'
        : 'Cherchez la clé en fer forgé près de la fontaine brisée.',
      completed: state.doubleDoorOpen,
    },
  ];
}
