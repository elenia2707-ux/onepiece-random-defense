import type { MonsterKind, UnitId } from '../data/types';

const INK = '#181122';

function strokeAndFill(
  ctx: CanvasRenderingContext2D,
  fill: string,
  lineWidth = 5.5,
  stroke = INK,
): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawBoots(
  ctx: CanvasRenderingContext2D,
  leftColor: string,
  rightColor: string,
  spread = 16,
  y = 132,
): void {
  // Left boot
  ctx.beginPath();
  ctx.ellipse(80 - spread, y, 12, 8.5, -0.12, 0, Math.PI * 2);
  strokeAndFill(ctx, leftColor, 5);
  // Specular highlight
  ctx.beginPath();
  ctx.ellipse(80 - spread - 3, y - 2.5, 4.5, 2.2, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();

  // Right boot
  ctx.beginPath();
  ctx.ellipse(80 + spread, y, 12, 8.5, 0.12, 0, Math.PI * 2);
  strokeAndFill(ctx, rightColor, 5);
  ctx.beginPath();
  ctx.ellipse(80 + spread - 2, y - 2.5, 4.5, 2.2, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
}

function drawTorso(
  ctx: CanvasRenderingContext2D,
  topColor: string,
  shadeColor: string,
  sashColor?: string,
  widthScale = 1,
): void {
  const hwTop = 21 * widthScale;
  const hwBot = 26 * widthScale;
  ctx.beginPath();
  ctx.moveTo(80 - hwTop, 88);
  ctx.quadraticCurveTo(80 - hwBot - 3, 110, 80 - hwBot, 126);
  ctx.quadraticCurveTo(80, 132, 80 + hwBot, 126);
  ctx.quadraticCurveTo(80 + hwBot + 3, 110, 80 + hwTop, 88);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();

  // Two-tone cel shadow on right side of torso
  ctx.save();
  ctx.clip();
  ctx.fillStyle = shadeColor;
  ctx.beginPath();
  ctx.moveTo(84, 86);
  ctx.lineTo(80 + hwBot + 10, 86);
  ctx.lineTo(80 + hwBot + 10, 136);
  ctx.quadraticCurveTo(88, 122, 84, 86);
  ctx.fill();

  if (sashColor) {
    ctx.fillStyle = sashColor;
    ctx.fillRect(80 - hwBot - 4, 114, (hwBot + 4) * 2, 10);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80 - hwBot - 4, 114);
    ctx.lineTo(80 + hwBot + 4, 114);
    ctx.stroke();
  }
  ctx.restore();

  // Re-stroke torso outer contour
  ctx.beginPath();
  ctx.moveTo(80 - hwTop, 88);
  ctx.quadraticCurveTo(80 - hwBot - 3, 110, 80 - hwBot, 126);
  ctx.quadraticCurveTo(80, 132, 80 + hwBot, 126);
  ctx.quadraticCurveTo(80 + hwBot + 3, 110, 80 + hwTop, 88);
  ctx.closePath();
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/**
 * Sculpted anime chibi head (not a circle — wider soft cheeks tapering to a cute chin)
 * with cel-shaded shadow crescent.
 */
function drawChibiHead(
  ctx: CanvasRenderingContext2D,
  skinBase = '#ffe0c2',
  skinShade = '#f0bc94',
  cy = 64,
): void {
  // Ears
  ctx.beginPath();
  ctx.arc(46, cy + 5, 7.5, 0, Math.PI * 2);
  ctx.arc(114, cy + 5, 7.5, 0, Math.PI * 2);
  strokeAndFill(ctx, skinShade, 5);

  // Sculpted anime cheek & chin path
  const headPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(80, cy - 32);
    ctx.bezierCurveTo(106, cy - 32, 116, cy - 12, 114, cy + 8);
    ctx.bezierCurveTo(112, cy + 24, 96, cy + 31, 80, cy + 32);
    ctx.bezierCurveTo(64, cy + 31, 48, cy + 24, 46, cy + 8);
    ctx.bezierCurveTo(44, cy - 12, 54, cy - 32, 80, cy - 32);
    ctx.closePath();
  };

  headPath();
  ctx.fillStyle = skinBase;
  ctx.fill();

  // Two-tone cel shadow along right cheek & chin
  ctx.save();
  headPath();
  ctx.clip();
  ctx.fillStyle = skinShade;
  ctx.beginPath();
  ctx.moveTo(98, cy - 34);
  ctx.quadraticCurveTo(104, cy + 8, 66, cy + 28);
  ctx.lineTo(120, cy + 36);
  ctx.lineTo(120, cy - 34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  headPath();
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

interface FaceOptions {
  readonly cy?: number;
  readonly irisColor?: string;
  readonly mouth?: 'grin' | 'smirk' | 'fierce' | 'smile' | 'open';
  readonly leftEyeClosedScar?: boolean;
  readonly underLeftEyeScar?: boolean;
  readonly tripleLeftScar?: boolean;
  readonly curlyBrow?: boolean;
  readonly longNose?: boolean;
  readonly blueNose?: boolean;
  readonly freckles?: boolean;
  readonly kabukiShade?: boolean;
}

function drawAnimeFace(ctx: CanvasRenderingContext2D, opts: FaceOptions = {}): void {
  const cy = opts.cy ?? 64;
  const iris = opts.irisColor ?? '#231829';

  if (opts.kabukiShade) {
    ctx.fillStyle = 'rgba(185, 28, 56, 0.35)';
    ctx.beginPath();
    ctx.ellipse(65, cy + 5, 11, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(95, cy + 5, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Left eye (viewer's left = x ~ 65)
  if (opts.leftEyeClosedScar) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(57, cy + 5);
    ctx.lineTo(73, cy + 6);
    ctx.stroke();
    ctx.strokeStyle = '#9f2a36';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(65, cy - 6);
    ctx.lineTo(63, cy + 16);
    ctx.stroke();
  } else {
    drawSingleEye(ctx, 65, cy + 5, iris);
  }

  // Right eye
  drawSingleEye(ctx, 95, cy + 5, iris);

  // Eyebrows
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(56, cy - 6);
  ctx.lineTo(73, cy - 3);
  ctx.moveTo(104, cy - 6);
  ctx.lineTo(87, cy - 3);
  ctx.stroke();

  if (opts.curlyBrow) {
    ctx.beginPath();
    ctx.arc(89, cy - 6, 3.5, 0, Math.PI * 1.65);
    ctx.stroke();
  }

  // Scars / Nose / Freckles
  if (opts.underLeftEyeScar) {
    ctx.strokeStyle = '#8b2635';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(58, cy + 15);
    ctx.quadraticCurveTo(64, cy + 18, 70, cy + 15);
    ctx.moveTo(61, cy + 14);
    ctx.lineTo(61, cy + 18);
    ctx.moveTo(66, cy + 14);
    ctx.lineTo(66, cy + 18);
    ctx.stroke();
  }

  if (opts.tripleLeftScar) {
    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 2.5;
    for (let s = -4; s <= 4; s += 4) {
      ctx.beginPath();
      ctx.moveTo(61 + s, cy - 9);
      ctx.lineTo(67 + s, cy + 16);
      ctx.stroke();
    }
  }

  if (opts.freckles) {
    ctx.fillStyle = '#b45309';
    for (const fx of [56, 61, 99, 104]) {
      ctx.beginPath();
      ctx.arc(fx, cy + 14, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (opts.blueNose) {
    ctx.beginPath();
    ctx.ellipse(80, cy + 11, 5.5, 4, 0, 0, Math.PI * 2);
    strokeAndFill(ctx, '#2563eb', 3);
  } else if (opts.longNose) {
    ctx.beginPath();
    ctx.moveTo(80, cy + 6);
    ctx.lineTo(64, cy + 12);
    ctx.quadraticCurveTo(62, cy + 16, 80, cy + 15);
    strokeAndFill(ctx, '#f5c49c', 3.5);
  }

  // Mouth
  const mouth = opts.mouth ?? 'smirk';
  if (mouth === 'grin') {
    ctx.beginPath();
    ctx.moveTo(66, cy + 17);
    ctx.quadraticCurveTo(80, cy + 28, 94, cy + 17);
    ctx.quadraticCurveTo(80, cy + 20, 66, cy + 17);
    ctx.closePath();
    strokeAndFill(ctx, '#ffffff', 3.5);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(74, cy + 19);
    ctx.lineTo(74, cy + 23);
    ctx.moveTo(80, cy + 19);
    ctx.lineTo(80, cy + 24);
    ctx.moveTo(86, cy + 19);
    ctx.lineTo(86, cy + 23);
    ctx.stroke();
  } else if (mouth === 'fierce') {
    ctx.beginPath();
    ctx.moveTo(69, cy + 20);
    ctx.lineTo(91, cy + 18);
    ctx.lineTo(89, cy + 24);
    ctx.lineTo(71, cy + 24);
    ctx.closePath();
    strokeAndFill(ctx, '#ffffff', 3.2);
  } else if (mouth === 'smile') {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(80, cy + 16, 8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // Cute blush
    ctx.fillStyle = 'rgba(251, 113, 133, 0.45)';
    ctx.beginPath();
    ctx.ellipse(57, cy + 14, 5.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(103, cy + 14, 5.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (mouth === 'open') {
    ctx.beginPath();
    ctx.ellipse(80, cy + 20, 8, 5.5, 0, 0, Math.PI * 2);
    strokeAndFill(ctx, '#be123c', 3.4);
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(72, cy + 20);
    ctx.quadraticCurveTo(82, cy + 23, 90, cy + 17);
    ctx.stroke();
  }
}

function drawSingleEye(
  ctx: CanvasRenderingContext2D,
  ex: number,
  ey: number,
  irisColor: string,
): void {
  // Sclera
  ctx.beginPath();
  ctx.ellipse(ex, ey, 7.5, 8.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // Iris
  ctx.beginPath();
  ctx.ellipse(ex, ey + 1, 5, 6.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = irisColor;
  ctx.fill();

  // Dark pupil
  ctx.beginPath();
  ctx.arc(ex, ey + 1.5, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  // Top lash thickening
  ctx.beginPath();
  ctx.arc(ex, ey - 0.5, 7.5, Math.PI * 1.1, Math.PI * 1.9);
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = INK;
  ctx.stroke();

  // White catchlight
  ctx.beginPath();
  ctx.arc(ex - 2.2, ey - 2.2, 2.3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function drawStrawHat(ctx: CanvasRenderingContext2D, cy = 64, slungBack = false): void {
  if (slungBack) {
    ctx.save();
    ctx.translate(80, cy + 10);
    ctx.rotate(-0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 18, 0, 0, Math.PI * 2);
    strokeAndFill(ctx, '#facc15', 5);
    ctx.beginPath();
    ctx.arc(0, -4, 24, Math.PI, 0);
    strokeAndFill(ctx, '#eab308', 4.5);
    ctx.restore();
    return;
  }

  // Crown dome
  ctx.beginPath();
  ctx.arc(80, cy - 20, 32, Math.PI, 0);
  ctx.closePath();
  strokeAndFill(ctx, '#fde047', 5.5);

  // Two-tone crown shade
  ctx.beginPath();
  ctx.arc(80, cy - 20, 30, -Math.PI * 0.35, 0);
  ctx.lineTo(86, cy - 20);
  ctx.closePath();
  ctx.fillStyle = '#eab308';
  ctx.fill();

  // Red ribbon band
  ctx.beginPath();
  ctx.rect(49, cy - 25, 62, 9);
  strokeAndFill(ctx, '#ef4444', 4.5);

  // Wide curved straw brim
  ctx.beginPath();
  ctx.moveTo(22, cy - 15);
  ctx.quadraticCurveTo(80, cy - 26, 138, cy - 15);
  ctx.quadraticCurveTo(142, cy - 9, 132, cy - 8);
  ctx.quadraticCurveTo(80, cy - 17, 28, cy - 8);
  ctx.quadraticCurveTo(18, cy - 9, 22, cy - 15);
  ctx.closePath();
  strokeAndFill(ctx, '#facc15', 5.5);
}

function drawSpikyHair(
  ctx: CanvasRenderingContext2D,
  color: string,
  shade: string,
  cy = 64,
  tall = false,
): void {
  const topY = tall ? cy - 48 : cy - 38;
  ctx.beginPath();
  ctx.moveTo(44, cy + 2);
  ctx.lineTo(36, cy - 14);
  ctx.lineTo(48, cy - 22);
  ctx.lineTo(44, topY + 8);
  ctx.lineTo(62, cy - 32);
  ctx.lineTo(72, topY);
  ctx.lineTo(84, cy - 33);
  ctx.lineTo(98, topY + 2);
  ctx.lineTo(104, cy - 28);
  ctx.lineTo(122, topY + 12);
  ctx.lineTo(114, cy - 14);
  ctx.lineTo(124, cy - 4);
  ctx.lineTo(112, cy + 4);
  ctx.quadraticCurveTo(98, cy - 16, 80, cy - 14);
  ctx.quadraticCurveTo(62, cy - 16, 44, cy + 2);
  ctx.closePath();
  strokeAndFill(ctx, color, 5.2);

  // Hair bangs over forehead
  ctx.beginPath();
  ctx.moveTo(52, cy - 18);
  ctx.lineTo(60, cy - 4);
  ctx.lineTo(68, cy - 16);
  ctx.lineTo(80, cy - 3);
  ctx.lineTo(91, cy - 16);
  ctx.lineTo(100, cy - 5);
  ctx.lineTo(107, cy - 18);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.lineWidth = 3.8;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawKatana(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  angle: number,
  length: number,
  bladeColor = '#e2e8f0',
  hiltColor = '#f8fafc',
): void {
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(angle);

  // Blade
  ctx.beginPath();
  ctx.moveTo(0, -3.5);
  ctx.lineTo(length, -2);
  ctx.lineTo(length + 8, 0);
  ctx.lineTo(length, 3.5);
  ctx.lineTo(0, 3.5);
  ctx.closePath();
  strokeAndFill(ctx, bladeColor, 4.2);

  // Tsuba guard
  ctx.beginPath();
  ctx.roundRect(-4, -8, 6, 16, 2);
  strokeAndFill(ctx, '#f59e0b', 3.5);

  // Hilt
  ctx.beginPath();
  ctx.roundRect(-22, -4, 18, 8, 2);
  strokeAndFill(ctx, hiltColor, 4);
  ctx.restore();
}

function drawCloudScarf(
  ctx: CanvasRenderingContext2D,
  fillColor = '#ffffff',
  strokeColor = '#3b0764',
): void {
  ctx.save();
  const puffs: ReadonlyArray<readonly [number, number, number]> = [
    [34, 88, 12],
    [26, 66, 13],
    [34, 42, 14],
    [54, 24, 15],
    [80, 18, 16],
    [106, 24, 15],
    [126, 42, 14],
    [134, 66, 13],
    [126, 88, 12],
  ];
  // Outer dark stroke pass
  ctx.fillStyle = strokeColor;
  for (const [px, py, pr] of puffs) {
    ctx.beginPath();
    ctx.arc(px, py, pr + 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Soft inner fill pass
  ctx.fillStyle = fillColor;
  for (const [px, py, pr] of puffs) {
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHakiLightning(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const bolts = [
    [
      [20, 56],
      [32, 46],
      [24, 34],
      [38, 20],
    ],
    [
      [140, 62],
      [126, 50],
      [136, 38],
      [122, 22],
    ],
  ];
  for (const b of bolts) {
    ctx.beginPath();
    ctx.moveTo(b[0]![0]!, b[0]![1]!);
    for (let i = 1; i < b.length; i++) {
      ctx.lineTo(b[i]![0]!, b[i]![1]!);
    }
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6.5;
  }
  ctx.restore();
}

function drawFist(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  fill: string,
  glowRingColor?: string,
): void {
  if (glowRingColor) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
    ctx.fillStyle = glowRingColor;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(x - radius, y - radius * 0.9, radius * 2, radius * 1.8, radius * 0.55);
  strokeAndFill(ctx, fill, 5);
  // Knuckle ridge
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.65, y - radius * 0.1);
  ctx.lineTo(x + radius * 0.65, y - radius * 0.1);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function drawFlameBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  outer = '#f97316',
  inner = '#fef08a',
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 1.45);
  ctx.bezierCurveTo(cx + r * 1.25, cy - r * 0.5, cx + r * 1.15, cy + r, cx, cy + r * 1.05);
  ctx.bezierCurveTo(cx - r * 1.15, cy + r, cx - r * 1.25, cy - r * 0.5, cx, cy - r * 1.45);
  ctx.closePath();
  strokeAndFill(ctx, outer, 4.5);

  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.18, r * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = inner;
  ctx.fill();
}

/**
 * Paints a 160x160 cel-shaded 2-head SD character sprite onto the provided context.
 */
export function paintUnitChibi(ctx: CanvasRenderingContext2D, unitId: UnitId): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (unitId) {
    case 'luffy': {
      drawBoots(ctx, '#92400e', '#78350f', 15, 134);
      // Blue shorts cuff
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(60, 120, 40, 11);
      drawTorso(ctx, '#ef4444', '#b91c1c', '#facc15');
      // Open chest skin V
      ctx.beginPath();
      ctx.moveTo(73, 89);
      ctx.lineTo(80, 112);
      ctx.lineTo(87, 89);
      ctx.closePath();
      strokeAndFill(ctx, '#ffe0c2', 3.5);
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#1e1b2e', '#0f0d1a', 64);
      drawStrawHat(ctx, 64);
      drawAnimeFace(ctx, { mouth: 'grin', underLeftEyeScar: true });
      // Outstretched rubber punch fist
      drawFist(ctx, 124, 102, 13, '#ffe0c2');
      break;
    }

    case 'luffy_gear2': {
      // Steam puffs behind
      for (const [sx, sy, sr] of [
        [34, 96, 13],
        [28, 72, 11],
        [130, 82, 13],
        [122, 56, 10],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        strokeAndFill(ctx, '#fff1f2', 4);
      }
      drawStrawHat(ctx, 68, true);
      drawBoots(ctx, '#92400e', '#78350f', 18, 134);
      drawTorso(ctx, '#f43f5e', '#be123c', '#fde047');
      drawChibiHead(ctx, '#fecdd3', '#fda4af', 64);
      drawSpikyHair(ctx, '#1e1b2e', '#0f0d1a', 64);
      drawAnimeFace(ctx, { mouth: 'fierce', underLeftEyeScar: true, irisColor: '#e11d48' });
      // Jet Gatling fist + pink sonic ring
      ctx.beginPath();
      ctx.ellipse(126, 100, 10, 20, 0.25, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#fb7185';
      ctx.stroke();
      drawFist(ctx, 126, 100, 14, '#fda4af', 'rgba(251, 113, 133, 0.45)');
      break;
    }

    case 'luffy_ts': {
      drawBoots(ctx, '#78350f', '#451a03', 16, 134);
      drawTorso(ctx, '#dc2626', '#991b1b', '#facc15');
      // Chest X-scar
      ctx.beginPath();
      ctx.moveTo(72, 92);
      ctx.lineTo(88, 110);
      ctx.moveTo(88, 92);
      ctx.lineTo(72, 110);
      ctx.strokeStyle = '#9f1239';
      ctx.lineWidth = 4;
      ctx.stroke();
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#1e1b2e', '#0f0d1a', 64);
      drawStrawHat(ctx, 64);
      drawAnimeFace(ctx, { mouth: 'fierce', underLeftEyeScar: true });
      // Red Hawk flame + Armament Haki black fist
      drawFlameBlob(ctx, 126, 95, 19, '#f97316', '#fde047');
      drawFist(ctx, 126, 101, 13, '#271729');
      break;
    }

    case 'luffy_gear4': {
      drawCloudScarf(ctx, '#f8fafc', '#1e293b');
      drawBoots(ctx, '#31102f', '#1f091e', 20, 135);
      drawTorso(ctx, '#dc2626', '#881337', '#facc15', 1.24);
      // Haki broad shoulders/arms
      drawFist(ctx, 34, 104, 15, '#3b0a2a', 'rgba(225, 29, 72, 0.35)');
      drawChibiHead(ctx, '#ffe0c2', '#f0bc94', 62);
      drawSpikyHair(ctx, '#290d24', '#140511', 62, true);
      drawAnimeFace(ctx, {
        cy: 62,
        mouth: 'fierce',
        underLeftEyeScar: true,
        kabukiShade: true,
        irisColor: '#be123c',
      });
      // Giant Kong Gun fist
      drawFist(ctx, 128, 98, 18, '#3b0a2a', 'rgba(244, 63, 94, 0.5)');
      break;
    }

    case 'luffy_nika': {
      // Sun God Nika: violet Haki lightning + billowing white cloud scarf + white flame hair
      drawHakiLightning(ctx, '#c084fc');
      drawCloudScarf(ctx, '#ffffff', '#4c1d95');
      drawBoots(ctx, '#78350f', '#451a03', 17, 134);
      drawTorso(ctx, '#ffffff', '#e2e8f0', '#9333ea', 1.06);
      drawChibiHead(ctx, '#ffe4cc', '#f3c29f', 64);
      // White flame-curled Nika hair
      drawSpikyHair(ctx, '#ffffff', '#e9d5ff', 64, true);
      // Extra swirl curls on top
      ctx.beginPath();
      ctx.arc(80, 22, 9, 0, Math.PI * 1.6);
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#6b21a8';
      ctx.stroke();
      drawAnimeFace(ctx, {
        cy: 64,
        mouth: 'grin',
        underLeftEyeScar: true,
        irisColor: '#e11d48',
      });
      drawFist(ctx, 127, 98, 15, '#ffffff', 'rgba(192, 132, 252, 0.65)');
      break;
    }

    case 'zoro': {
      drawBoots(ctx, '#1e293b', '#0f172a', 16, 134);
      drawTorso(ctx, '#f8fafc', '#cbd5e1', '#15803d');
      drawKatana(ctx, 44, 108, 2.35, 34, '#e2e8f0', '#0f172a');
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#22c55e', '#15803d', 64);
      drawAnimeFace(ctx, { mouth: 'fierce', irisColor: '#14532d' });
      // Signature Wado Ichimonji gripped horizontally in mouth!
      drawKatana(ctx, 64, 83, -0.05, 68, '#f1f5f9', '#ffffff');
      break;
    }

    case 'zoro_dual': {
      drawBoots(ctx, '#1e293b', '#0f172a', 17, 134);
      drawTorso(ctx, '#166534', '#14532d', '#22c55e');
      // Crossed twin katanas in front/sides
      drawKatana(ctx, 44, 106, -2.35, 44, '#bae6fd', '#1e293b');
      drawKatana(ctx, 116, 106, -0.75, 44, '#bae6fd', '#991b1b');
      drawChibiHead(ctx);
      // Black battle bandana!
      ctx.beginPath();
      ctx.arc(80, 58, 34, Math.PI * 1.02, -0.02);
      ctx.closePath();
      strokeAndFill(ctx, '#1e293b', 5.2);
      // Green hair fringe peeking under bandana
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(54, 52, 52, 5);
      drawAnimeFace(ctx, { mouth: 'fierce', irisColor: '#15803d' });
      break;
    }

    case 'zoro_ts': {
      drawBoots(ctx, '#14532d', '#052e16', 17, 134);
      drawTorso(ctx, '#15803d', '#14532d', '#dc2626', 1.06);
      // Black Haki katana held forward
      drawKatana(ctx, 112, 102, -0.55, 48, '#312e81', '#dc2626');
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#22c55e', '#15803d', 64);
      drawAnimeFace(ctx, { mouth: 'smirk', leftEyeClosedScar: true, irisColor: '#14532d' });
      drawKatana(ctx, 64, 83, -0.04, 66, '#1e1b4b', '#ffffff');
      break;
    }

    case 'zoro_ashura': {
      // Spectral Asura 6-blade demon fan behind!
      for (const ang of [-2.55, -2.15, -1.75, -1.35, -0.95, -0.55]) {
        drawKatana(ctx, 80, 88, ang, 64, '#c084fc', '#4c1d95');
      }
      drawHakiLightning(ctx, '#e11d48');
      drawBoots(ctx, '#1e1b4b', '#0f172a', 18, 134);
      drawTorso(ctx, '#14532d', '#052e16', '#dc2626', 1.1);
      drawChibiHead(ctx);
      ctx.beginPath();
      ctx.arc(80, 58, 34, Math.PI * 1.02, -0.02);
      ctx.closePath();
      strokeAndFill(ctx, '#18181b', 5.2);
      drawAnimeFace(ctx, { mouth: 'fierce', leftEyeClosedScar: true, irisColor: '#e11d48' });
      drawKatana(ctx, 62, 83, -0.03, 70, '#4c1d95', '#ffffff');
      break;
    }

    case 'nami': {
      drawBoots(ctx, '#d97706', '#b45309', 13, 134);
      drawTorso(ctx, '#ffffff', '#dbeafe', '#f59e0b', 0.92);
      // Blue stripe across top
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(62, 98, 36, 8);
      drawChibiHead(ctx, '#ffe4cc', '#f3c29f');
      // Bright orange bob hair
      ctx.beginPath();
      ctx.arc(80, 58, 35, Math.PI * 0.85, Math.PI * 0.15);
      ctx.quadraticCurveTo(116, 84, 106, 86);
      ctx.lineTo(106, 56);
      ctx.lineTo(54, 56);
      ctx.lineTo(54, 86);
      ctx.quadraticCurveTo(44, 84, 46, 68);
      ctx.closePath();
      strokeAndFill(ctx, '#fb923c', 5);
      drawSpikyHair(ctx, '#fb923c', '#ea580c', 64);
      drawAnimeFace(ctx, { mouth: 'smile', irisColor: '#92400e' });
      // Clima-Tact staff
      ctx.beginPath();
      ctx.moveTo(122, 132);
      ctx.lineTo(130, 52);
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      break;
    }

    case 'nami_clima': {
      drawBoots(ctx, '#0284c7', '#0369a1', 14, 134);
      drawTorso(ctx, '#0ea5e9', '#0284c7', '#facc15', 0.94);
      drawChibiHead(ctx, '#ffe4cc', '#f3c29f');
      // Long wavy orange hair
      ctx.beginPath();
      ctx.ellipse(48, 82, 12, 24, 0.2, 0, Math.PI * 2);
      ctx.ellipse(112, 82, 12, 24, -0.2, 0, Math.PI * 2);
      strokeAndFill(ctx, '#f97316', 4.8);
      drawSpikyHair(ctx, '#fb923c', '#ea580c', 64);
      drawAnimeFace(ctx, { mouth: 'smile', irisColor: '#b45309' });
      // Sorcery Clima-Tact + Mini Zeus Thundercloud!
      ctx.beginPath();
      ctx.moveTo(122, 134);
      ctx.lineTo(128, 48);
      ctx.lineWidth = 8;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(124, 38, 13, 0, Math.PI * 2);
      ctx.arc(136, 40, 10, 0, Math.PI * 2);
      strokeAndFill(ctx, '#fef08a', 4.2);
      break;
    }

    case 'usopp': {
      drawBoots(ctx, '#78350f', '#451a03', 15, 134);
      drawTorso(ctx, '#a16207', '#713f12', '#fef08a', 0.96);
      drawChibiHead(ctx, '#f5cba7', '#d9a477');
      // Olive sniper bandana + goggles on forehead
      ctx.beginPath();
      ctx.arc(80, 56, 34, Math.PI, 0);
      strokeAndFill(ctx, '#65a30d', 5);
      // Goggles
      ctx.beginPath();
      ctx.arc(68, 46, 8, 0, Math.PI * 2);
      ctx.arc(92, 46, 8, 0, Math.PI * 2);
      strokeAndFill(ctx, '#bae6fd', 4);
      drawAnimeFace(ctx, { mouth: 'open', longNose: true });
      // Green Kabuto slingshot
      ctx.beginPath();
      ctx.moveTo(126, 126);
      ctx.lineTo(126, 96);
      ctx.lineTo(116, 80);
      ctx.moveTo(126, 96);
      ctx.lineTo(136, 80);
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#22c55e';
      ctx.stroke();
      break;
    }

    case 'sanji': {
      drawBoots(ctx, '#0f172a', '#020617', 16, 134);
      drawTorso(ctx, '#1e293b', '#0f172a');
      // Blue shirt & tie V
      ctx.beginPath();
      ctx.moveTo(73, 88);
      ctx.lineTo(80, 110);
      ctx.lineTo(87, 88);
      ctx.closePath();
      strokeAndFill(ctx, '#38bdf8', 3);
      drawChibiHead(ctx);
      // Blonde side-swept hair covering left eye!
      ctx.beginPath();
      ctx.moveTo(44, 66);
      ctx.quadraticCurveTo(44, 24, 84, 26);
      ctx.quadraticCurveTo(118, 28, 114, 66);
      ctx.lineTo(94, 54);
      ctx.lineTo(78, 76);
      ctx.lineTo(52, 78);
      ctx.closePath();
      strokeAndFill(ctx, '#facc15', 5);
      // Draw only visible right eye + curly brow + smirk
      drawSingleEye(ctx, 95, 69, '#1d4ed8');
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(89, 57, 4, 0, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(74, 84);
      ctx.quadraticCurveTo(84, 86, 91, 81);
      ctx.stroke();
      break;
    }

    case 'sanji_diable': {
      // Blazing Diable Jambe kick leg on right!
      drawBoots(ctx, '#0f172a', '#f97316', 16, 134);
      drawFlameBlob(ctx, 124, 108, 20, '#f97316', '#fef08a');
      drawTorso(ctx, '#1e293b', '#0f172a', '#f59e0b');
      drawChibiHead(ctx);
      ctx.beginPath();
      ctx.moveTo(44, 66);
      ctx.quadraticCurveTo(44, 24, 84, 26);
      ctx.quadraticCurveTo(118, 28, 114, 66);
      ctx.lineTo(94, 54);
      ctx.lineTo(78, 76);
      ctx.lineTo(52, 78);
      ctx.closePath();
      strokeAndFill(ctx, '#fde047', 5);
      drawSingleEye(ctx, 95, 69, '#dc2626');
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(89, 57, 4, 0, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(73, 84);
      ctx.lineTo(91, 82);
      ctx.stroke();
      break;
    }

    case 'chopper': {
      drawBoots(ctx, '#78350f', '#451a03', 13, 134);
      drawTorso(ctx, '#b45309', '#92400e', '#ef4444', 0.88);
      drawChibiHead(ctx, '#d97706', '#b45309', 68);
      // Antlers on left & right of pink hat
      ctx.beginPath();
      ctx.moveTo(44, 48);
      ctx.lineTo(26, 34);
      ctx.lineTo(34, 24);
      ctx.moveTo(116, 48);
      ctx.lineTo(134, 34);
      ctx.lineTo(126, 24);
      ctx.lineWidth = 8;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = '#a16207';
      ctx.stroke();
      // Big rose-pink Chopper top hat + white X!
      ctx.beginPath();
      ctx.ellipse(80, 52, 44, 11, 0, 0, Math.PI * 2);
      strokeAndFill(ctx, '#fb7185', 5);
      ctx.beginPath();
      ctx.roundRect(50, 16, 60, 36, 12);
      strokeAndFill(ctx, '#f43f5e', 5.2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(71, 25);
      ctx.lineTo(89, 43);
      ctx.moveTo(89, 25);
      ctx.lineTo(71, 43);
      ctx.stroke();
      drawAnimeFace(ctx, { cy: 68, mouth: 'smile', blueNose: true });
      break;
    }

    case 'marine_gunner': {
      drawBoots(ctx, '#1e293b', '#0f172a', 15, 134);
      drawTorso(ctx, '#f8fafc', '#cbd5e1', '#1d4ed8');
      drawChibiHead(ctx);
      // Marine white cap + blue visor
      ctx.beginPath();
      ctx.arc(80, 54, 34, Math.PI, 0);
      strokeAndFill(ctx, '#ffffff', 5);
      ctx.beginPath();
      ctx.ellipse(80, 54, 36, 8, 0, 0, Math.PI);
      strokeAndFill(ctx, '#1d4ed8', 4.5);
      drawAnimeFace(ctx, { mouth: 'fierce', irisColor: '#1e3a8a' });
      // Flintlock rifle
      ctx.beginPath();
      ctx.roundRect(96, 98, 44, 10, 3);
      strokeAndFill(ctx, '#334155', 4.5);
      break;
    }

    case 'marine_saber': {
      drawBoots(ctx, '#1e293b', '#0f172a', 15, 134);
      drawTorso(ctx, '#f8fafc', '#cbd5e1', '#0284c7');
      drawChibiHead(ctx);
      ctx.beginPath();
      ctx.arc(80, 54, 34, Math.PI, 0);
      strokeAndFill(ctx, '#ffffff', 5);
      ctx.beginPath();
      ctx.ellipse(80, 54, 36, 8, 0, 0, Math.PI);
      strokeAndFill(ctx, '#0284c7', 4.5);
      drawAnimeFace(ctx, { mouth: 'smirk', irisColor: '#1e3a8a' });
      drawKatana(ctx, 114, 104, -0.85, 42, '#e2e8f0', '#eab308');
      break;
    }

    case 'law': {
      // Kikoku long nodachi behind shoulder
      drawKatana(ctx, 44, 96, -0.85, 78, '#e2e8f0', '#fef08a');
      drawBoots(ctx, '#1e293b', '#0f172a', 16, 134);
      drawTorso(ctx, '#1e293b', '#0f172a', '#facc15');
      drawChibiHead(ctx, '#ffe4cc', '#e5b895');
      // Iconic white domed fur hat with black spots!
      ctx.beginPath();
      ctx.arc(80, 54, 36, Math.PI, 0);
      ctx.lineTo(116, 60);
      ctx.lineTo(44, 60);
      ctx.closePath();
      strokeAndFill(ctx, '#f8fafc', 5.2);
      ctx.fillStyle = '#1e293b';
      for (const [sx, sy] of [
        [58, 52],
        [72, 48],
        [88, 50],
        [102, 53],
        [66, 36],
        [94, 38],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx, sy, 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      drawAnimeFace(ctx, { mouth: 'smirk', irisColor: '#ca8a04' });
      // Translucent cyan ROOM orb on right hand
      ctx.beginPath();
      ctx.arc(126, 98, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.38)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();
      break;
    }

    case 'ace':
    case 'ace_flame': {
      const isLegend = unitId === 'ace_flame';
      if (isLegend) {
        // Giant Entei miniature sun-fireball held aloft!
        drawFlameBlob(ctx, 80, 26, 20, '#ef4444', '#fef08a');
      }
      drawBoots(ctx, '#292524', '#1c1917', 16, 134);
      drawTorso(ctx, '#ffe0c2', '#f0bc94', '#ea580c');
      // Red bead necklace on bare chest
      ctx.fillStyle = '#dc2626';
      for (let bx = 68; bx <= 92; bx += 6) {
        ctx.beginPath();
        ctx.arc(bx, 93, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#1c1917', '#0c0a09', 64);
      // Orange cowboy hat + red beads
      ctx.beginPath();
      ctx.ellipse(80, 48, 44, 11, 0, 0, Math.PI * 2);
      strokeAndFill(ctx, '#f97316', 5);
      ctx.beginPath();
      ctx.arc(80, 46, 27, Math.PI, 0);
      strokeAndFill(ctx, '#ea580c', 5);
      ctx.fillStyle = '#ef4444';
      for (let hx = 58; hx <= 102; hx += 7) {
        ctx.beginPath();
        ctx.arc(hx, 45, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      drawAnimeFace(ctx, { mouth: 'grin', freckles: true });
      drawFlameBlob(ctx, 126, 98, isLegend ? 22 : 16, '#f97316', '#fef08a');
      break;
    }

    case 'shanks': {
      // Flowing black emperor cloak behind
      ctx.beginPath();
      ctx.moveTo(48, 84);
      ctx.lineTo(28, 134);
      ctx.lineTo(132, 134);
      ctx.lineTo(112, 84);
      ctx.closePath();
      strokeAndFill(ctx, '#18181b', 5.5);
      drawHakiLightning(ctx, '#f43f5e');
      drawBoots(ctx, '#451a03', '#292524', 17, 134);
      drawTorso(ctx, '#f8fafc', '#cbd5e1', '#dc2626', 1.06);
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#dc2626', '#991b1b', 64);
      drawAnimeFace(ctx, { mouth: 'fierce', tripleLeftScar: true, irisColor: '#7f1d1d' });
      // Gryphon saber crackling with crimson Haki
      drawKatana(ctx, 116, 102, -0.7, 54, '#f43f5e', '#b45309');
      break;
    }

    case 'whitebeard': {
      // Draped white Admiral coat with gold epaulets behind
      ctx.beginPath();
      ctx.moveTo(40, 80);
      ctx.lineTo(24, 135);
      ctx.lineTo(136, 135);
      ctx.lineTo(120, 80);
      ctx.closePath();
      strokeAndFill(ctx, '#f8fafc', 5.5);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(36, 78, 16, 9);
      ctx.fillRect(108, 78, 16, 9);

      drawBoots(ctx, '#1e293b', '#0f172a', 19, 135);
      drawTorso(ctx, '#f0bc94', '#d99b6c', '#7e22ce', 1.2);
      drawChibiHead(ctx, '#ffe0c2', '#e7b38a', 62);
      // Black captain bandana
      ctx.beginPath();
      ctx.arc(80, 56, 34, Math.PI, 0);
      strokeAndFill(ctx, '#18181b', 5.2);
      drawAnimeFace(ctx, { cy: 62, mouth: 'fierce', irisColor: '#ca8a04' });
      // Iconic giant upturned white crescent mustache!
      ctx.beginPath();
      ctx.moveTo(34, 62);
      ctx.quadraticCurveTo(54, 88, 80, 80);
      ctx.quadraticCurveTo(106, 88, 126, 62);
      ctx.quadraticCurveTo(104, 76, 80, 72);
      ctx.quadraticCurveTo(56, 76, 34, 62);
      ctx.closePath();
      strokeAndFill(ctx, '#ffffff', 4.8);
      // Gura-Gura quake sphere on left fist + Murakumogiri bisento on right
      ctx.beginPath();
      ctx.arc(34, 100, 17, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(103, 232, 249, 0.45)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      drawKatana(ctx, 122, 114, -1.35, 68, '#e2e8f0', '#facc15');
      break;
    }

    default: {
      drawBoots(ctx, '#334155', '#1e293b', 15, 134);
      drawTorso(ctx, '#3b82f6', '#1d4ed8', '#facc15');
      drawChibiHead(ctx);
      drawSpikyHair(ctx, '#1e293b', '#0f172a', 64);
      drawAnimeFace(ctx, { mouth: 'grin' });
      break;
    }
  }

  ctx.restore();
}

/**
 * Paints SD Monster / Boss sprites onto an offscreen canvas (size x size).
 */
export function paintMonsterChibi(
  ctx: CanvasRenderingContext2D,
  kind: MonsterKind,
  size: number,
): void {
  ctx.save();
  const s = size / 160;
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (kind) {
    case 'marine_grunt': {
      drawBoots(ctx, '#1e293b', '#0f172a', 14, 132);
      drawTorso(ctx, '#f1f5f9', '#cbd5e1', '#2563eb', 0.92);
      drawChibiHead(ctx, '#ffe0c2', '#eab38f', 68);
      // Marine cap
      ctx.beginPath();
      ctx.arc(80, 58, 33, Math.PI, 0);
      strokeAndFill(ctx, '#ffffff', 5);
      ctx.beginPath();
      ctx.ellipse(80, 58, 35, 7, 0, 0, Math.PI);
      strokeAndFill(ctx, '#1d4ed8', 4.5);
      drawAnimeFace(ctx, { cy: 68, mouth: 'open', irisColor: '#1e293b' });
      drawKatana(ctx, 112, 104, -0.7, 34, '#cbd5e1', '#475569');
      break;
    }

    case 'pirate_raider': {
      drawBoots(ctx, '#451a03', '#292524', 15, 132);
      drawTorso(ctx, '#b91c1c', '#7f1d1d', '#eab308', 0.96);
      drawChibiHead(ctx, '#f5cba7', '#d9a477', 68);
      // Red pirate bandana + skull dot
      ctx.beginPath();
      ctx.arc(80, 58, 34, Math.PI, 0);
      strokeAndFill(ctx, '#dc2626', 5);
      ctx.beginPath();
      ctx.arc(80, 44, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      // Eye-patch over left eye
      drawAnimeFace(ctx, { cy: 68, mouth: 'fierce', leftEyeClosedScar: true });
      ctx.beginPath();
      ctx.arc(65, 73, 8.5, 0, Math.PI * 2);
      strokeAndFill(ctx, '#18181b', 3.5);
      drawKatana(ctx, 114, 104, -0.8, 38, '#e2e8f0', '#b45309');
      break;
    }

    case 'sea_king': {
      // Giant Sea King serpent boss rising out of white ocean foam!
      // Dorsal fins
      ctx.beginPath();
      ctx.moveTo(52, 34);
      ctx.lineTo(38, 12);
      ctx.lineTo(68, 22);
      ctx.lineTo(80, 6);
      ctx.lineTo(94, 22);
      ctx.lineTo(122, 12);
      ctx.lineTo(108, 34);
      ctx.closePath();
      strokeAndFill(ctx, '#f43f5e', 5);

      // Coiled serpent neck/torso
      ctx.beginPath();
      ctx.moveTo(42, 134);
      ctx.bezierCurveTo(32, 86, 42, 26, 80, 24);
      ctx.bezierCurveTo(118, 26, 128, 86, 118, 134);
      ctx.closePath();
      strokeAndFill(ctx, '#0d9488', 6);

      // Cream belly scales
      ctx.beginPath();
      ctx.ellipse(80, 102, 24, 30, 0, 0, Math.PI * 2);
      strokeAndFill(ctx, '#fef3c7', 4.5);

      // Glowing yellow dragon eyes
      drawSingleEye(ctx, 60, 54, '#facc15');
      drawSingleEye(ctx, 100, 54, '#facc15');

      // Roaring fanged jaws
      ctx.beginPath();
      ctx.roundRect(52, 68, 56, 30, 10);
      strokeAndFill(ctx, '#9f1239', 5);
      ctx.fillStyle = '#ffffff';
      for (const fx of [58, 70, 90, 102]) {
        ctx.beginPath();
        ctx.moveTo(fx - 4, 69);
        ctx.lineTo(fx, 79);
        ctx.lineTo(fx + 4, 69);
        ctx.fill();
      }

      // Sea foam collar at base
      for (const [wx, wy, wr] of [
        [40, 134, 14],
        [60, 138, 16],
        [80, 140, 17],
        [100, 138, 16],
        [120, 134, 14],
      ] as const) {
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        strokeAndFill(ctx, '#e0f2fe', 4);
      }
      break;
    }

    case 'pacifista': {
      // Hulking Cyborg Pacifista PX-0!
      drawBoots(ctx, '#18181b', '#09090b', 22, 136);
      drawTorso(ctx, '#1e293b', '#0f172a', '#f8fafc', 1.38);
      // White target rings on coat
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(64, 114, 9, 0, Math.PI * 2);
      ctx.arc(96, 114, 9, 0, Math.PI * 2);
      ctx.stroke();

      drawChibiHead(ctx, '#d6b49c', '#b69076', 58);
      // Bear-ear hat!
      ctx.beginPath();
      ctx.arc(52, 28, 11, 0, Math.PI * 2);
      ctx.arc(108, 28, 11, 0, Math.PI * 2);
      strokeAndFill(ctx, '#f8fafc', 5);
      ctx.beginPath();
      ctx.arc(80, 50, 35, Math.PI, 0);
      strokeAndFill(ctx, '#f8fafc', 5.2);

      // Glowing cyborg visor glasses
      ctx.beginPath();
      ctx.roundRect(52, 50, 24, 12, 4);
      ctx.roundRect(84, 50, 24, 12, 4);
      strokeAndFill(ctx, '#fef08a', 4);
      // Charging laser mouth & palm
      ctx.beginPath();
      ctx.arc(80, 73, 7, 0, Math.PI * 2);
      strokeAndFill(ctx, '#fde047', 3.5);
      drawFist(ctx, 132, 98, 17, '#fef08a', 'rgba(250, 204, 21, 0.55)');
      break;
    }
  }

  ctx.restore();
}
