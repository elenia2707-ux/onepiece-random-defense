export const enum RenderLayer {
  GroundFx = 0,
  Shadow = 1,
  Monster = 2,
  Unit = 3,
  Projectile = 4,
  AirFx = 5,
  WorldUI = 6,
}

export const RENDER_LAYER_COUNT = 7;

export interface IRenderable {
  layer: RenderLayer;
  sortY: number;
  render(ctx: CanvasRenderingContext2D, baseMatrixScale: number): void;
}
