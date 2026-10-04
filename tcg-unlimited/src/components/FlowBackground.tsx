import { useEffect, useRef, type CSSProperties } from "react";
import { backgroundAccent } from "../colors";
import "./FlowBackground.css";

const vertexSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_accent;

  float hash(float n) {
    return fract(sin(n * 127.1 + 311.7) * 43758.5453);
  }

  void main() {
    // Emit card-shaped particles diagonally from the upper-left corner.
    vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y)
      / u_resolution.y;
    float aspect = u_resolution.x / u_resolution.y;
    vec3 color = vec3(0.003) + u_accent * exp(-length(p) * 1.8) * 0.16;
    float particles = 0.0;
    float aa = 1.5 / u_resolution.y;

    for (int i = 0; i < 44; i++) {
      float seed = float(i) + 1.0;
      float phase = fract(hash(seed) + u_time * (0.018 + hash(seed + 8.0) * 0.012));
      float direction = 0.25 + hash(seed + 40.0) * 1.05;
      vec2 center = vec2(-0.025) + vec2(cos(direction), sin(direction))
        * phase * length(vec2(aspect, 1.0)) * 1.18;
      float angle = seed * 1.7 + u_time * (hash(seed + 17.0) - 0.5) * 0.2;
      vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (p - center);
      float size = (0.009 + hash(seed + 52.0) * 0.015) * (0.6 + phase);
      vec2 edges = abs(q) - vec2(size * (5.0 / 7.0), size);
      float distanceToCard = length(max(edges, 0.0)) + min(max(edges.x, edges.y), 0.0);
      float fill = 1.0 - smoothstep(-aa, aa, distanceToCard);
      float fade = smoothstep(0.0, 0.035, phase) * (1.0 - smoothstep(0.6, 1.0, phase));
      particles = max(particles, fill * fade * (0.55 + hash(seed + 70.0) * 0.45));
    }

    color += u_accent * particles;
    gl_FragColor = vec4(color, 1.0);
  }
`;

type Resources = {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  position: number;
  resolution: WebGLUniformLocation;
  time: WebGLUniformLocation;
  accent: WebGLUniformLocation;
};

function createResources(gl: WebGLRenderingContext): Resources | null {
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Shader unavailable");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compilation failed");
    }
    return shader;
  };

  try {
    const vertex = compile(gl.VERTEX_SHADER, vertexSource);
    const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) throw new Error("Program unavailable");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Shader link failed");
    }

    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Buffer unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );

    const position = gl.getAttribLocation(program, "a_position");
    const resolution = gl.getUniformLocation(program, "u_resolution");
    const time = gl.getUniformLocation(program, "u_time");
    const accent = gl.getUniformLocation(program, "u_accent");
    if (position < 0 || !resolution || !time || !accent)
      throw new Error("Shader input unavailable");

    return { program, buffer, position, resolution, time, accent };
  } catch {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) {
      gl.deleteProgram(program);
      program = null;
    }
    return null;
  } finally {
    for (const shader of shaders) {
      if (program) gl.detachShader(program, shader);
      gl.deleteShader(shader);
    }
  }
}

export default function FlowBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    if (!gl) return;
    const context = gl;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let resources: Resources | null = null;
    let frame = 0;
    let elapsed = 0;
    let lastTick = 0;
    let lastDraw = 0;
    let disposed = false;

    function pause() {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }

    function draw() {
      if (!resources || context.isContextLost()) return;
      context.viewport(0, 0, canvas!.width, canvas!.height);
      context.useProgram(resources.program);
      context.bindBuffer(context.ARRAY_BUFFER, resources.buffer);
      context.enableVertexAttribArray(resources.position);
      context.vertexAttribPointer(
        resources.position,
        2,
        context.FLOAT,
        false,
        0,
        0,
      );
      context.uniform2f(resources.resolution, canvas!.width, canvas!.height);
      context.uniform1f(resources.time, motion.matches ? 0 : elapsed);
      const hex = backgroundAccent.hex;
      context.uniform3f(
        resources.accent,
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      );
      context.drawArrays(context.TRIANGLES, 0, 3);
      canvas!.dataset.ready = "true";
    }

    function animate(now: number) {
      if (disposed || document.hidden || motion.matches || !resources) {
        frame = 0;
        return;
      }
      elapsed += Math.min((now - lastTick) / 1000, 0.1);
      lastTick = now;
      // Slow ambient motion needs only 30 frames per second.
      if (now - lastDraw >= 1000 / 30) {
        draw();
        lastDraw = now;
      }
      frame = window.requestAnimationFrame(animate);
    }

    function resume() {
      pause();
      if (!resources || disposed || document.hidden) return;
      draw();
      if (!motion.matches) {
        lastTick = performance.now();
        lastDraw = lastTick;
        frame = window.requestAnimationFrame(animate);
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, window.innerWidth * dpr);
      const height = Math.max(1, window.innerHeight * dpr);
      const scale = Math.min(1, Math.sqrt(2_000_000 / (width * height)));
      canvas!.width = Math.max(1, Math.round(width * scale));
      canvas!.height = Math.max(1, Math.round(height * scale));
      if (!document.hidden) draw();
    }

    function initialize() {
      resources = createResources(context);
      resize();
      resume();
    }

    function onContextLost(event: Event) {
      event.preventDefault();
      pause();
      resources = null;
      delete canvas!.dataset.ready;
    }

    function onContextRestored() {
      if (!disposed) initialize();
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", resume);
    motion.addEventListener("change", resume);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    initialize();

    return () => {
      disposed = true;
      pause();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", resume);
      motion.removeEventListener("change", resume);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      if (resources) {
        context.deleteBuffer(resources.buffer);
        context.deleteProgram(resources.program);
      }
      delete canvas.dataset.ready;
    };
  }, []);

  return (
    <div
      className="flow-background"
      aria-hidden="true"
      data-accent={backgroundAccent.id}
      style={
        {
          "--background-accent": backgroundAccent.hex,
          "--background-tint": `${backgroundAccent.hex}29`,
        } as CSSProperties
      }
    >
      <div className="flow-background__fallback" />
      <canvas ref={canvasRef} className="flow-background__canvas" />
    </div>
  );
}
