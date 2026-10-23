import { MODEL, sourceFraction } from './experiment.js';

const profileIntegral = (from, to) => (2 * to * to - 4 / 3 * to ** 3) - (2 * from * from - 4 / 3 * from ** 3);

export function sampleMAC(array, nx, ny, h, x, y, component) {
  const isU = component === 'u', width = isU ? nx + 1 : nx, height = isU ? ny : ny + 1;
  const gx = Math.max(0, Math.min(width - 1, x / h - (isU ? 0 : 0.5)));
  const gy = Math.max(0, Math.min(height - 1, y / h - (isU ? 0.5 : 0)));
  const i = Math.floor(gx), j = Math.floor(gy), right = Math.min(i + 1, width - 1), bottom = Math.min(j + 1, height - 1);
  const tx = gx - i, ty = gy - j;
  return (1 - ty) * ((1 - tx) * array[j * width + i] + tx * array[j * width + right])
    + ty * ((1 - tx) * array[bottom * width + i] + tx * array[bottom * width + right]);
}

export function fluidAt(solid, nx, ny, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  return !solid[Math.floor(y / height * ny) * nx + Math.floor(x / width * nx)];
}

/**
 * Uniform staggered (MAC) grid. u/v are face velocities, p/dye cell scalars.
 * Static solids close faces in the same operator used by divergence, pressure
 * and conservative dye flux. Pressure outlet: p=0 at the right boundary.
 * CPU arithmetic is Float64; transferred display snapshots use Float32.
 */
