export type ReconstructionPoint = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};
export type ReconstructionProgress = { percent: number; message: string };
export type ReconstructionResult = {
  points: ReconstructionPoint[];
  registeredViews: number;
  totalViews: number;
  reprojectionError: number;
  elapsedMs: number;
  warnings: string[];
  engine: "OpenCV.js + SfM";
  scale: "relative";
};
export type ReconstructionImage = {
  name: string;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};
export type ReconstructionMessage =
  | { type: "progress"; progress: ReconstructionProgress }
  | { type: "result"; result: ReconstructionResult }
  | { type: "error"; message: string };
