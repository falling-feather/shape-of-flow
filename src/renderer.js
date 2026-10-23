import { MODEL } from './experiment.js';
import { sampleMAC, fluidAt } from './physics.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = document.createElement('canvas');
    this.buffer.width = MODEL.nx; this.buffer.height = MODEL.ny;
    this.bufferCtx = this.buffer.getContext('2d');
    this.image = this.bufferCtx.createImageData(MODEL.nx, MODEL.ny);
    this.frame = null; this.preview = null; this.showDye = true; this.showLines = true;
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }

  setFrame(frame, preview = null) { this.frame = frame; this.preview = preview; this.draw(); }

  draw() {
    if (!this.frame) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio); this.canvas.height = Math.round(height * ratio);
    }
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.rect = this.paint(this.ctx, this.frame, width, height, this.preview);
  }

  paint(ctx, frame, width, height, preview = null) {
    const compact = width < 600;
    const marginX = compact ? 27 : 47, marginY = compact ? 45 : 58;
    const scale = Math.min((width - 2 * marginX) / frame.width, (height - 2 * marginY) / frame.height);
    const rect = { x: (width - frame.width * scale) / 2, y: (height - frame.height * scale) / 2 - 5,
      w: frame.width * scale, h: frame.height * scale, scale };
    const { x, y, w, h } = rect;
    ctx.fillStyle = '#f8f6ef'; ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = '#e5e7dc'; ctx.lineWidth = 0.6;
    for (let i = 0; i <= 16; i++) { ctx.beginPath(); ctx.moveTo(x + i * w / 16, y); ctx.lineTo(x + i * w / 16, y + h); ctx.stroke(); }
    for (let j = 0; j <= 10; j++) { ctx.beginPath(); ctx.moveTo(x, y + j * h / 10); ctx.lineTo(x + w, y + j * h / 10); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (this.showDye) {
      const pixels = this.image.data;
      for (let k = 0; k < frame.dye.length; k++) {
        const density = Math.max(0, frame.dye[k]);
        pixels[k * 4] = 23; pixels[k * 4 + 1] = 126; pixels[k * 4 + 2] = 137;
        pixels[k * 4 + 3] = frame.solid[k] ? 0 : Math.round(Math.min(0.92, Math.pow(density, 0.62) * 0.90) * 255);
      }
      this.bufferCtx.putImageData(this.image, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.buffer, x, y, w, h);
    }
    if (this.showLines) this.streamlines(ctx, frame, rect);
    ctx.restore();
    ctx.strokeStyle = '#8fa394'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
    // Input and target marks are UI annotations, not an additional fluid field.
    ctx.strokeStyle = '#177e89'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y + MODEL.sourceMin * h); ctx.lineTo(x, y + MODEL.sourceMax * h); ctx.stroke();
    ctx.fillStyle = '#177e89';
    ctx.beginPath(); ctx.moveTo(x - 10, y + h * 0.5 - 3); ctx.lineTo(x - 4, y + h * 0.5); ctx.lineTo(x - 10, y + h * 0.5 + 3); ctx.fill();
    const gy = y + MODEL.gateMin * h, gh = (MODEL.gateMax - MODEL.gateMin) * h;
    ctx.fillStyle = '#b7653510'; ctx.fillRect(x + w - 8, gy, 15, gh);
    ctx.strokeStyle = '#b76535'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + w + 7, gy); ctx.lineTo(x + w + 7, gy + gh); ctx.moveTo(x + w + 2, gy); ctx.lineTo(x + w + 7, gy); ctx.moveTo(x + w + 2, gy + gh); ctx.lineTo(x + w + 7, gy + gh); ctx.stroke();
    ctx.font = `${compact ? 8 : 9}px "Segoe UI","Microsoft YaHei",sans-serif`;
    ctx.fillStyle = '#b76535'; ctx.textAlign = 'right'; ctx.fillText('上侧观察窗', x + w + 5, gy - 10);
    ctx.fillStyle = '#8b9d8d'; ctx.textAlign = 'left'; ctx.fillText('固定输入 A', x, y - 19);
    ctx.textAlign = 'center';
    for (let i = 0; i <= 4; i++) { ctx.fillText((i * frame.width / 4).toFixed(1), x + i * w / 4, y + h + 22); }
    const obstacle = preview || frame.obstacle;
    if (obstacle) {
      const ox = x + obstacle.x * scale, oy = y + obstacle.y * scale, radius = obstacle.radius * scale;
      ctx.save();
      if (preview) { ctx.setLineDash([4, 4]); ctx.strokeStyle = preview.valid === false ? '#b76535' : '#177e89'; ctx.fillStyle = '#177e8912'; }
      else { ctx.strokeStyle = '#142c3a'; ctx.fillStyle = '#183745'; ctx.shadowColor = '#142c3a14'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 4; }
      ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(ox, oy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = preview ? '#177e89' : '#a5bbb9'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(ox - 5, oy); ctx.lineTo(ox + 5, oy); ctx.moveTo(ox, oy - 5); ctx.lineTo(ox, oy + 5); ctx.stroke();
      ctx.fillStyle = preview ? '#177e89' : '#6f8277'; ctx.font = `${compact ? 8 : 9}px "Segoe UI","Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center'; ctx.fillText(preview ? '拖动 · 调整边界' : '静态阻片', ox, oy + radius + 17);
    }
    ctx.restore();
    return rect;
  }

  streamlines(ctx, frame, rect) {
    const gridH = frame.height / frame.ny;
    const sample = (x, y) => [sampleMAC(frame.u, frame.nx, frame.ny, gridH, x, y, 'u'), sampleMAC(frame.v, frame.nx, frame.ny, gridH, x, y, 'v')];
    const valid = (x, y) => fluidAt(frame.solid, frame.nx, frame.ny, frame.width, frame.height, x, y);
    const lineCount = rect.w < 600 ? 31 : 49;
    for (let n = 1; n < lineCount; n++) {
      let x = gridH * 0.06, y = n / lineCount;
      const sourceLine = y >= MODEL.sourceMin && y <= MODEL.sourceMax;
      ctx.beginPath(); ctx.moveTo(rect.x + x * rect.scale, rect.y + y * rect.scale);
      for (let k = 0; k < 300; k++) {
        const [vx, vy] = sample(x, y), speed = Math.hypot(vx, vy);
        if (speed < 0.002) break;
        const ds = gridH * 0.44;
        const midX = x + vx / speed * ds * 0.5, midY = y + vy / speed * ds * 0.5;
        if (!valid(midX, midY)) break;
        const [mx, my] = sample(midX, midY), magnitude = Math.hypot(mx, my);
        if (magnitude < 0.002) break;
        x += mx / magnitude * ds; y += my / magnitude * ds;
        if (!valid(x, y)) break;
        ctx.lineTo(rect.x + x * rect.scale, rect.y + y * rect.scale);
      }
      ctx.strokeStyle = sourceLine ? '#12697655' : '#72968828';
      ctx.lineWidth = sourceLine ? 1.0 : 0.6;
      ctx.stroke();
    }
  }

  point(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    return { x: (clientX - bounds.left - this.rect.x) / this.rect.scale,
      y: (clientY - bounds.top - this.rect.y) / this.rect.scale };
  }

  exportCanvas(frame, id) {
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1150;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#142c3a'; ctx.font = '37px "SimSun",serif'; ctx.fillText('涡的形状  /  绕流', 70, 76);
    ctx.font = '12px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#7a8c7b';
    ctx.textAlign = 'right'; ctx.fillText('以边界塑形，让流动留下作品。', 1530, 72); ctx.textAlign = 'left';
    ctx.save(); ctx.translate(30, 110); this.paint(ctx, frame, 1540, 920); ctx.restore();
    const d = frame.diagnostics;
    ctx.font = '14px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#536e61';
    ctx.fillText(`B · 静态边界 (${frame.obstacle.x.toFixed(2)}, ${frame.obstacle.y.toFixed(2)})  /  t = ${d.time.toFixed(2)}  /  上侧到达 ${(d.gateOut / Math.max(d.injected, 1e-12) * 100).toFixed(1)}%`, 72, 1064);
    ctx.font = '11px "Segoe UI","Microsoft YaHei",sans-serif'; ctx.fillStyle = '#8b998b';
    const layers = [this.showDye ? '染色' : '', this.showLines ? '瞬时流线' : ''].filter(Boolean).join('与') || '边界';
    ctx.fillText(`作品编号 ${id} · ${frame.nx}×${frame.ny} MAC · Δt ${MODEL.dt.toPrecision(3)} · ${layers} · 二维数值近似，非工程预测`, 72, 1100);
    return canvas;
  }
}