export class Fluid {
  constructor(config = MODEL, obstacle = null) {
    this.config = { ...config };
    const { nx, ny, width, height } = config;
    if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 8 || ny < 8
      || Math.abs(width / nx - height / ny) > 1e-10) throw new Error('模型需要等间距网格。');
    this.nx = nx; this.ny = ny; this.h = height / ny;
    this.obstacle = obstacle ? { ...obstacle } : null;
    const n = nx * ny;
    this.u = new Float64Array((nx + 1) * ny);
    this.v = new Float64Array(nx * (ny + 1));
    this.uNext = new Float64Array(this.u.length);
    this.vNext = new Float64Array(this.v.length);
    this.dye = new Float64Array(n); this.dyeNext = new Float64Array(n);
    this.solid = new Uint8Array(n);
    this.uOpen = new Uint8Array(this.u.length);
    this.vOpen = new Uint8Array(this.v.length);
    this.p = new Float64Array(n);
    this.r = new Float64Array(n); this.z = new Float64Array(n);
    this.direction = new Float64Array(n); this.ap = new Float64Array(n);
    this.rhs = new Float64Array(n); this.diag = new Float64Array(n);
    this.neighbors = Array.from({ length: 4 }, () => new Int32Array(n).fill(-1));
    this.cells = [];
    this.stepCount = 0; this.injected = 0; this.outflow = 0; this.gateOut = 0;
    this.inletProfile = new Float64Array(ny);
    this.sourceWeights = new Float64Array(ny);
    this.gateWeights = new Float64Array(ny);
    for (let j = 0; j < ny; j++) {
      const lower = j * this.h, upper = (j + 1) * this.h;
      const integral = profileIntegral(lower, upper);
      this.inletProfile[j] = integral / this.h;
      const from = Math.max(lower, config.sourceMin), to = Math.min(upper, config.sourceMax);
      this.sourceWeights[j] = to > from ? profileIntegral(from, to) / integral : 0;
      this.gateWeights[j] = Math.max(0, Math.min(upper, config.gateMax) - Math.max(lower, config.gateMin)) / this.h;
    }
    this.projectionBefore = 0; this.pressureIterations = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (obstacle && Math.hypot((i + 0.5) * this.h - obstacle.x, (j + 0.5) * this.h - obstacle.y) < obstacle.radius) {
        this.solid[k] = 1;
      } else this.cells.push(k);
    }
    const fluid = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && !this.solid[j * nx + i];
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
      this.uOpen[j * (nx + 1) + i] = (i === 0 ? fluid(0, j) : i === nx ? fluid(nx - 1, j) : fluid(i - 1, j) && fluid(i, j)) ? 1 : 0;
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      this.vOpen[j * nx + i] = fluid(i, j - 1) && fluid(i, j) ? 1 : 0;
    }
    for (const k of this.cells) {
      const i = k % nx, j = Math.floor(k / nx);
      const positions = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      positions.forEach(([x, y], d) => {
        if (fluid(x, y)) { this.neighbors[d][k] = y * nx + x; this.diag[k]++; }
      });
      // Outlet pressure is half a cell from the final pressure sample.
      if (i === nx - 1) this.diag[k] += 2;
    }
    this.cells = Int32Array.from(this.cells);
  }

  get time() { return this.stepCount * this.config.dt; }

  enforceBoundaries(time, extrapolateOutlet = false) {
    const { nx, ny, h, u, v, config } = this;
    for (let k = 0; k < u.length; k++) if (!this.uOpen[k]) u[k] = 0;
    for (let k = 0; k < v.length; k++) if (!this.vOpen[k]) v[k] = 0;
    const ramp = Math.min(1, time / config.inletRamp);
    const amplitude = config.inletSpeed * ramp * ramp * (3 - 2 * ramp);
    for (let j = 0; j < ny; j++) {
      u[j * (nx + 1)] = amplitude * this.inletProfile[j];
      if (extrapolateOutlet) u[j * (nx + 1) + nx] = u[j * (nx + 1) + nx - 1];
    }
  }

  isFluid(x, y) {
    return fluidAt(this.solid, this.nx, this.ny, this.config.width, this.config.height, x, y);
  }

  sampleComponent(array, x, y, component) {
    return sampleMAC(array, this.nx, this.ny, this.h, x, y, component);
  }

  traceBack(x, y, vx, vy) {
    const dx = -this.config.dt * vx, dy = -this.config.dt * vy;
    const count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (0.4 * this.h)));
    let px = x, py = y;
    for (let n = 1; n <= count; n++) {
      const qx = x + dx * n / count, qy = y + dy * n / count;
      if (!this.isFluid(qx, qy)) return [px, py];
      px = qx; py = qy;
    }
    return [px, py];
  }

  advectVelocity() {
    const { nx, ny, h, u, v, uNext, vNext } = this;
    uNext.fill(0); vNext.fill(0);
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const k = j * (nx + 1) + i;
      if (!this.uOpen[k]) continue;
      const x = i * h, y = (j + 0.5) * h;
      const [px, py] = this.traceBack(x, y, u[k], this.sampleComponent(v, x, y, 'v'));
      uNext[k] = this.sampleComponent(u, px, py, 'u');
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!this.vOpen[k]) continue;
      const x = (i + 0.5) * h, y = j * h;
      const [px, py] = this.traceBack(x, y, this.sampleComponent(u, x, y, 'u'), v[k]);
      vNext[k] = this.sampleComponent(v, px, py, 'v');
    }
    for (let j = 0; j < ny; j++) {
      uNext[j * (nx + 1)] = u[j * (nx + 1)];
      uNext[j * (nx + 1) + nx] = u[j * (nx + 1) + nx];
    }
    [this.u, this.uNext] = [uNext, u];
    [this.v, this.vNext] = [vNext, v];
  }

  diffuseVelocity() {
    const { nx, ny, u, v, uNext, vNext, h } = this;
    const alpha = this.config.viscosity * this.config.dt / (h * h);
    if (alpha > 0.25) throw new Error('黏性显式步长超出稳定范围。');
    uNext.set(u); vNext.set(v);
    for (let j = 0; j < ny; j++) for (let i = 1; i < nx; i++) {
      const k = j * (nx + 1) + i;
      if (!this.uOpen[k]) continue;
      const top = j > 0 && this.uOpen[k - nx - 1] ? u[k - nx - 1] : -u[k];
      const bottom = j < ny - 1 && this.uOpen[k + nx + 1] ? u[k + nx + 1] : -u[k];
      uNext[k] = u[k] + alpha * (u[k - 1] + u[k + 1] + top + bottom - 4 * u[k]);
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!this.vOpen[k]) continue;
      const left = i > 0 && this.vOpen[k - 1] ? v[k - 1] : -v[k];
      const right = i === nx - 1 ? v[k] : this.vOpen[k + 1] ? v[k + 1] : -v[k];
      vNext[k] = v[k] + alpha * (v[k - nx] + v[k + nx] + left + right - 4 * v[k]);
    }
    [this.u, this.uNext] = [uNext, u];
    [this.v, this.vNext] = [vNext, v];
  }

  divergenceNorm() {
    const { nx, u, v, h } = this;
    let sum = 0;
    for (const k of this.cells) {
      const i = k % nx, j = Math.floor(k / nx), ui = j * (nx + 1) + i;
      const divergence = (u[ui + 1] - u[ui] + v[k + nx] - v[k]) / h;
      sum += divergence * divergence;
    }
    return Math.sqrt(sum / this.cells.length);
  }

  applyMatrix(input, output) {
    const [left, right, top, bottom] = this.neighbors;
    for (const k of this.cells) {
      let value = this.diag[k] * input[k];
      if (left[k] >= 0) value -= input[left[k]];
      if (right[k] >= 0) value -= input[right[k]];
      if (top[k] >= 0) value -= input[top[k]];
      if (bottom[k] >= 0) value -= input[bottom[k]];
      output[k] = value;
    }
  }

  project() {
    const { nx, ny, u, v, p, r, z, direction, ap, rhs, diag, config } = this;
    for (const k of this.cells) {
      const i = k % nx, j = Math.floor(k / nx), ui = j * (nx + 1) + i;
      rhs[k] = -(u[ui + 1] - u[ui] + v[k + nx] - v[k]);
    }
    this.applyMatrix(p, ap);
    let rz = 0, norm = 0;
    for (const k of this.cells) {
      r[k] = rhs[k] - ap[k]; z[k] = r[k] / diag[k]; direction[k] = z[k];
      rz += r[k] * z[k]; norm += r[k] * r[k];
    }
    const tolerance = config.pressureTolerance * config.pressureTolerance * this.cells.length;
    let iteration = 0;
    for (; iteration < config.pressureIterations && norm > tolerance; iteration++) {
      this.applyMatrix(direction, ap);
      let denominator = 0;
      for (const k of this.cells) denominator += direction[k] * ap[k];
      if (!(denominator > 0)) throw new Error('压力矩阵失去正定性，计算已停止。');
      const alpha = rz / denominator;
      let nextRz = 0; norm = 0;
      for (const k of this.cells) {
        p[k] += alpha * direction[k]; r[k] -= alpha * ap[k];
        z[k] = r[k] / diag[k]; nextRz += r[k] * z[k]; norm += r[k] * r[k];
      }
      const beta = nextRz / rz;
      for (const k of this.cells) direction[k] = z[k] + beta * direction[k];
      rz = nextRz;
    }
    this.pressureIterations = iteration;
    for (let j = 0; j < ny; j++) for (let i = 1; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      if (!this.uOpen[k]) continue;
      const left = p[j * nx + i - 1];
      u[k] -= i === nx ? -2 * left : p[j * nx + i] - left;
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (this.vOpen[k]) v[k] -= p[k] - p[k - nx];
    }
  }

  transportDye() {
    const { nx, ny, h, u, v, dye, dyeNext, config } = this;
    const scale = config.dt / h;
    dyeNext.set(dye);
    const activeSource = sourceFraction(this.time, config.dt);
    let maxOutgoing = 0;
    for (const k of this.cells) {
      const i = k % nx, j = Math.floor(k / nx), ui = j * (nx + 1) + i;
      maxOutgoing = Math.max(maxOutgoing, scale * (Math.max(0, u[ui + 1]) + Math.max(0, -u[ui]) + Math.max(0, v[k + nx]) + Math.max(0, -v[k])));
    }
    if (maxOutgoing > 0.95) throw new Error('示踪输运步长超出 CFL 范围，计算已停止。');
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) {
      const face = j * (nx + 1) + i;
      if (!this.uOpen[face]) continue;
      const speed = u[face];
      const outside = activeSource * this.sourceWeights[j];
      const upstream = speed >= 0 ? i === 0 ? outside : dye[j * nx + i - 1] : i === nx ? 0 : dye[j * nx + i];
      const transfer = scale * speed * upstream;
      if (i > 0) dyeNext[j * nx + i - 1] -= transfer;
      if (i < nx) dyeNext[j * nx + i] += transfer;
      const mass = transfer * h * h;
      if (i === 0) this.injected += mass;
      if (i === nx) {
        this.outflow += mass;
        this.gateOut += mass * this.gateWeights[j];
      }
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const face = j * nx + i;
      if (!this.vOpen[face]) continue;
      const transfer = scale * v[face] * (v[face] >= 0 ? dye[face - nx] : dye[face]);
      dyeNext[face - nx] -= transfer; dyeNext[face] += transfer;
    }
    [this.dye, this.dyeNext] = [dyeNext, dye];
  }

  step() {
    this.advectVelocity();
    this.diffuseVelocity();
    this.enforceBoundaries(this.time + this.config.dt, true);
    this.projectionBefore = this.divergenceNorm();
    this.project();
    this.transportDye();
    this.stepCount++;
  }

  diagnostics() {
    let remaining = 0, finite = true, wallFlux = 0;
    for (const value of this.dye) { remaining += value * this.h * this.h; if (!Number.isFinite(value)) finite = false; }
    for (let k = 0; k < this.u.length; k++) {
      if (!Number.isFinite(this.u[k])) finite = false;
      if (!this.uOpen[k]) wallFlux = Math.max(wallFlux, Math.abs(this.u[k]));
    }
    for (let k = 0; k < this.v.length; k++) {
      if (!Number.isFinite(this.v[k])) finite = false;
      if (!this.vOpen[k]) wallFlux = Math.max(wallFlux, Math.abs(this.v[k]));
    }
    return { step: this.stepCount, time: this.time, injected: this.injected,
      outflow: this.outflow, gateOut: this.gateOut, remaining,
      massError: Math.abs(this.injected - this.outflow - remaining) / Math.max(this.injected, 1e-12),
      divergence: this.divergenceNorm(), projectionBefore: this.projectionBefore,
      pressureIterations: this.pressureIterations, wallFlux, finite };
  }

  snapshot() {
    return { nx: this.nx, ny: this.ny, width: this.config.width, height: this.config.height,
      obstacle: this.obstacle, dye: Float32Array.from(this.dye), u: Float32Array.from(this.u),
      v: Float32Array.from(this.v), solid: this.solid.slice(), diagnostics: this.diagnostics() };
  }
}
