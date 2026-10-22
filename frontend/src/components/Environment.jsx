import { useEffect, useRef } from 'react'
import useReducedMotion from '../hooks/useReducedMotion.js'
import './Environment.css'

// One shared, persistent environment for every screen. It never remounts between landing,
// upload and workspace, so cells keep drifting and the maze keeps pulsing across transitions;
// only the stage-specific composition (maze routes, cell size/opacity, HUD grid) eases.
//   1. paper base + two very faint atmospheric washes
//   2. an active "decision network": hairline rounded routes that pulse, an occasional route
//      that lights up, travelling signals, two parallax layers
//   3. cells: five soft-bodied cells (three lavender, one teal, one coral) that drift
//      and rebound off the viewport edge, squashing against it and springing back
//   4. workspace only: a faint HUD grid and smaller, quieter cells
// Decorative only: aria-hidden, pointer-events none. Reduced motion: no physics loop, no
// travelling signals, CSS animations off.

function mulberry32(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function blobPath(cx, cy, radius, rand, points = 9, wobble = 0.24) {
  const pts = Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2
    const r = radius * (1 - wobble / 2 + rand() * wobble)
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]
  })
  const f = (n) => n.toFixed(1)
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < points; i += 1) {
    const p0 = pts[(i - 1 + points) % points]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % points]
    const p3 = pts[(i + 2) % points]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C ${f(c1[0])} ${f(c1[1])}, ${f(c2[0])} ${f(c2[1])}, ${f(p2[0])} ${f(p2[1])}`
  }
  return `${d} Z`
}

function roundedPath(points, r) {
  const f = (n) => n.toFixed(1)
  let d = `M ${f(points[0][0])} ${f(points[0][1])}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const inLen = Math.hypot(cx - px, cy - py)
    const outLen = Math.hypot(nx - cx, ny - cy)
    const rad = Math.min(r, inLen / 2, outLen / 2)
    d += ` L ${f(cx - ((cx - px) / inLen) * rad)} ${f(cy - ((cy - py) / inLen) * rad)} Q ${f(cx)} ${f(cy)} ${f(cx + ((nx - cx) / outLen) * rad)} ${f(cy + ((ny - cy) / outLen) * rad)}`
  }
  const last = points[points.length - 1]
  return `${d} L ${f(last[0])} ${f(last[1])}`
}

// ---------- Maze ----------
// Routes live in a 1600 x 900 space. layer: far | near (parallax). Flags:
//   pulse   line opacity breathes      light   a pulse of light runs along it now and then
//   trace   slow accent segment        signal  a small dot travels along it (not under reduced motion)
//   breathe end slowly extends/retracts   tint  ink | peri | coral
const MAZES = {
  landing: [
    { layer: 'far', trace: true, light: 0, r: 48, pts: [[-20, 210], [420, 210], [420, 120], [820, 120], [820, 300], [1180, 300], [1180, 190], [1640, 190]], signal: 30 },
    { layer: 'near', breathe: true, tint: 'peri', pulse: 0, r: 46, pts: [[-20, 720], [260, 720], [260, 820], [600, 820], [600, 720], [1000, 720]], signal: 36 },
    { layer: 'far', pulse: 3, light: 9, r: 44, pts: [[1010, 930], [1010, 760], [1330, 760], [1330, 540], [1640, 540]] },
    { layer: 'near', pulse: 6, r: 40, pts: [[260, 720], [260, 560], [90, 560]] },
    { layer: 'far', light: 15, r: 40, pts: [[1180, 300], [1180, 430], [1470, 430], [1470, 330]], signal: 42 },
    { layer: 'far', pulse: 2, r: 30, pts: [[560, -20], [560, 56], [700, 56]] },
    { layer: 'near', tint: 'peri', pulse: 8, r: 36, pts: [[-20, 420], [120, 420], [120, 330], [230, 330]] },
  ],
  select: [
    { layer: 'far', trace: true, light: 4, r: 48, pts: [[1640, 110], [1360, 110], [1360, 270], [1490, 270], [1490, 430], [1640, 430]], signal: 32 },
    { layer: 'near', pulse: 0, r: 44, pts: [[-20, 170], [190, 170], [190, 340], [60, 340], [60, 570], [-20, 570]] },
    { layer: 'far', breathe: true, tint: 'peri', r: 46, pts: [[1640, 720], [1400, 720], [1400, 830], [1170, 830], [1170, 930]], signal: 38 },
    { layer: 'near', pulse: 5, light: 12, r: 40, pts: [[-20, 790], [230, 790], [230, 660], [390, 660]] },
    { layer: 'far', pulse: 2, r: 36, pts: [[1360, 270], [1360, 410], [1240, 410]] },
    { layer: 'near', tint: 'peri', pulse: 7, r: 40, pts: [[700, 930], [700, 860], [960, 860]] },
  ],
  // Workspace: a denser, circuit-like network with more active signals.
  workspace: [
    { layer: 'far', pulse: 0, r: 44, pts: [[-20, 870], [300, 870], [300, 790], [700, 790]], signal: 24 },
    { layer: 'far', trace: true, r: 44, pts: [[520, 930], [520, 850], [980, 850], [980, 760], [1180, 760]], signal: 28 },
    { layer: 'near', breathe: true, tint: 'peri', r: 40, pts: [[1640, 870], [1400, 870], [1400, 780]], signal: 26 },
    { layer: 'far', pulse: 3, r: 46, pts: [[-20, 520], [140, 520], [140, 640], [40, 640], [40, 720]] },
    { layer: 'near', light: 5, r: 42, pts: [[620, 930], [620, 700], [840, 700], [840, 600]], signal: 34 },
    { layer: 'far', pulse: 6, r: 40, pts: [[1640, 330], [1500, 330], [1500, 450], [1380, 450]], signal: 30 },
    { layer: 'near', light: 11, tint: 'peri', r: 38, pts: [[1100, 930], [1100, 840], [1260, 840]] },
    { layer: 'far', pulse: 8, r: 34, pts: [[300, 790], [300, 660], [420, 660]] },
    { layer: 'near', pulse: 1, r: 36, pts: [[900, -20], [900, 40], [1100, 40], [1100, 110]], signal: 40 },
    { layer: 'far', light: 18, r: 36, pts: [[-20, 60], [150, 60], [150, 130], [260, 130]] },
  ],
}

