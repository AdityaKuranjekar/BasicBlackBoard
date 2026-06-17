import type { Point, CanvasElement, FreedrawElement, ShapeElement } from '../types';

export function renderElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement
): void {
  ctx.save();
  ctx.strokeStyle = element.strokeColor;
  ctx.fillStyle   = element.type === 'freedraw' ? element.strokeColor : ((element as ShapeElement).fillColor || 'transparent');
  ctx.lineWidth   = element.strokeWidth;
  ctx.lineJoin    = 'round';
  ctx.lineCap     = 'round';

  if (element.type === 'freedraw') {
    renderFreedraw(ctx, element as FreedrawElement);
  } else if (element.type === 'rectangle') {
    ctx.strokeRect(element.x, element.y, element.width, element.height);
    if ((element as ShapeElement).fillColor) {
      ctx.fillRect(element.x, element.y, element.width, element.height);
    }
  } else if (element.type === 'ellipse') {
    ctx.beginPath();
    const rx = Math.abs(element.width / 2);
    const ry = Math.abs(element.height / 2);
    ctx.ellipse(element.x + element.width / 2, element.y + element.height / 2, rx, ry, 0, 0, Math.PI * 2);
    if ((element as ShapeElement).fillColor) ctx.fill();
    ctx.stroke();
  } else if (element.type === 'line' || element.type === 'arrow') {
    ctx.beginPath();
    ctx.moveTo(element.x, element.y);
    ctx.lineTo(element.x + element.width, element.y + element.height);
    ctx.stroke();
    
    if (element.type === 'arrow') {
      const angle = Math.atan2(element.height, element.width);
      const headlen = 15;
      ctx.beginPath();
      ctx.moveTo(element.x + element.width, element.y + element.height);
      ctx.lineTo(element.x + element.width - headlen * Math.cos(angle - Math.PI / 6), element.y + element.height - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(element.x + element.width, element.y + element.height);
      ctx.lineTo(element.x + element.width - headlen * Math.cos(angle + Math.PI / 6), element.y + element.height - headlen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderFreedraw(ctx: CanvasRenderingContext2D, element: FreedrawElement) {
  const { points, x, y, strokeWidth } = element;
  if (points.length === 0) return;

  if (points.length === 1) {
    const p = points[0];
    const radius = (strokeWidth * (0.5 + p.pressure * 0.5)) / 2;
    ctx.beginPath();
    ctx.arc(x + p.x, y + p.y, Math.max(radius, 0.5), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const avgPressure = points.reduce((sum: number, p: Point) => sum + p.pressure, 0) / points.length;
  ctx.lineWidth = strokeWidth * (0.5 + avgPressure * 0.5);

  ctx.beginPath();
  if (points.length === 2) {
    ctx.moveTo(x + points[0].x, y + points[0].y);
    ctx.lineTo(x + points[1].x, y + points[1].y);
  } else {
    const startMidX = x + (points[0].x + points[1].x) / 2;
    const startMidY = y + (points[0].y + points[1].y) / 2;
    ctx.moveTo(x + points[0].x, y + points[0].y);
    ctx.lineTo(startMidX, startMidY);

    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const midX = x + (curr.x + next.x) / 2;
      const midY = y + (curr.y + next.y) / 2;
      ctx.quadraticCurveTo(x + curr.x, y + curr.y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(x + last.x, y + last.y);
  }
  ctx.stroke();
}

export function renderActiveElement(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement
): void {
  renderElement(ctx, element);
}

export function renderSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  element: CanvasElement
): void {
  const { x, y, width, height } = element;
  const padding = 8;
  const bx = x - padding;
  const by = y - padding;
  const bw = width + padding * 2;
  const bh = height + padding * 2;

  ctx.save();
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(bx, by, bw, bh);

  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#2196F3';
  ctx.lineWidth = 2;

  const handleSize = 8;
  const drawHandle = (hx: number, hy: number) => {
    ctx.fillRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
    ctx.strokeRect(hx - handleSize/2, hy - handleSize/2, handleSize, handleSize);
  };

  drawHandle(bx, by);
  drawHandle(bx + bw/2, by);
  drawHandle(bx + bw, by);
  drawHandle(bx, by + bh/2);
  drawHandle(bx + bw, by + bh/2);
  drawHandle(bx, by + bh);
  drawHandle(bx + bw/2, by + bh);
  drawHandle(bx + bw, by + bh);

  ctx.restore();
}