const MAZE_PATHS = Object.fromEntries(
  Object.entries(MAZES).map(([stage, routes]) => [stage, routes.map((route) => ({ ...route, d: roundedPath(route.pts, route.r) }))]),
)

const MAZE_NODES = {
  landing: [{ x: 420, y: 210, c: 'peri' }, { x: 1180, y: 300, c: 'coral' }, { x: 260, y: 720, c: 'peri' }],
  select: [{ x: 1360, y: 270, c: 'peri' }, { x: 190, y: 340, c: 'coral' }],
  workspace: [{ x: 300, y: 790, c: 'peri' }, { x: 840, y: 700, c: 'coral' }, { x: 140, y: 520, c: 'peri' }, { x: 1500, y: 330, c: 'peri' }],
}

// One route that draws across the screen on Get Started (once per sweepToken).
const SWEEP_D = roundedPath([[-20, 520], [380, 520], [380, 400], [860, 400], [860, 600], [1240, 600], [1240, 470], [1640, 470]], 60)

// ---------- Cells ----------
// x / y: starting position as a fraction of the viewport. depth scales speed and size.
const CELL_SPECS = [
  { id: 'a', hue: 'purple', size: 112, depth: 1.0, x: 0.84, y: 0.22, seed: 3 },
  { id: 'b', hue: 'purple', size: 80, depth: 0.8, x: 0.1, y: 0.76, seed: 7 },
  { id: 'c', hue: 'purple', size: 54, depth: 0.6, x: 0.68, y: 0.84, seed: 13 },
  { id: 'd', hue: 'teal', size: 74, depth: 0.85, x: 0.3, y: 0.2, seed: 19 },
  { id: 'e', hue: 'coral', size: 62, depth: 0.7, x: 0.9, y: 0.62, seed: 23 },
]

const CELL_ART = CELL_SPECS.map((spec) => {
  const rand = mulberry32(spec.seed)
  return {
    ...spec,
    membrane: blobPath(100, 100, 86, rand),
    inner: blobPath(100, 100, 64, rand, 8, 0.3),
    nucleus: blobPath(106, 96, 26, rand, 7, 0.28),
    organelles: Array.from({ length: 4 }, (_, i) => {
      const angle = rand() * Math.PI * 2
      const dist = 18 + rand() * 38
      return { cx: 100 + Math.cos(angle) * dist, cy: 100 + Math.sin(angle) * dist, r: 2 + rand() * 2.6, accent: i === 0 }
    }),
  }
})

// Per-stage body scale and speed factor (eased, so entering a stage never snaps).
const STAGE_CELLS = {
  landing: { scale: 1, speed: 1 },
  select: { scale: 0.92, speed: 0.9 },
  workspace: { scale: 0.55, speed: 0.5 },
}

// Soft-wall physics tuning.
const WALL_STIFFNESS = 9 // pushes a cell back once its edge crosses the viewport edge
const WALL_DAMPING = 2.2 // bleeds speed while pressed against the wall: a rebound, not a bounce
const MEMBRANE_K = 70 // membrane spring
const MEMBRANE_C = 7.5 // membrane damping (underdamped: it overshoots into a brief stretch)

function Environment({ stage, sweepToken }) {
  const reduced = useReducedMotion()
  const stageRef = useRef(stage)
  const cellRefs = useRef([])
  const bodiesRef = useRef(null)
  stageRef.current = stage

  useEffect(() => {
    const W0 = window.innerWidth
    const H0 = window.innerHeight
    // Bodies persist across stages and re-renders; they are created once.
    if (!bodiesRef.current) {
      bodiesRef.current = CELL_ART.map((cell, index) => {
        const rand = mulberry32(cell.seed * 31 + index)
        const heading = rand() * Math.PI * 2
        return {
          x: cell.x * W0,
          y: cell.y * H0,
          vx: Math.cos(heading) * 14 * cell.depth,
          vy: Math.sin(heading) * 14 * cell.depth,
          scale: STAGE_CELLS[stageRef.current].scale,
          speed: STAGE_CELLS[stageRef.current].speed,
          // membrane deformation per world axis (+ = squashed, - = stretched) and its velocity
          dx: 0, dy: 0, dvx: 0, dvy: 0,
          spin: (rand() - 0.5) * 6,
          angle: rand() * 360,
          wandering: rand() * 6.28,
          wasInX: 0,
          wasInY: 0,
        }
      })
    }
    const bodies = bodiesRef.current
    let width = W0
    let height = H0
    let raf = 0
    let last = 0

    function paint(index) {
      const el = cellRefs.current[index]
      if (!el) return
      const body = bodies[index]
      const base = CELL_ART[index].size
      // world-axis squash/stretch: translate, then non-uniform scale, then the cell's own rotation
      const sx = Math.max(0.5, 1 - body.dx + body.dy * 0.45)
      const sy = Math.max(0.5, 1 - body.dy + body.dx * 0.45)
      const size = base * body.scale
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.style.transform = `translate3d(${(body.x - size / 2).toFixed(1)}px, ${(body.y - size / 2).toFixed(1)}px, 0) scale(${sx.toFixed(3)}, ${sy.toFixed(3)}) rotate(${body.angle.toFixed(1)}deg)`
    }

    function step(now) {
      raf = 0
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const target = STAGE_CELLS[stageRef.current] ?? STAGE_CELLS.landing

      bodies.forEach((body, index) => {
        const art = CELL_ART[index]
        body.scale += (target.scale - body.scale) * Math.min(1, dt * 1.6)
        body.speed += (target.speed - body.speed) * Math.min(1, dt * 1.6)
        const radius = (art.size * body.scale) / 2

        // organic steering: the heading wanders slowly, speed stays in a calm range
        body.wandering += dt * (0.25 + art.depth * 0.2)
        body.vx += Math.cos(body.wandering * 1.3 + index) * 3.2 * dt
        body.vy += Math.sin(body.wandering * 1.1 + index * 2) * 3.2 * dt
        const speed = Math.hypot(body.vx, body.vy) || 1
        const wanted = Math.min(Math.max(speed, 9 * art.depth), 20 * art.depth) * body.speed
        body.vx *= (wanted / speed)
        body.vy *= (wanted / speed)

        // soft walls: penetration past the viewport edge pushes back, damped, and drives the membrane
        let penX = 0
        let penY = 0
        if (body.x - radius < 0) penX = radius - body.x
        else if (body.x + radius > width) penX = -(body.x + radius - width)
        if (body.y - radius < 0) penY = radius - body.y
        else if (body.y + radius > height) penY = -(body.y + radius - height)

        if (penX !== 0) {
          body.vx += penX * WALL_STIFFNESS * dt
          body.vx *= 1 - Math.min(0.9, WALL_DAMPING * dt)
          if (!body.wasInX) body.dvx += Math.min(1.4, Math.abs(body.vx) / 20) // impact kick
        }
        if (penY !== 0) {
          body.vy += penY * WALL_STIFFNESS * dt
          body.vy *= 1 - Math.min(0.9, WALL_DAMPING * dt)
          if (!body.wasInY) body.dvy += Math.min(1.4, Math.abs(body.vy) / 20)
        }
        body.wasInX = penX !== 0 ? 1 : 0
        body.wasInY = penY !== 0 ? 1 : 0
        // keep it from ever leaving the screen entirely
        body.x = Math.min(Math.max(body.x + body.vx * dt, radius * 0.1), width - radius * 0.1)
        body.y = Math.min(Math.max(body.y + body.vy * dt, radius * 0.1), height - radius * 0.1)

        // membrane: damped spring toward the penetration-driven target (squash), springing back
        const targetX = Math.min(0.34, (Math.abs(penX) / Math.max(radius, 1)) * 1.4)
        const targetY = Math.min(0.34, (Math.abs(penY) / Math.max(radius, 1)) * 1.4)
        body.dvx += (-MEMBRANE_K * (body.dx - targetX) - MEMBRANE_C * body.dvx) * dt
        body.dvy += (-MEMBRANE_K * (body.dy - targetY) - MEMBRANE_C * body.dvy) * dt
        body.dx += body.dvx * dt
        body.dy += body.dvy * dt
        body.angle += body.spin * dt

        paint(index)
      })

      raf = requestAnimationFrame(step)
    }

    function onResize() {
      width = window.innerWidth
      height = window.innerHeight
      bodies.forEach((_, index) => paint(index))
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf && !reduced) {
        last = performance.now()
        raf = requestAnimationFrame(step)
      }
    }

    bodies.forEach((_, index) => paint(index))
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    if (!reduced) {
      last = performance.now()
      raf = requestAnimationFrame(step)
    }

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [reduced])

  return (
    <div className="env" data-stage={stage} aria-hidden="true">
      <div className="env-wash env-wash-a" />
      <div className="env-wash env-wash-b" />
      <div className="env-grid" />

      <svg className="env-maze" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
        {Object.keys(MAZE_PATHS).map((name) => (
          <g key={name} className={`maze maze-${name}`}>
            {['far', 'near'].map((layer) => (
              <g key={layer} className={`maze-layer maze-layer-${layer}`}>
                {MAZE_PATHS[name].filter((route) => route.layer === layer).map((route, index) => (
                  <g key={index}>
                    <path
                      className={`maze-line tint-${route.tint ?? 'ink'}${route.pulse !== undefined ? ' is-pulsing' : ''}`}
                      style={route.pulse !== undefined ? { '--pd': `${-route.pulse}s` } : undefined}
                      d={route.d}
                    />
                    {route.trace && <path className="maze-trace" d={route.d} pathLength="1" />}
                    {route.breathe && <path className="maze-breathe" d={route.d} pathLength="1" />}
                    {route.light !== undefined && <path className="maze-light" style={{ '--ld': `${-route.light}s` }} d={route.d} pathLength="1" />}
                    {route.signal && !reduced && (
                      <circle className="maze-signal" r="3.4">
                        <animateMotion dur={`${route.signal}s`} begin={`${-route.signal * 0.37}s`} repeatCount="indefinite" path={route.d} />
                        <animate attributeName="opacity" values="0;0.85;0.85;0" keyTimes="0;0.08;0.92;1" dur={`${route.signal}s`} begin={`${-route.signal * 0.37}s`} repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                ))}
              </g>
            ))}
            {MAZE_NODES[name].map((node) => (
              <circle key={`${node.x}-${node.y}`} className={`maze-node tint-${node.c}`} cx={node.x} cy={node.y} r="6" />
            ))}
          </g>
        ))}
        {sweepToken > 0 && !reduced && <path key={sweepToken} className="maze-go" d={SWEEP_D} pathLength="1" />}
      </svg>

      <div className="env-cells">
        {CELL_ART.map((cell, index) => (
          <div
            key={cell.id}
            ref={(el) => { cellRefs.current[index] = el }}
            className={`env-cell cell-${cell.hue}`}
          >
            <svg viewBox="0 0 200 200" focusable="false">
              <path d={cell.membrane} className="cell-membrane" />
              <path d={cell.inner} className="cell-inner" />
              <path d={cell.nucleus} className="cell-nucleus" />
              {cell.organelles.map((o, i) => (
                <circle key={i} cx={o.cx} cy={o.cy} r={o.r} className={o.accent ? 'cell-organelle cell-accent' : 'cell-organelle'} />
              ))}
            </svg>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Environment
